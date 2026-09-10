import { describe, expect, test } from "bun:test";
import { draftFromEditor, parseRefineArgs, refineArgumentCompletions } from "../src/commands.ts";

describe("parseRefineArgs", () => {
	test("bare args are the prompt in default mode", () => {
		const result = parseRefineArgs("make this button blue");
		expect(result).toEqual({
			ok: true,
			mode: "default",
			prompt: "make this button blue",
		});
	});

	test("parses --light", () => {
		const result = parseRefineArgs("--light shorten this");
		expect(result).toEqual({
			ok: true,
			mode: "light",
			prompt: "shorten this",
		});
	});

	test("parses --deep before the prompt", () => {
		const result = parseRefineArgs("--deep redesign the auth layer");
		expect(result).toEqual({
			ok: true,
			mode: "deep",
			prompt: "redesign the auth layer",
		});
	});

	test("parses --model then remaining prompt", () => {
		const result = parseRefineArgs("--model @slow fix the race");
		expect(result).toEqual({
			ok: true,
			mode: "default",
			model: "@slow",
			prompt: "fix the race",
		});
	});

	test("parses --model=spec", () => {
		const result = parseRefineArgs("--model=provider/id:high do the thing");
		expect(result).toEqual({
			ok: true,
			mode: "default",
			model: "provider/id:high",
			prompt: "do the thing",
		});
	});

	test("flags may appear after the first prompt word", () => {
		const result = parseRefineArgs("fix login --deep --model @smol");
		expect(result).toEqual({
			ok: true,
			mode: "deep",
			model: "@smol",
			prompt: "fix login",
		});
	});

	test("multiline args after /refine keep the body", () => {
		const result = parseRefineArgs("--deep\nmake the checkout form validate on blur");
		expect(result).toEqual({
			ok: true,
			mode: "deep",
			prompt: "make the checkout form validate on blur",
		});
	});

	test("empty args yield empty prompt", () => {
		const result = parseRefineArgs("  ");
		expect(result).toEqual({ ok: true, mode: "default", prompt: "" });
	});

	test("rejects both --light and --deep", () => {
		const result = parseRefineArgs("--light --deep hello");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("--light");
	});

	test("rejects --model without a value", () => {
		const result = parseRefineArgs("--model");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("--model");
	});

	test("parses --no-context", () => {
		const result = parseRefineArgs("--no-context ship it");
		expect(result).toMatchObject({ ok: true, noContext: true, prompt: "ship it" });
	});

	test("parses --last without a prompt", () => {
		const result = parseRefineArgs("--last");
		expect(result).toMatchObject({ ok: true, last: true, prompt: "" });
	});

	test("rejects --last with extra prompt text", () => {
		const result = parseRefineArgs("--last also this");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("--last");
	});

	test("parses --undo alone", () => {
		expect(parseRefineArgs("--undo")).toEqual({ ok: true, action: "undo" });
	});

	test("parses --setup alone", () => {
		expect(parseRefineArgs("--setup")).toEqual({ ok: true, action: "setup" });
	});

	test("rejects --undo mixed with other flags", () => {
		const result = parseRefineArgs("--undo --light");
		expect(result.ok).toBe(false);
	});

	test("parses --interview with --deep", () => {
		const result = parseRefineArgs("--interview --deep fix login");
		expect(result).toMatchObject({ ok: true, interview: true, mode: "deep", prompt: "fix login" });
	});

	test("rejects --interview with --undo", () => {
		expect(parseRefineArgs("--interview --undo").ok).toBe(false);
	});
});

describe("draftFromEditor", () => {
	test("strips a leading /refine line and keeps the body", () => {
		const result = draftFromEditor("/refine --deep\nrewrite the onboarding email");
		expect(result).toEqual({
			ok: true,
			mode: "deep",
			prompt: "rewrite the onboarding email",
		});
	});

	test("plain editor text is the prompt", () => {
		const result = draftFromEditor("make this button blue");
		expect(result).toEqual({ ok: true, mode: "default", prompt: "make this button blue" });
	});

	test("bare /refine with no body is empty", () => {
		const result = draftFromEditor("/refine\n");
		expect(result).toEqual({ ok: true, mode: "default", prompt: "" });
	});
});

describe("refineArgumentCompletions", () => {
	test("lists optional prompt placeholder before flags", () => {
		const items = refineArgumentCompletions("");
		expect(items[0]).toMatchObject({
			value: "",
			label: "[prompt]",
		});
		expect(items[0]?.hint).toBeTruthy();
		expect(items.map((item) => item.value)).toEqual([
			"",
			"--light",
			"--deep",
			"--model",
			"--no-context",
			"--last",
			"--undo",
			"--setup",
			"--interview",
		]);
		for (const item of items.slice(1)) {
			expect(item.label).toContain(item.value);
		}
	});

	test("selecting a completion inserts the flag, not the description", () => {
		const light = refineArgumentCompletions("--l").find((item) => item.value === "--light");
		expect(light).toBeDefined();
		expect(light?.value).toBe("--light");
		expect(light?.label).toContain("--light");
		expect(light?.description).toBeTruthy();
		expect(light?.description).not.toContain("--light");
	});

	test("filters by flag prefix and hides the placeholder", () => {
		expect(refineArgumentCompletions("--d").map((item) => item.value)).toEqual(["--deep"]);
	});

	test("after --model, lists live model specs", () => {
		const values = refineArgumentCompletions("--model ", [
			"google-antigravity/gemini-flash",
			"anthropic/claude-sonnet-5",
		]).map((item) => item.value);
		expect(values).toContain("--model google-antigravity/gemini-flash");
		expect(values).toContain("--model anthropic/claude-sonnet-5");
		expect(values).toContain("--model @prompt_refiner");
	});

	test("filters --model values by the partial spec", () => {
		const values = refineArgumentCompletions("--model gem", [
			"google-antigravity/gemini-flash",
			"anthropic/claude-sonnet-5",
		]).map((item) => item.value);
		expect(values).toEqual(["--model google-antigravity/gemini-flash"]);
	});
});
