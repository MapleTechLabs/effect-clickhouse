import { describe, expect, it } from "@effect/vitest"
import { compileCHUnsafe, compileUnionUnsafe } from "./compile"
import type { Dialect } from "./dialect"
import * as CH from "./index"

const numbered: Dialect = {
	name: "numbered",
	params: { _tag: "bind", placeholder: (index) => `$${index}`, reuse: true },
}

const positional: Dialect = {
	name: "positional",
	params: { _tag: "bind", placeholder: () => "?", reuse: false },
}

const events = CH.table(
	"events",
	{ OrgId: CH.string, Service: CH.string, Count: CH.uint64, Timestamp: CH.dateTime64 },
	{ tenantColumn: "OrgId" },
)

const byService = CH.from(events)
	.select(($) => ({ count: $.Count }))
	.where(($) => [$.OrgId.eq(CH.param.string("orgId")), $.Service.eq(CH.param.string("service"))])

describe("dialect params", () => {
	it("ClickHouse writes params as literals and binds nothing", () => {
		const compiled = compileCHUnsafe(byService, { orgId: "org_1", service: "api" })
		expect(compiled.sql).toContain("OrgId = 'org_1'")
		expect(compiled.parameters).toEqual([])
		// Passing the default explicitly is the same compile.
		expect(compileCHUnsafe(byService, { orgId: "org_1", service: "api" }, { dialect: CH.clickhouseDialect }).sql).toBe(
			compiled.sql,
		)
	})

	it("a binding dialect leaves placeholders and returns values in order", () => {
		const compiled = compileCHUnsafe(byService, { orgId: "org_1", service: "api" }, { dialect: numbered })
		expect(compiled.sql).toContain("OrgId = $1")
		expect(compiled.sql).toContain("Service = $2")
		expect(compiled.sql).not.toContain("org_1")
		expect(compiled.parameters).toEqual(["org_1", "api"])
	})

	// The value is the column codec's wire form, the same thing an inline
	// literal is written from, not the JS value the caller passed.
	it("binds the encoded wire value", () => {
		const query = CH.from(events)
			.select(($) => ({ count: $.Count }))
			.where(($) => [$.OrgId.eq("org"), $.Timestamp.gte(CH.param.dateTime("start"))])
		const compiled = compileCHUnsafe(query, { start: new Date("2026-01-01T00:00:00.250Z") }, { dialect: numbered })
		expect(compiled.parameters).toEqual(["2026-01-01 00:00:00.250"])
	})

	it("numbered placeholders reuse one slot for a repeated param; positional ones bind it again", () => {
		const twice = CH.from(events)
			.select(($) => ({ count: $.Count }))
			.where(($) => [$.OrgId.eq(CH.param.string("orgId")), $.Service.neq(CH.param.string("orgId"))])
		const params = { orgId: "org_1" }

		const reused = compileCHUnsafe(twice, params, { dialect: numbered })
		expect(reused.sql).toContain("OrgId = $1")
		expect(reused.sql).toContain("Service != $1")
		expect(reused.parameters).toEqual(["org_1"])

		const repeated = compileCHUnsafe(twice, params, { dialect: positional })
		expect(repeated.parameters).toEqual(["org_1", "org_1"])
	})

	// Nested queries are spliced in as text, so placeholders have to be numbered
	// once across the whole statement, not restarted in each branch.
	it("numbers placeholders across union branches and subqueries", () => {
		const branch = (service: string) =>
			CH.from(events)
				.select(($) => ({ count: $.Count }))
				.where(($) => [$.OrgId.eq(CH.param.string("orgId")), $.Service.eq(CH.param.string(service))])

		const union = compileUnionUnsafe(
			CH.unionAll(branch("a"), branch("b")),
			{ orgId: "org_1", a: "api", b: "web" },
			{ dialect: numbered },
		)
		expect(union.parameters).toEqual(["org_1", "api", "web"])
		expect(union.sql.match(/\$\d/g)).toEqual(["$1", "$2", "$1", "$3"])

		const outer = compileCHUnsafe(
			CH.fromQuery(byService, "i")
				.select(($) => ({ total: CH.sum($.count) }))
				.where(($) => [$.count.gt(CH.param.int("min"))]),
			{ orgId: "org_1", service: "api", min: 5 },
			{ dialect: numbered },
		)
		expect(outer.parameters).toEqual(["org_1", "api", 5])
		expect(outer.tenantScope).toBe("single-tenant")
	})

	it("still fails a missing or ill-typed param at compile time", () => {
		expect(() => compileCHUnsafe(byService, { orgId: "org_1" }, { dialect: numbered })).toThrow(
			/no value given for param 'service'/,
		)
		expect(() => compileCHUnsafe(byService, { orgId: 1, service: "api" }, { dialect: numbered })).toThrow(
			/param 'orgId'/,
		)
	})
})
