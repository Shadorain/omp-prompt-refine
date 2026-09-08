import { formatContextPacket, missingAnchors } from "./context.ts";
import { parseRefineResult } from "./parse-result.ts";
import { compilerSystemPrompt, criticSystemPrompt } from "./prompts.ts";
import type {
	ContextPacket,
	IsolatedRun,
	RefineMode,
	RefineResult,
	ResolvedModel,
} from "./types.ts";

const LIGHT_DEADLINE_MS = 60_000;
const DEFAULT_DEADLINE_MS = 90_000;
const DEEP_DEADLINE_MS = 90_000;

export interface CompileArgs {
	mode: RefineMode;
	draft: string;
	packet: ContextPacket;
	compiler: ResolvedModel;
	critic?: ResolvedModel;
	run: IsolatedRun;
}

export async function compilePrompt(args: CompileArgs): Promise<RefineResult> {
	const draft = args.draft.trim();
	if (!draft) throw new Error("Nothing to refine.");

	const packetText = formatContextPacket({ ...args.packet, draft });
	let critique = "";

	if (args.mode === "deep") {
		const critic = args.critic ?? args.compiler;
		critique = (
			await args.run({
				model: critic.model,
				systemPrompt: criticSystemPrompt(),
				userPrompt: packetText,
				deadlineMs: DEEP_DEADLINE_MS,
			})
		).trim();
	}

	const compilerInput = critique
		? `${packetText}\n\n<critic>\n${critique}\n</critic>`
		: packetText;

	const raw = await args.run({
		model: args.compiler.model,
		systemPrompt: compilerSystemPrompt(args.mode),
		userPrompt: compilerInput,
		deadlineMs: args.mode === "light" ? LIGHT_DEADLINE_MS : DEFAULT_DEADLINE_MS,
	});

	let result: RefineResult;
	try {
		result = parseRefineResult(raw);
	} catch (error) {
		if (!(error instanceof Error) || error.message !== "Refiner did not return JSON.") throw error;
		const retry = await args.run({
			model: args.compiler.model,
			systemPrompt: compilerSystemPrompt(args.mode),
			userPrompt: `${compilerInput}\n\nReturn JSON only. Shape: {"prompt":"...","notes":["..."]}. No prose.`,
			deadlineMs: args.mode === "light" ? LIGHT_DEADLINE_MS : DEFAULT_DEADLINE_MS,
		});
		result = parseRefineResult(retry);
	}
	const dropped = missingAnchors(draft, result.prompt);
	if (dropped.length > 0) {
		result.notes.push(`Preserved-token check: missing ${dropped.join(", ")}`);
	}
	return result;
}
