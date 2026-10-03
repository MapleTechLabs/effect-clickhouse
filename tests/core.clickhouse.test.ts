import { Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { describe, expect, it } from "@effect/vitest"
import { clickhouseContext, coreCases, coreSkips, expectedFor } from "./core-cases"
import { endpoint, execute } from "./clickhouse-support"

it.layer(FetchHttpClient.layer)("core builder suite on ClickHouse", (it) => {
	describe.skipIf(!endpoint)("live", () => {
		for (const [target, setting] of [
			["clickhouse", "0"],
			["clickhouse-join-nulls", "1"],
		] as const) {
			for (const fixture of coreCases) {
				if (fixture.rejects?.clickhouse || Object.hasOwn(coreSkips.clickhouse, fixture.id)) continue
				it.effect(`${fixture.id} (${target})`, () =>
					Effect.gen(function* () {
						const compiled = fixture.build(clickhouseContext)
						if (fixture.metadata) expect(compiled).toMatchObject(fixture.metadata)
						const { rows } = yield* execute(
							compiled,
							{ output_format_json_quote_64bit_integers: setting, join_use_nulls: setting },
							fixture.format,
						)
						expect(rows, compiled.sql).toEqual(expectedFor(fixture, target))
					}),
				)
			}
		}
	})
})
