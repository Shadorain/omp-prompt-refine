import { describe, expect, test } from "bun:test";
import { isolatedChildOptions } from "../src/isolation.ts";

describe("isolatedChildOptions", () => {
	test("disables mutation tools, MCP, LSP, extensions, and skills", () => {
		const options = isolatedChildOptions({
			cwd: "/tmp/project",
			systemPrompt: "refine",
			deadlineMs: 90_000,
		});

		expect(options.toolNames).toEqual([]);
		expect(options.restrictToolNames).toBe(true);
		expect(options.requireYieldTool).toBe(false);
		expect(options.enableMCP).toBe(false);
		expect(options.enableLsp).toBe(false);
		expect(options.enableIrc).toBe(false);
		expect(options.disableExtensionDiscovery).toBe(true);
		expect(options.skills).toEqual([]);
		expect(options.rules).toEqual([]);
		expect(options.contextFiles).toEqual([]);
		expect(options.slashCommands).toEqual([]);
		expect(options.promptTemplates).toEqual([]);
		expect(options.customTools).toEqual([]);
		expect(options.hasUI).toBe(false);
		expect(options.spawns).toBe("");
		expect(options.systemPrompt).toBe("refine");
	});
});
