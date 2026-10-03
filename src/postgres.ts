// @maple-dev/effect-clickhouse/postgres
//
// Postgres for the same query builder. Build queries with the root entry
// (`table`, `from`, `param`, `unionAll`, the shared operators); declare
// columns with the types here and compile with the `compile` here, which
// defaults to the Postgres dialect. See docs/postgres.md.

import {
	compileCH,
	compileCHUnsafe,
	compileUnion as compileUnionCH,
	compileUnionUnsafe as compileUnionUnsafeCH,
} from "./ch/compile"
import { postgresDialect } from "./pg/dialect"

export { postgresDialect }
export * from "./pg/types"
export * from "./pg/functions"

/** `compile` from the root entry, for Postgres unless `options.dialect` says otherwise. */
export const compile: typeof compileCH = (query, params, options) =>
	compileCH(query, params, { ...options, dialect: options?.dialect ?? postgresDialect })

/** `compileUnsafe` from the root entry, for Postgres. */
export const compileUnsafe: typeof compileCHUnsafe = (query, params, options) =>
	compileCHUnsafe(query, params, { ...options, dialect: options?.dialect ?? postgresDialect })

/** `compileUnion` from the root entry, for Postgres. */
export const compileUnion: typeof compileUnionCH = (union, params, options) =>
	compileUnionCH(union, params, { ...options, dialect: options?.dialect ?? postgresDialect })

/** `compileUnionUnsafe` from the root entry, for Postgres. */
export const compileUnionUnsafe: typeof compileUnionUnsafeCH = (union, params, options) =>
	compileUnionUnsafeCH(union, params, { ...options, dialect: options?.dialect ?? postgresDialect })
