// Literal syntax of the dialect being compiled for.
//
// Literals are written while a query's callbacks run, deep inside expression
// code that has no dialect argument to read. `compile` installs the dialect's
// syntax here for the duration of the compile instead, the same way
// `withSubqueryCompiler` hands down the subquery renderer. A leaf module so the
// fragment renderer can read it without importing the builder.

export interface LiteralSyntax {
	/** A string as a quoted literal. */
	readonly quoteString: (value: string) => string
	/** An encoded wire value (string, number, boolean, null, arrays and records
	 *  of those) as a literal. Throws for a value it cannot write. */
	readonly literal: (value: unknown, context: string) => string
}

// Compilation is synchronous. Save/restore makes nested compilations
// independent, including when a callback throws.
let current: LiteralSyntax | undefined

export function withLiteralSyntax<A>(syntax: LiteralSyntax, body: () => A): A {
	const previous = current
	current = syntax
	try {
		return body()
	} finally {
		current = previous
	}
}

/** The syntax installed by the enclosing compile, if there is one. */
export const activeLiteralSyntax = (): LiteralSyntax | undefined => current
