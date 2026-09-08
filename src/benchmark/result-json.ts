/** Canonical JSON rows without routing ClickHouse Decimal/UInt64 values through Number. */
export const canonicalResultRows = (text: string): string[] => {
	const canonicalRow = (source: string): string => {
		let offset = 0
		const whitespace = () => {
			while (/[ \t\r\n]/.test(source[offset] ?? "") && offset < source.length) offset++
		}
		const invalid = (): never => {
			throw new SyntaxError(`Invalid result JSON at offset ${offset}`)
		}
		const string = (): string => {
			const start = offset++
			while (offset < source.length) {
				const character = source[offset++]
				if (character === "\\") offset++
				else if (character === '"') return JSON.parse(source.slice(start, offset)) as string
			}
			return invalid()
		}
		const value = (): string => {
			whitespace()
			const character = source[offset]
			if (character === '"') return JSON.stringify(string())
			if (character === "{" || character === "[") {
				const object = character === "{"
				const closing = object ? "}" : "]"
				offset++
				whitespace()
				const entries: Array<{ key: string; value: string }> = []
				if (source[offset] !== closing) {
					while (true) {
						whitespace()
						let key = ""
						if (object) {
							if (source[offset] !== '"') return invalid()
							key = string()
							whitespace()
							if (source[offset++] !== ":") return invalid()
						}
						entries.push({ key, value: value() })
						whitespace()
						if (source[offset] !== ",") break
						offset++
					}
				}
				if (source[offset++] !== closing) return invalid()
				// Keep duplicate keys as well as duplicate array elements. JSON.parse would erase them.
				if (object) entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
				return (
					character +
					entries
						.map((entry) => (object ? `${JSON.stringify(entry.key)}:${entry.value}` : entry.value))
						.join(",") +
					closing
				)
			}
			const literal = /^(true|false|null)/.exec(source.slice(offset))
			if (literal) {
				offset += literal[0].length
				return literal[0]
			}
			const number = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?/.exec(source.slice(offset))
			if (!number) return invalid()
			offset += number[0].length
			const fraction = number[3] ?? ""
			const digits = (number[2] + fraction).replace(/^0+/, "")
			if (!digits) return "0"
			const coefficient = digits.replace(/0+$/, "")
			const exponent =
				BigInt(number[4] ?? "0") - BigInt(fraction.length) + BigInt(digits.length - coefficient.length)
			return `${number[1]}${coefficient}e${exponent}`
		}
		whitespace()
		if (source[offset] !== "{") return invalid()
		const result = value()
		whitespace()
		if (offset !== source.length) return invalid()
		return result
	}
	return text.trim() ? text.trim().split("\n").map(canonicalRow) : []
}
