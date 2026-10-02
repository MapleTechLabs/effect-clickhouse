# Dialects: one builder, several databases

Status: step 1 landed (params go through a `Dialect`). Steps 2 to 5 are open.

## Goal

Keep one query builder, one tenant-scope analysis, and one row-decoding model, and let the
database-specific parts (SQL syntax, literals, param binding, column wire formats, the
function catalog) vary per dialect. ClickHouse output stays byte-identical at every step; the
exact-SQL tests in `src/ch/compile.test.ts` are the guard.

## What we took from Kysely and Drizzle

Both were read from source (Kysely 0.28.17, Drizzle 1.0.0-rc.5).

| Idea | Where it comes from | How it lands here |
| --- | --- | --- |
| Builders produce a config object; a dialect turns it into SQL | Drizzle `PgDialect.buildSelectQuery(config)` | `CHQueryState` already is that config. `compile.ts` becomes the ClickHouse dialect's `buildSelect` |
| SQL as a chunk tree rendered at the end with `escapeName` / `escapeParam` / `escapeString` | Drizzle `SQL` chunks + `BuildQueryConfig` | `SqlFragment` gets a real `Param` chunk; `Str`/`Lazy` stop rendering ClickHouse text early |
| Inline vs bound params as a switch | Drizzle `inlineParams` | `ParamStyle`: `inline` (ClickHouse today) or `bind` |
| A small override surface per dialect | Kysely `DefaultQueryCompiler` hooks (MySQL overrides ~10 methods) | The `Dialect` interface grows hook by hook, never a copy of the compiler |
| Capability flags instead of dialect checks | Kysely `DialectAdapter` (`supportsReturning`, ...) | Flags such as `supportsFilterClause`, `aliasInWhere`, `limitBy` |
| A compiled query that keeps its structure | Kysely `CompiledQuery.query` | `CompiledQuery` already carries tenant scope and row schema; `parameters` added in step 1 |
| Rewrites as passes over the tree | Kysely plugins (`transformQuery` / `transformResult`) | Tenant-scope proof and empty-`IN` handling as passes over the state |
| Logical type separate from how a driver sends it | Drizzle v1 codecs, `refineGenericPgCodecs` per driver | `CHType` splits into a type and a transport codec (step 3) |
| Shared operators, per-dialect function catalogs | Drizzle `sql/expressions` vs `pg-core` / `mysql-core` | `eq`, `and`, `in_` in core; `countIf`, `percentileCont` per dialect |

What we deliberately do not copy:

- Kysely decodes nothing at runtime; its row types are a promise. Our schema-backed
  `decodeRows` stays.
- Drizzle copies the whole query builder per dialect package. We share the builder and vary
  only types and functions.
- Tenant scoping stays a proof, not a plugin that injects `OrgId = ...`. Injection would hide a
  missing tenant condition instead of reporting it.

## Steps

1. **Params through a dialect (done).** `renderParams` resolves placeholders once, at the top
   of the statement, so a binding dialect can number them across unions and subqueries.
   `CompiledQuery.parameters` holds the bound values. Tenant bounds still render as ClickHouse
   literals, since they are compared as text and never sent.
2. **Escaping behind the dialect.** `Str` and `Ident` render through
   `dialect.escapeString` / `dialect.quoteIdent`. The `__PARAM_` placeholder safety currently
   depends on ClickHouse escaping (`\x5F`); a dialect must state how it keeps a user value from
   spelling a placeholder (Postgres: `E'...'` strings, or bind every literal).
3. **Split `CHType`.** A logical type (`sql` name, TS type) plus a codec for the transport. The
   UInt64-as-string rule belongs to ClickHouse's `FORMAT JSON` over HTTP, not to ClickHouse;
   the native client sends something else, and Postgres drivers send int8 as a string and
   timestamptz as a `Date`.
4. **Move `compile.ts` into `ClickHouseDialect.buildSelect(state)`.** `compileQuery` and the
   terminal clauses (`FORMAT`, `SETTINGS`, `LIMIT BY`) become ClickHouse-only.
5. **Postgres dialect.** `pg.T` column types, `$n` binding, `"ident"` quoting, a function
   catalog covering the common cases (`FILTER (WHERE ...)`, `date_bin`, `percentile_cont`,
   jsonb access), and capability flags for what ClickHouse allows and Postgres does not
   (select aliases in `WHERE`/`HAVING`, default values instead of `NULL` in outer joins).

## Open questions

- ClickHouse also supports server-side binding (`{name:Type}` with `query_params`). Adding it
  needs the param kind to name a ClickHouse type, which `param.of` already has.
- Whether the package splits (`core`, `clickhouse`, `postgres` entry points) at step 4 or 5.
