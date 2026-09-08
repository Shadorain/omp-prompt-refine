import type { RefineMode } from "./types.ts";

export type ParsedRefineArgs =
	| { ok: true; mode: RefineMode; model?: string; prompt: string }
	| { ok: false; error: string };

export function parseRefineArgs(args: string): ParsedRefineArgs {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	let light = false;
	let deep = false;
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
			return { ok: false, error: `Unknown flag ${token}. Use --light, --deep, or --model.` };
		}
		rest.push(token);
	}

	if (light && deep) {
		return { ok: false, error: "Use either --light or --deep, not both." };
	}

	const parsed: ParsedRefineArgs = {
		ok: true,
		mode: light ? "light" : deep ? "deep" : "default",
		prompt: rest.join(" ").trim(),
	};
	if (model) parsed.model = model;
	return parsed;
}

/** Editor text may still start with `/refine …`. Strip that line so it is not compiled. */
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
	const prompt = [parsed.prompt, rest].filter((part) => part.trim()).join("\n").trim();
	const result: ParsedRefineArgs = { ok: true, mode: parsed.mode, prompt };
	if (parsed.model) result.model = parsed.model;
	return result;
}

export function refineArgumentCompletions(prefix: string): {
	value: string;
	label: string;
	description: string;
	hint?: string;
}[] {
	const options = [
		{
			value: "",
			label: "[prompt]",
			description: "Optional. Empty refines the editor draft",
			hint: "[prompt]",
		},
		{
			value: "--light",
			label: "--light",
			description: "Clarify without expanding a simple prompt",
			hint: " [prompt]",
		},
		{
			value: "--deep",
			label: "--deep",
			description: "Adversarial two-stage refinement",
			hint: " [prompt]",
		},
		{
			value: "--model",
			label: "--model",
			description: "Model or @role for this run",
			hint: " <model-or-role> [prompt]",
		},
	];
	return options.filter(
		(option) => prefix.length === 0 || option.value.startsWith(prefix) || option.label.startsWith(prefix),
	);
}
