# Changelog

## 0.2.0

- Require Effect `^4.0.0`. Effect 4.0.0 moved `effect/unstable/*` to `effect/*`
  with no compatibility exports. The benchmark entries (`./benchmark/http`,
  `./benchmark/cli`, `ch-bench`) now import `effect/http`, so 0.1.x fails there on
  stable Effect 4 and 0.2.0 fails there on the prereleases; the builder entries
  are unaffected either way.

## 0.1.4

- Restore the non-null result types of `sum`, `sumIf`, `toFloat64OrZero`, `.add()`,
  `.sub()`, and `.mul()` that 0.1.1 widened to `number | null`. A non-finite result, which
  ClickHouse JSON sends as `null`, now decodes as `NaN` instead. Results over SQL Nullable
  inputs still decode `null` as `null`.

## 0.1.3

- Require Effect `>=4.0.0-rc.113`. The benchmark HTTP config uses the renamed
  `Config.String` / `Config.Redacted` constructors; on rc.113+ the old
  lowercase names threw `Config.string is not a function` at import.

## 0.1.2 — unreleased

- Preserve `arrayFilter` element types and nullability through selected rows,
  and reject non-array inputs at compile time.
- Reject array and boolean timestamp expressions in `windowFunnel` and
  `sequenceMatch`.
- Expose unspecified codec representations as `unknown` instead of `any`.
  Consumers must narrow encoded values before using them; concrete column
  codecs retain their known wire types.

## 0.1.1 — unreleased

- Include scalar and predicate subqueries in tenant-scope inference, preserving
  scope through expression composition. Handwritten subquery strings are
  conservatively classified as cross-tenant.
- Derive `arrayOf` codecs from every element, preserving nullable values and
  leaving arrays with untyped elements unvalidated.

- Qualify source columns to prevent SELECT aliases from changing tenant filters.
- Preserve column literal codecs through derived sources and evaluate join callbacks
  during compilation with both sources' codecs.
- Preserve nullable array insertions, string conversions, conditional fallbacks, and
  DateTime64 precision when combining built-in result codecs.
- Decode numeric overflow as JSON `null`; arithmetic, sums, and floating-point string
  conversion now expose nullable result types where needed.
- Normalize timezone offsets before flooring DateTime parameters to seconds.
- Compare benchmark results with lossless numeric hashes. Regenerate saved baselines
  to use the new `json-exact-v1` hash format.
- Correct FORMAT-clause detection around identifiers and remove statement terminators
  followed by comments before rewriting SQL.

## 0.1.0 — unreleased

First public release.

- Type-safe table definitions, immutable query builder, joins, subqueries,
  unions, and CTEs.
- Parameterised compilation: `param.string` / `int` / `float` / `bool` /
  `dateTime`. Values are checked against the declared kind at compile time — a
  param with no value, a `Date` where a string was declared, or a fraction where
  an integer was, throws `QueryBuilderError` instead of becoming SQL text.
- Optional per-table tenant scoping: declare `{ tenantColumn }` on a table and
  every compiled query reports whether it pinned a single tenant. Reported,
  never enforced; tables that declare nothing compile `"untenanted"`.
- `route(tag)` carries an opaque execution tag through to the compiled query
  as a type-level fact.
- Schema-first column types: `T.uint64` and friends are Effect `Schema`s, not
  phantom tags, so `compile` derives each query's row schema from its SELECT and
  `decodeRows` validates without a hand-written schema. `rowSchemaSource` says
  whether it was `"derived"`, `"declared"`, or `"none"` (some selected
  expression had no type to read). A declared schema still wins, and can narrow.
- Wire quirks modelled once in the types: 64-bit integers accept ClickHouse's
  quoted form and Tinybird's bare numbers; `T.dateTime` parses the tz-less
  `YYYY-MM-DD hh:mm:ss` shape as UTC into a `DateTime.Utc`, with
  `T.dateTimeString` for consumers that need the string exactly as sent.
- The encode direction of those same schemas writes every literal: comparing a
  column against a value encodes it through the column's type, so a `Map` writes
  as `map('k', 'v')`, an `Array` as `['a', 'b']`, a `Bool` as `1`/`0`, and a
  value the column cannot hold fails while the SQL is being built. Params
  resolve through the same path, and `param.of(type, name)` accepts any column
  type — including one declared with `T.custom(sql, schema)`.
- Compilation is Effect-returning. `compile` / `compileUnion` fail with a typed
  `QueryBuilderError` — a missing param value, a value the column cannot encode —
  instead of throwing, so a caller can handle one rather than crash. A throw that
  is not a `QueryBuilderError` stays a defect: it is a bug, not a condition.
  `compileUnsafe` / `compileUnionUnsafe` keep the throwing behaviour for fixtures
  and catalogs, where failing loudly is the contract.
- Schema-checked row decoding (`decodeRows` / `decodeFirstRow`). No `castRows`.
  When nothing could be derived, `untypedColumns` names the selected aliases
  responsible, so "this query decodes nothing" is not a dead end.
- `encodeRows` runs the row schema backwards, turning decoded rows into the wire
  shape ClickHouse sent. A service can hold the value worth computing with and
  still emit the exact bytes its own clients parse, rather than choosing.
- Every expression the package produces carries its type. Literals, the
  arithmetic operators, `Map` subscripts (`$.Attrs.get(k)` decodes as the map's
  value type), and every wrapped function declare what they return, so a query
  built from typed pieces derives a schema for the whole row rather than losing
  it to one untyped field.
- The escape hatches say so in their names. `rawExpr(sql, type)` requires the
  column type its SQL produces; `untypedExpr(sql)` is the version with no type,
  and `defineUntypedFn` the same for functions. `defineFn`'s result type is
  required, and may be a rule reading the type off the arguments — `sameAs(i)`,
  `firstTyped()`, `elementOf(i)`, `arrayOfArg(i)` — for the many ClickHouse
  functions that hand back one of their inputs.
- `T.aggregateState(fn, …args)` names an `AggregateFunction` state column: an
  opaque value an outer `-Merge` reads, never a row anyone decodes. Declaring
  one no longer costs its query the rest of its row schema.
- `T.int64`, and `arraySort` / `arrayReverseSort` / `arrayDistinct` /
  `arrayPushFront` / `arrayElement` / `hex` join the wrapped catalog.
- Requires Effect 4 (`effect@rc`) as a peer dependency.

## Unreleased

- Ship the reusable benchmark engine, HTTP transport and `ch-bench` CLI.
- Add Effect suite definitions, JSON protocol, capability checks, result verification,
  schema provenance, and multi-metric comparison gates.
- Include benchmark documentation and an agent playbook in the published package.

- Rename the public package and library directory to `@maple-dev/effect-clickhouse`
  and `lib/effect-clickhouse`; retain the `ch-bench` executable.
