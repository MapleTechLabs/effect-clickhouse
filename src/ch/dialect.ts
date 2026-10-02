// SQL Dialects
//
// What a compiled query needs to know about the database it is written for.
// The builder, the tenant analysis, and row decoding are the same for every
// database; a dialect is the part that is not: how literals are written and how
// resolved param values reach the server. Identifier quoting, clause rendering,
// and column wire formats move behind it in later steps (see
// `design/dialects.md`).

import { quoteClickHouseString } from "../sql/sql-fragment"
import { activeLiteralSyntax, withLiteralSyntax, type LiteralSyntax } from "../sql/literal-syntax"
import { QueryBuilderError } from "./errors"
import { sqlLiteral } from "./literal"
import { PARAM_MARKER_PREFIX } from "./param"

/**
 * How resolved param values reach the server.
 *
 * `inline` writes each value into the SQL text with the dialect's `literal`,
 * which is what ClickHouse over HTTP has always done here. `bind` leaves a
 * placeholder in the SQL and returns the encoded values in
 * `CompiledQuery.parameters`, in placeholder order, for a driver that binds
 * them (`$1` for Postgres, `?` for MySQL and SQLite).
 */
export type ParamStyle =
	| { readonly _tag: "inline" }
	| {
			readonly _tag: "bind"
			/** The placeholder for the value at 1-based `index`. */
			readonly placeholder: (index: number) => string
			/**
			 * Whether one placeholder may stand for every use of the same param.
			 *
			 * True for numbered placeholders (`$1` can appear twice); false for
			 * positional ones (`?` binds the next value each time it appears), where
			 * a param used twice is bound twice.
			 */
			readonly reuse: boolean
	  }

/**
 * A database the builder writes SQL for.
 *
 * `quoteString` and `literal` must escape so that no value can spell the param
 * marker (`__PARAM_`) in the rendered SQL: params are resolved by rewriting the
 * finished text, so a value that spelled one would be rewritten too. A literal
 * that does is refused at compile time rather than trusted.
 */
export interface Dialect extends LiteralSyntax {
	/** Shown in errors. */
	readonly name: string
	readonly params: ParamStyle
}

/** ClickHouse, with params written into the SQL as literals. The default. */
export const clickhouseDialect: Dialect = {
	name: "clickhouse",
	quoteString: quoteClickHouseString,
	literal: sqlLiteral,
	params: { _tag: "inline" },
}

// The dialect of the enclosing compile, beside the syntax installed for the
// fragment renderer. Same save/restore discipline as `withLiteralSyntax`.
let current: Dialect | undefined

/** The dialect of the enclosing compile, or ClickHouse outside one. */
export const currentDialect = (): Dialect => current ?? clickhouseDialect

/** Run `body` with `dialect`'s literal syntax installed, checked as above. */
export function withDialect<A>(dialect: Dialect, body: () => A): A {
	// A nested compile for the dialect already installed keeps the checked
	// syntax that is there instead of wrapping it again.
	if (current === dialect && activeLiteralSyntax() !== undefined) return body()
	const previous = current
	current = dialect
	try {
		return withLiteralSyntax(checkedSyntax(dialect), body)
	} finally {
		current = previous
	}
}

/** `dialect.literal`, checked as above. For params written in after the
 *  callbacks have run, outside any installed syntax. */
export const checkedLiteral = (dialect: Dialect, value: unknown, context: string): string =>
	checked(dialect, dialect.literal(value, context), context)

const checkedSyntax = (dialect: Dialect): LiteralSyntax => ({
	quoteString: (value) => checked(dialect, dialect.quoteString(value), "a string literal"),
	literal: (value, context) => checkedLiteral(dialect, value, context),
})

const checked = (dialect: Dialect, sql: string, context: string): string => {
	if (sql.includes(PARAM_MARKER_PREFIX)) {
		throw new QueryBuilderError({
			code: "InvalidLiteral",
			message: `${context}: the ${dialect.name} dialect wrote a literal containing the reserved param marker \`${PARAM_MARKER_PREFIX}\``,
		})
	}
	return sql
}
