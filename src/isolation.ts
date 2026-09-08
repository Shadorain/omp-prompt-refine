import type { CreateAgentSessionOptions } from "@oh-my-pi/pi-coding-agent";

export function isolatedChildOptions(input: {
	cwd: string;
	systemPrompt: string;
}): CreateAgentSessionOptions {
	return {
		cwd: input.cwd,
		systemPrompt: input.systemPrompt,
		toolNames: [],
		restrictToolNames: true,
		requireYieldTool: false,
		enableMCP: false,
		enableLsp: false,
		enableIrc: false,
		disableExtensionDiscovery: true,
		skills: [],
		rules: [],
		contextFiles: [],
		slashCommands: [],
		promptTemplates: [],
		customTools: [],
		hasUI: false,
		spawns: "",
		skipPythonPreflight: true,
	};
}
