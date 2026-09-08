import {
	AgentRegistry,
	createAgentSession,
	SessionManager,
	Settings,
} from "@oh-my-pi/pi-coding-agent";
import { isolatedChildOptions } from "./isolation.ts";
import { RefineCancelledError, type IsolatedRunRequest } from "./types.ts";
export interface IsolatedInferenceHost {
	cwd: string;
	authStorage: unknown;
	modelRegistry: unknown;
	model: unknown;
}

export async function runIsolatedInference(
	host: IsolatedInferenceHost,
	request: IsolatedRunRequest,
): Promise<string> {
	if (request.signal?.aborted) throw new RefineCancelledError();
	const isolated = isolatedChildOptions({
		cwd: host.cwd,
		systemPrompt: request.systemPrompt,
		deadlineMs: request.deadlineMs,
	});
	const { session } = await createAgentSession({
		cwd: isolated.cwd,
		authStorage: host.authStorage as never,
		modelRegistry: host.modelRegistry as never,
		model: host.model as never,
		systemPrompt: isolated.systemPrompt,
		hasUI: false,
		enableLsp: false,
		enableMCP: false,
		enableIrc: false,
		skipPythonPreflight: true,
		disableExtensionDiscovery: true,
		toolNames: [],
		restrictToolNames: true,
		requireYieldTool: false,
		customTools: [],
		skills: [],
		rules: [],
		contextFiles: [],
		promptTemplates: [],
		slashCommands: [],
		spawns: "",
		sessionManager: SessionManager.inMemory(),
		settings: Settings.isolated({
			"advisor.enabled": false,
			"autolearn.enabled": false,
			"compaction.enabled": false,
			"retry.enabled": true,
		}),
		agentId: `prompt-refiner-${crypto.randomUUID().slice(0, 8)}`,
		agentDisplayName: "prompt-refiner",
		agentRegistry: new AgentRegistry(),
		deadline: Date.now() + request.deadlineMs,
	});

	const abortChild = () => {
		void session.abort({ reason: "Refinement cancelled." });
	};
	request.signal?.addEventListener("abort", abortChild, { once: true });
	try {
		if (request.signal?.aborted) throw new RefineCancelledError();
		await session.prompt(request.userPrompt, { expandPromptTemplates: false });
		if (request.signal?.aborted) throw new RefineCancelledError();
		return lastAssistantText(session.state.messages);
	} catch (error) {
		if (error instanceof RefineCancelledError || request.signal?.aborted) {
			throw new RefineCancelledError();
		}
		throw error;
	} finally {
		request.signal?.removeEventListener("abort", abortChild);
		await session.dispose();
	}
}

export function lastAssistantText(messages: Array<{ role?: string; content?: unknown }>): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role !== "assistant") continue;
		const content = message.content;
		if (typeof content === "string") return content;
		if (!Array.isArray(content)) continue;
		const parts: string[] = [];
		for (const block of content) {
			if (!block || typeof block !== "object") continue;
			const record = block as { type?: string; text?: string };
			if (record.type === "text" && typeof record.text === "string") parts.push(record.text);
		}
		if (parts.length > 0) return parts.join("");
	}
	return "";
}

