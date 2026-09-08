import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { makeHttpClient, makeHttpTransport } from "../src/benchmark/http"
import { benchmarkSql } from "../src/benchmark/sql"
import { parseStatement, withFormat } from "../src/sql/statement"

const endpoint = process.env.EFFECT_CLICKHOUSE_TEST_URL
describe.skipIf(!endpoint)("benchmark result and statement regressions against ClickHouse", () => {
	const client = makeHttpClient({
		url: endpoint ?? "http://localhost:8123",
		user: process.env.EFFECT_CLICKHOUSE_TEST_USER ?? "default",
		password: process.env.EFFECT_CLICKHOUSE_TEST_PASSWORD ?? "",
	})
	const transport = makeHttpTransport(client, {
		timeoutSeconds: 10,
		logWaitSeconds: 0,
		verifyResults: true,
		resultOrder: "ordered",
	})
	it.each([
		["toDecimal128('1.000000000000000001',18)", "toDecimal128('1.000000000000000002',18)"],
		["9007199254740992::UInt64", "9007199254740993::UInt64"],
	])("hashes distinct exact numbers differently: %s", async (a, b) => {
		const hash = (expression: string) => Effect.runPromise(transport.execute(benchmarkSql(
			`SELECT ${expression} AS x`, { output_format_json_quote_64bit_integers: "0" }, "JSONEachRow",
		)))
		expect((await hash(a)).resultHash).not.toBe((await hash(b)).resultHash)
	})
	it.each([
		"WITH 1 AS format SELECT format JSON",
		"WITH 1 AS format SELECT 1 + format JSON",
		"WITH 1 AS format SELECT 2, format JSON",
		"SELECT t.format JSON FROM (SELECT 1 AS format) t",
		"SELECT 'literal' AS x /* comment */",
	])("replays identifiers and literals with a new format: %s", async (sql) => {
		const response = await Effect.runPromise(client.query(benchmarkSql(sql, { max_threads: "1" }, "JSONEachRow")))
		expect(response.status).toBe(200)
	})
	it("honors ordered/unordered modes and retains duplicate rows", async () => {
		const query = (values: string, direction: "ASC" | "DESC", mode: "ordered" | "unordered") =>
			Effect.runPromise(transport.execute(
				`SELECT x FROM values('x UInt64', ${values}) ORDER BY x ${direction} FORMAT JSONEachRow`, mode,
			))
		const ascending = await query("1, 1, 2", "ASC", "unordered")
		expect((await query("1, 1, 2", "DESC", "unordered")).resultHash).toBe(ascending.resultHash)
		expect((await query("1, 2", "ASC", "unordered")).resultHash).not.toBe(ascending.resultHash)
		expect((await query("1, 1, 2", "ASC", "ordered")).resultHash).not.toBe(
			(await query("1, 1, 2", "DESC", "ordered")).resultHash,
		)
	})

	it("replaces a format with a commented trailing terminator", async () => {
		const statement = withFormat(parseStatement("SELECT 1 FORMAT JSONEachRow; -- tail"), "FORMAT CSV")
		expect((await Effect.runPromise(client.query(statement.text))).body).toBe("1\n")
	})
})
