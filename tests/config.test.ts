import { describe, expect, test } from "bun:test";
import { contextFileNames, DEFAULT_CONTEXT_FILES } from "../src/config.ts";
import { optionsMatchingQuery } from "../src/picker.ts";

describe("contextFileNames", () => {
	test("keeps the default files when no extras are set", () => {
		expect(contextFileNames()).toEqual([...DEFAULT_CONTEXT_FILES]);
	});

	test("appends extra files without duplicating defaults", () => {
		expect(contextFileNames(["NOTES.md", "AGENTS.md", "  SPEC.md  "])).toEqual([
			"AGENTS.md",
			"CLAUDE.md",
			"CONTEXT.md",
			"NOTES.md",
			"SPEC.md",
		]);
	});
});

describe("optionsMatchingQuery", () => {
	test("filters picker rows by label tokens", () => {
		const rows = optionsMatchingQuery(
			[
				{ label: "google-antigravity/gemini-flash" },
				{ label: "anthropic/claude-sonnet-5", description: "sonnet" },
			],
			"flash",
		);
		expect(rows.map((row) => row.label)).toEqual(["google-antigravity/gemini-flash"]);
	});
});
