import type { CHQuery } from "./query"

type RenderSubquery = (query: string | CHQuery<any, any, any>) => string

// Compilation is synchronous. Save/restore makes nested compilations independent,
// including when a callback throws. No context survives across Effect executions.
let current: RenderSubquery | undefined

export function withSubqueryCompiler<A>(render: RenderSubquery, body: () => A): A {
	const previous = current
	current = render
	try {
		return body()
	} finally {
		current = previous
	}
}

export const renderSubquery = (query: string | CHQuery<any, any, any>, fallback: RenderSubquery): string =>
	(current ?? fallback)(query)
