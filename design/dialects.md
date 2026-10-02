# Dialects: one builder, several databases

Status: steps 1 and 2 landed (params and literals go through a `Dialect`). Steps 3 to 6 are open.

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
2. **Literals behind the dialect (done).** `Dialect.quoteString` and `Dialect.literal` write
   every `Str` fragment, column literal, and inline param. `compile` installs the dialect for
   the length of the compile (`withDialect`, the same save/restore pattern as
   `withSubqueryCompiler`), because literals are written inside the query callbacks, which
   have no dialect argument. The `__PARAM_` safety is now enforced rather than assumed: a
   literal that contains the marker fails with `InvalidLiteral`, so a dialect with weaker
   escaping cannot turn a value into a placeholder.
3. **Identifier quoting.** Postgres folds unquoted names to lower case, so `OrgId` must be
   written `"OrgId"`. Column refs, aliases, qualified names, `groupBy` keys and `orderBy`
   specs are raw text today (`raw(name)` in `expr.ts`, `orderByClause` in `compile.ts`), so
   this is its own step: column refs become `Ident` fragments that carry their qualifier.
4. **Split `CHType`.** A logical type (`sql` name, TS type) plus a codec for the transport. The
   UInt64-as-string rule belongs to ClickHouse's `FORMAT JSON` over HTTP, not to ClickHouse;
   the native client sends something else, and Postgres drivers send int8 as a string and
   timestamptz as a `Date`.
5. **Move `compile.ts` into `ClickHouseDialect.buildSelect(state)`.** `compileQuery` and the
   terminal clauses (`FORMAT`, `SETTINGS`, `LIMIT BY`) become ClickHouse-only.
6. **Postgres dialect.** `pg.T` column types, `$n` binding, `"ident"` quoting, a function
   catalog covering the common cases (`FILTER (WHERE ...)`, `date_bin`, `percentile_cont`,
   jsonb access), and capability flags for what ClickHouse allows and Postgres does not
   (select aliases in `WHERE`/`HAVING`, default values instead of `NULL` in outer joins).

## Open questions

- ClickHouse also supports server-side binding (`{name:Type}` with `query_params`). Adding it
  needs the param kind to name a ClickHouse type, which `param.of` already has.
- Whether the package splits (`core`, `clickhouse`, `postgres` entry points) at step 4 or 5.
