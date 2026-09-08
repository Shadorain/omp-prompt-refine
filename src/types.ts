export type RefineMode = "light" | "default" | "deep";

export interface RefineResult {
	prompt: string;
	notes: string[];
}

export interface ModelRef {
	provider: string;
	id: string;
}

export interface ModelQuery {
	resolve(spec: string): ModelRef | undefined;
	current(): ModelRef | undefined;
}

export interface ResolvedModel {
	model: ModelRef;
	source: string;
}

export interface ContextTurn {
	role: "user" | "assistant";
	text: string;
}

export interface ProjectSnippet {
	path: string;
	text: string;
}

export interface ContextPacket {
	draft: string;
	cwd: string;
	gitBranch?: string;
	recent: ContextTurn[];
	project: ProjectSnippet[];
}

export interface IsolatedRunRequest {
	model: ModelRef;
	systemPrompt: string;
	userPrompt: string;
	deadlineMs: number;
	signal?: AbortSignal;
	thinkingLevel?: string;
}

export class RefineCancelledError extends Error {
	readonly name = "RefineCancelledError";
	constructor() {
		super("Refinement cancelled.");
	}
}

export type IsolatedRun = (request: IsolatedRunRequest) => Promise<string>;
