import { describe, expect, test } from "bun:test";
import { resolveCriticModel, resolveRefinerModel } from "../src/models.ts";
import type { ModelQuery, ModelRef } from "../src/types.ts";

const sonnet: ModelRef = { provider: "anthropic", id: "claude-sonnet-5" };
const opus: ModelRef = { provider: "anthropic", id: "claude-opus-5" };
const current: ModelRef = { provider: "google-antigravity", id: "gemini-flash" };

function query(map: Record<string, ModelRef | undefined>, currentModel?: ModelRef): ModelQuery {
	return {
		resolve(spec) {
			return map[spec];
		},
		current() {
			return currentModel;
		},
	};
}

describe("resolveRefinerModel", () => {
	test("explicit --model wins over role and current", () => {
		const result = resolveRefinerModel(
			query(
				{
					"@slow": opus,
					"@prompt_refiner": sonnet,
					prompt_refiner: sonnet,
				},
				current,
			),
			"@slow",
		);
		expect(result).toEqual({ model: opus, source: "@slow" });
	});

	test("prompt_refiner role wins when --model is omitted", () => {
		const result = resolveRefinerModel(
			query(
				{
					"@prompt_refiner": sonnet,
					prompt_refiner: sonnet,
				},
				current,
			),
		);
		expect(result).toEqual({ model: sonnet, source: "@prompt_refiner" });
	});

	test("bare role name works if @alias is unset", () => {
		const result = resolveRefinerModel(
			query(
				{
					prompt_refiner: sonnet,
				},
				current,
			),
		);
		expect(result).toEqual({ model: sonnet, source: "prompt_refiner" });
	});

	test("falls back to current model when the role is absent", () => {
		const result = resolveRefinerModel(query({}, current));
		expect(result).toEqual({ model: current, source: "current" });
	});

	test("errors when explicit model does not resolve", () => {
		const result = resolveRefinerModel(query({}, current), "missing/model");
		expect(result).toEqual({
			error: 'Model "missing/model" is not available.',
		});
	});

	test("errors when no role and no current model", () => {
		const result = resolveRefinerModel(query({}));
		expect(result).toEqual({
			error: "No model available. Configure modelRoles.prompt_refiner or select a session model.",
		});
	});

	test("configured model is used when the role is absent", () => {
		const result = resolveRefinerModel(query({ "google/flash": current }, current), undefined, "google/flash");
		expect(result).toEqual({ model: current, source: "google/flash" });
	});

	test("role still beats a configured model", () => {
		const result = resolveRefinerModel(
			query({ "@prompt_refiner": sonnet, "google/flash": current }, current),
			undefined,
			"google/flash",
		);
		expect(result).toEqual({ model: sonnet, source: "@prompt_refiner" });
	});
});

describe("resolveCriticModel", () => {
	test("uses @prompt_critic when configured", () => {
		const result = resolveCriticModel(query({ "@prompt_critic": opus }), sonnet);
		expect(result).toEqual({ model: opus, source: "@prompt_critic" });
	});

	test("falls back to the compiler model when critic role is absent", () => {
		const result = resolveCriticModel(query({}), sonnet);
		expect(result).toEqual({ model: sonnet, source: "compiler" });
	});

	test("configured critic is used when the role is absent", () => {
		const result = resolveCriticModel(query({ "google/flash": current }), sonnet, "google/flash");
		expect(result).toEqual({ model: current, source: "google/flash" });
	});
});
