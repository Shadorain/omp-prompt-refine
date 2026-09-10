import {
	AgentRegistry,
	createAgentSession,
	SessionManager,
	Settings,
	type ExtensionContext,
} from "@oh-my-pi/pi-coding-agent";
import { isolatedChildOptions } from "./isolation.ts";
import { RefineCancelledError, type IsolatedRunRequest } from "./types.ts";

export type IsolatedInferenceHost = {
	cwd: string;
	authStorage: ExtensionContext["modelRegistry"]["authStorage"];
	modelRegistry: ExtensionContext["modelRegistry"];
	model: NonNullable<ExtensionContext["model"]>;
};

export async function runIsolatedInference(
	host: IsolatedInferenceHost,
	request: IsolatedRunRequest,
): Promise<string> {
	if (request.signal?.aborted) throw new RefineCancelledError();
	const { session } = await createAgentSession({
		...isolatedChildOptions({
			cwd: host.cwd,
			systemPrompt: request.systemPrompt,
		}),
		authStorage: host.authStorage,
		modelRegistry: host.modelRegistry,
		model: host.model,
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
		...(request.thinkingLevel ? { thinkingLevel: request.thinkingLevel } : {}),
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
		const texts: string[] = [];
		const thinking: string[] = [];
		for (const block of content) {
			if (!block || typeof block !== "object") continue;
			if ("type" in block && block.type === "text" && "text" in block && typeof block.text === "string") {
				texts.push(block.text);
				continue;
			}
			if (
				"type" in block &&
				block.type === "thinking" &&
				"thinking" in block &&
				typeof block.thinking === "string"
			) {
				thinking.push(block.thinking);
			}
		}
		if (texts.length > 0) return texts.join("");
		if (thinking.length > 0) return thinking.join("");
	}
	return "";
}
