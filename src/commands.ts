import type { RefineMode } from "./types.ts";

export type ParsedRefineArgs =
	| {
			ok: true;
			action?: undefined;
			mode: RefineMode;
			model?: string;
			prompt: string;
			noContext?: true;
			last?: true;
			interview?: true;
	  }
	| { ok: true; action: "undo" }
	| { ok: true; action: "setup" }
	| { ok: false; error: string };

export type ArgumentCompletion = {
	value: string;
	label: string;
	description: string;
	hint?: string;
};

const FLAG_HELP = "Use --light, --deep, --model, --no-context, --last, --undo, --setup, or --interview.";
const ROLE_SUGGESTIONS = ["@prompt_refiner", "@prompt_critic"];

const FLAG_OPTIONS: ArgumentCompletion[] = [
	{
		value: "",
		label: "[prompt]",
		description: "Optional. Empty rewords the editor draft",
		hint: "[prompt]",
	},
	{
		value: "--light",
		label: "--light",
		description: "Say it more clearly. Keep it short",
		hint: " [prompt]",
	},
	{
		value: "--deep",
		label: "--deep",
		description: "Find ways an agent could miss the point, then rewrite",
		hint: " [prompt]",
	},
	{
		value: "--model",
		label: "--model",
		description: "Model or @role for this run",
		hint: " <model-or-role> [prompt]",
	},
	{
		value: "--no-context",
		label: "--no-context",
		description: "Refine the draft only. Skip session and project files",
		hint: " [prompt]",
	},
	{
		value: "--last",
		label: "--last",
		description: "Reword the last user message instead of the editor",
		hint: "",
	},
	{
		value: "--undo",
		label: "--undo",
		description: "Put the pre-Apply draft back in the editor",
		hint: "",
	},
	{
		value: "--setup",
		label: "--setup",
		description: "Pick default models and extra context files",
		hint: "",
	},
	{
		value: "--interview",
		label: "--interview",
		description: "Ask a few questions, then rewrite",
		hint: " [prompt]",
	},
];

export function parseRefineArgs(args: string): ParsedRefineArgs {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	let light = false;
	let deep = false;
	let noContext = false;
	let last = false;
	let undo = false;
	let setup = false;
	let interview = false;
	let model: string | undefined;
	const rest: string[] = [];

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token === "--light") {
			light = true;
			continue;
		}
		if (token === "--deep") {
			deep = true;
			continue;
		}
		if (token === "--no-context") {
			noContext = true;
			continue;
		}
		if (token === "--last") {
			last = true;
			continue;
		}
		if (token === "--undo") {
			undo = true;
			continue;
		}
		if (token === "--setup") {
			setup = true;
			continue;
		}
		if (token === "--interview") {
			interview = true;
			continue;
		}
		if (token === "--model") {
			const value = tokens[i + 1];
			if (!value || value.startsWith("--")) {
				return { ok: false, error: "--model requires a model or role (example: --model @slow)." };
			}
			model = value;
			i += 1;
			continue;
		}
		if (token.startsWith("--model=")) {
			const value = token.slice("--model=".length);
			if (!value) {
				return { ok: false, error: "--model requires a model or role (example: --model @slow)." };
			}
			model = value;
			continue;
		}
		if (token.startsWith("--")) {
			return { ok: false, error: `Unknown flag ${token}. ${FLAG_HELP}` };
		}
		rest.push(token);
	}

	if (undo && (setup || light || deep || last || noContext || interview || model || rest.length > 0)) {
		return { ok: false, error: "--undo cannot be combined with other flags or a prompt." };
	}
	if (setup && (undo || light || deep || last || noContext || interview || model || rest.length > 0)) {
		return { ok: false, error: "--setup cannot be combined with other flags or a prompt." };
	}
	if (undo) return { ok: true, action: "undo" };
	if (setup) return { ok: true, action: "setup" };
	if (last && rest.length > 0) {
		return { ok: false, error: "--last cannot take prompt text. It uses the previous user message." };
	}
	if (light && deep) {
		return { ok: false, error: "Use either --light or --deep, not both." };
	}

	const parsed: ParsedRefineArgs = {
		ok: true,
		mode: light ? "light" : deep ? "deep" : "default",
		prompt: rest.join(" "),
	};
	if (model) parsed.model = model;
	if (noContext) parsed.noContext = true;
	if (last) parsed.last = true;
	if (interview) parsed.interview = true;
	return parsed;
}

export function draftFromEditor(text: string): ParsedRefineArgs {
	const trimmed = text.replace(/^\uFEFF/, "").replace(/\s+$/, "");
	const newline = trimmed.search(/\r?\n/);
	const first = (newline === -1 ? trimmed : trimmed.slice(0, newline)).trim();
	const rest = newline === -1 ? "" : trimmed.slice(newline).replace(/^\r?\n/, "");
	const match = first.match(/^\/refine(?:\s+(.*))?$/);
	if (!match) {
		return { ok: true, mode: "default", prompt: trimmed.trim() };
	}
	const parsed = parseRefineArgs(match[1] ?? "");
	if (!parsed.ok) return parsed;
	if (parsed.action) return parsed;
	const prompt = [parsed.prompt, rest].filter((part) => part.trim()).join("\n").trim();
	const result: ParsedRefineArgs = { ok: true, mode: parsed.mode, prompt };
	if (parsed.model) result.model = parsed.model;
	if (parsed.noContext) result.noContext = true;
	if (parsed.last) result.last = true;
	if (parsed.interview) result.interview = true;
	return result;
}

export function refineArgumentCompletions(prefix: string, models: string[] = []): ArgumentCompletion[] {
	const { complete, partial } = splitArgs(prefix);
	const modelValues = modelValueCompletions(complete, partial, models);
	if (modelValues) return modelValues;

	if (complete.length > 0) {
		return FLAG_OPTIONS.filter((option) => {
			if (!option.value) return false;
			if (complete.includes(option.value)) return false;
			if (option.value === "--light" && complete.includes("--deep")) return false;
			if (option.value === "--deep" && complete.includes("--light")) return false;
			return option.value.startsWith(partial);
		}).map((option) => ({
			...option,
			value: joinValue(complete, option.value),
		}));
	}

	return FLAG_OPTIONS.filter(
		(option) => prefix.length === 0 || option.value.startsWith(prefix) || option.label.startsWith(prefix),
	);
}

function modelValueCompletions(complete: string[], partial: string, models: string[]): ArgumentCompletion[] | undefined {
	const equals = partial.startsWith("--model=");
	const afterFlag = complete[complete.length - 1] === "--model";
	if (!equals && !afterFlag) return undefined;

	const needle = equals ? partial.slice("--model=".length).toLowerCase() : partial.toLowerCase();
	const specs = unique([...ROLE_SUGGESTIONS, ...models]);
	const hits = specs.filter((spec) => needle.length === 0 || spec.toLowerCase().includes(needle));
	const prefix = equals
		? joinValue(complete, `--model=`)
		: `${joinValue(complete.slice(0, -1), "--model")} `;
	return hits.map((spec) => ({
		value: `${prefix}${spec}`,
		label: spec,
		description: spec.startsWith("@") ? "Role" : "Available model",
		hint: " [prompt]",
	}));
}

function splitArgs(argumentText: string): { complete: string[]; partial: string } {
	const endsWithSpace = /\s$/.test(argumentText);
	const tokens = argumentText.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return { complete: [], partial: "" };
	if (endsWithSpace) return { complete: tokens, partial: "" };
	return { complete: tokens.slice(0, -1), partial: tokens[tokens.length - 1] ?? "" };
}

function joinValue(complete: string[], token: string): string {
	return complete.length > 0 ? `${complete.join(" ")} ${token}` : token;
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}
