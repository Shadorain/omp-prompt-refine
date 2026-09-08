import { describe, expect, test } from "bun:test";
import { parseRefineResult } from "../src/parse-result.ts";

describe("parseRefineResult", () => {
	test("parses a raw JSON object", () => {
		expect(parseRefineResult('{"prompt":"Do X","notes":["Added a stop condition"]}')).toEqual({
			prompt: "Do X",
			notes: ["Added a stop condition"],
		});
	});

	test("parses fenced JSON", () => {
		const text = "```json\n{\"prompt\":\"Keep it blue\",\"notes\":[]}\n```";
		expect(parseRefineResult(text)).toEqual({ prompt: "Keep it blue", notes: [] });
	});

	test("rejects empty prompt", () => {
		expect(() => parseRefineResult('{"prompt":"  ","notes":[]}')).toThrow(/empty/i);
	});

	test("rejects invalid JSON", () => {
		expect(() => parseRefineResult("sure, here is a better prompt")).toThrow(/JSON/i);
	});
});
