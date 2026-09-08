import { describe, expect, it } from "vitest"
import { canonicalResultRows } from "./result-json"

describe("lossless result canonicalization", () => {
	it("distinguishes decimals and integers beyond Number precision", () => {
		for (const [a, b] of [
			["1.000000000000000001", "1.000000000000000002"],
			["9007199254740992", "9007199254740993"],
			["1e1000", "1e1001"],
		]) expect(canonicalResultRows(`{"x":${a}}`)).not.toEqual(canonicalResultRows(`{"x":${b}}`))
	})
	it("normalizes equivalent numeric spellings without precision loss", () => {
		for (const [a, b] of [
			["1", "1.00e+0"], ["0", "-0.000e999"],
			["123000", "0.123e6"], ["-0.00123", "-123e-5"],
		]) expect(canonicalResultRows(`{"x":${a}}`)).toEqual(canonicalResultRows(`{"x":${b}}`))
	})
	it("sorts nested keys and preserves strings, array order, and duplicate values", () => {
		expect(canonicalResultRows('{"b":{"z":2,"a":1},"a":[1,1,2]}')).toEqual(
			canonicalResultRows('{"a":[1.0,1,2],"b":{"a":1,"z":2}}'),
		)
		expect(canonicalResultRows('{"a":"1"}')).not.toEqual(canonicalResultRows('{"a":1}'))
		expect(canonicalResultRows('{"a":[1,2]}')).not.toEqual(canonicalResultRows('{"a":[2,1]}'))
		expect(canonicalResultRows('{"a":[1,1]}')).not.toEqual(canonicalResultRows('{"a":[1]}'))
		expect(canonicalResultRows('{"a":1}\n{"a":1}\n')).toHaveLength(2)
		expect(canonicalResultRows('{"a":1,"a":2}')).not.toEqual(canonicalResultRows('{"a":2}'))
		expect(canonicalResultRows('{"é":1,"é":2}')).toEqual(canonicalResultRows('{"é":2,"é":1}'))
		expect(canonicalResultRows('{"a":"\\u0061\\n\\\""}')).toEqual(canonicalResultRows('{"a":"a\\n\\\""}'))
	})
	it.each(['{"a":1,}', '{"a":01}', '{"a":1e}', '{"a":NaN}', '{"a":[1,]}', '{"a":1} trailing', '[]', '{"a":"unterminated}'])("rejects malformed rows: %s", (text) => {
		expect(() => canonicalResultRows(text)).toThrow(SyntaxError)
	})
})
