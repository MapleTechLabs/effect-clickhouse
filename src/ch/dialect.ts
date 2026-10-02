// SQL Dialects
//
// What a compiled query needs to know about the database it is written for.
// The builder, the tenant analysis, and row decoding are the same for every
// database; a dialect is the part that is not. It starts small on purpose:
// how resolved param values reach the server. Identifier quoting, string
// escaping, and clause rendering move behind it in later steps (see
// `design/dialects.md`).

import { sqlLiteral } from "./literal"

/**
 * How resolved param values reach the server.
 *
 * `inline` writes each value into the SQL text as a literal, which is what
 * ClickHouse over HTTP has always done here. `bind` leaves a placeholder in the
 * SQL and returns the encoded values in `CompiledQuery.parameters`, in
 * placeholder order, for a driver that binds them (`$1` for Postgres, `?` for
 * MySQL and SQLite).
 */
export type ParamStyle =
	| {
			readonly _tag: "inline"
			/** An encoded value as a literal in this dialect's syntax. Throws a
			 *  `QueryBuilderError` for a value it cannot write. */
			readonly literal: (value: unknown, context: string) => string
	  }
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

export interface Dialect {
	/** Shown in errors and on the compiled query. */
	readonly name: string
	readonly params: ParamStyle
}

/** ClickHouse, with params written into the SQL as literals. The default. */
export const clickhouseDialect: Dialect = {
	name: "clickhouse",
	params: { _tag: "inline", literal: sqlLiteral },
}

