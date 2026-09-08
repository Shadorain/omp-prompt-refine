import { describe, expect, test } from "bun:test";
import { compilePrompt } from "../src/refine.ts";
import type { IsolatedRun } from "../src/types.ts";

const model = { provider: "test", id: "refiner" };

describe("compilePrompt", () => {
	test("light mode keeps a simple prompt short via the runner output", async () => {
		const run: IsolatedRun = async ({ systemPrompt, userPrompt }) => {
			expect(systemPrompt).toContain("Preserve brevity");
			expect(userPrompt).toContain("make this button blue");
			return JSON.stringify({ prompt: "Make this button blue.", notes: [] });
		};
		const result = await compilePrompt({
			mode: "light",
			draft: "make this button blue",
			packet: { draft: "make this button blue", cwd: "/tmp", recent: [], project: [] },
			compiler: { model, source: "current" },
			run,
		});
		expect(result.prompt).toBe("Make this button blue.");
		expect(result.prompt.split(/\s+/).length).toBeLessThan(8);
	});

	test("default mode can add structure for a hard prompt", async () => {
		const draft =
			"rewrite the billing pipeline so retries cannot double-charge, and search the whole class of issues not just the named example";
		const run: IsolatedRun = async ({ systemPrompt }) => {
			expect(systemPrompt).toContain("anti-workaround");
			return JSON.stringify({
				prompt:
					draft +
					"\n\nDo not declare completion until repository search shows no remaining double-charge retry path.",
				notes: ["Added an explicit definition of done"],
			});
		};
		const result = await compilePrompt({
			mode: "default",
			draft,
			packet: { draft, cwd: "/tmp", recent: [], project: [] },
			compiler: { model, source: "@prompt_refiner" },
			run,
		});
		expect(result.prompt).toContain("Do not declare completion");
		expect(result.notes[0]).toContain("definition of done");
	});

	test("deep mode runs critic then compiler", async () => {
		const calls: string[] = [];
		const run: IsolatedRun = async ({ systemPrompt }) => {
			if (systemPrompt.includes("You are a prompt critic")) {
				calls.push("critic");
				return "Agent could add a compatibility wrapper instead of removing the coupling.";
			}
			calls.push("compiler");
			expect(systemPrompt).toContain("You are a prompt compiler");
			return JSON.stringify({
				prompt: "Remove the coupling. Do not add a compatibility wrapper.",
				notes: ["Added a constraint against compatibility wrappers"],
			});
		};
		const result = await compilePrompt({
			mode: "deep",
			draft: "decouple billing from the ORM",
			packet: { draft: "decouple billing from the ORM", cwd: "/tmp", recent: [], project: [] },
			compiler: { model, source: "current" },
			critic: { model, source: "@prompt_critic" },
			run,
		});
		expect(calls).toEqual(["critic", "compiler"]);
		expect(result.prompt).toContain("Do not add a compatibility wrapper");
	});

	test("does not call the runner with an empty draft", async () => {
		await expect(
			compilePrompt({
				mode: "default",
				draft: "  ",
				packet: { draft: "  ", cwd: "/tmp", recent: [], project: [] },
				compiler: { model, source: "current" },
				run: async () => {
					throw new Error("should not run");
				},
			}),
		).rejects.toThrow(/nothing to refine/i);
	});

	test("retries once when the compiler returns prose instead of JSON", async () => {
		const bodies: string[] = [];
		const run: IsolatedRun = async ({ userPrompt }) => {
			bodies.push(userPrompt);
			if (bodies.length === 1) return "Here is a nicer prompt without JSON.";
			return JSON.stringify({ prompt: "Make the button blue.", notes: ["Clarified the color change"] });
		};
		const result = await compilePrompt({
			mode: "default",
			draft: "make the button blue",
			packet: { draft: "make the button blue", cwd: "/tmp", recent: [], project: [] },
			compiler: { model, source: "current" },
			run,
		});
		expect(bodies).toHaveLength(2);
		expect(bodies[1]).toContain("JSON");
		expect(result.prompt).toBe("Make the button blue.");
	});

	test("does not retry an empty prompt", async () => {
		let calls = 0;
		await expect(
			compilePrompt({
				mode: "default",
				draft: "make the button blue",
				packet: { draft: "make the button blue", cwd: "/tmp", recent: [], project: [] },
				compiler: { model, source: "current" },
				run: async () => {
					calls += 1;
					return JSON.stringify({ prompt: "   ", notes: [] });
				},
			}),
		).rejects.toThrow(/empty prompt/i);
		expect(calls).toBe(1);
	});
});
