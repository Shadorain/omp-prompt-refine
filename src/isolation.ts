export interface IsolatedChildInput {
	cwd: string;
	systemPrompt: string;
	deadlineMs: number;
}

export function isolatedChildOptions(input: IsolatedChildInput) {
	return {
		cwd: input.cwd,
		systemPrompt: input.systemPrompt,
		toolNames: [] as string[],
		restrictToolNames: true,
		requireYieldTool: false,
		enableMCP: false,
		enableLsp: false,
		enableIrc: false,
		disableExtensionDiscovery: true,
		skills: [] as unknown[],
		rules: [] as unknown[],
		contextFiles: [] as unknown[],
		slashCommands: [] as unknown[],
		promptTemplates: [] as unknown[],
		customTools: [] as unknown[],
		hasUI: false,
		spawns: "",
		skipPythonPreflight: true,
		deadlineMs: input.deadlineMs,
	};
}
