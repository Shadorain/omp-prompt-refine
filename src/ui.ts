import type { RefineResult } from "./types.ts";

const PROGRESS_KEY = "prompt-refiner";
const PREVIEW_MAX_LINES = 40;
const PREVIEW_MAX_CHARS = 4000;
const PROGRESS_TEXT = "Refining…";
const PROGRESS_ESC_ICON = "󱊷";
const PROGRESS_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SHIMMER_RGB: ReadonlyArray<readonly [number, number, number]> = [
	[96, 64, 196],
	[132, 82, 232],
	[158, 108, 255],
	[88, 128, 238],
	[64, 156, 246],
	[78, 92, 214],
];
const SHIMMER_MS = 420;

export interface RefineUi {
	notify(message: string, type?: "info" | "warning" | "error"): void;
	getEditorText(): string;
	setEditorText(text: string): void;
	select(title: string, options: string[]): Promise<string | undefined>;
	editor(title: string, prefill?: string): Promise<string | undefined>;
	setStatus?(key: string, text: string | undefined): void;
	setWidget?(
		key: string,
		content:
			| string[]
			| undefined
			| ((
					tui: { requestRender: () => void },
					theme: { fg: (color: string, text: string) => string },
			  ) => { render: (width: number) => string[]; dispose?: () => void }),
		options?: { placement?: "aboveEditor" | "belowEditor" },
	): void;
	onTerminalInput?(handler: (data: string) => { consume?: boolean } | undefined): () => void;
}

export interface PresentContext {
	hasUI: boolean;
	ui: RefineUi;
}

export function isRefineCancel(data: string): boolean {
	if (data === "\x1b" || data === "\x03") return true;
	if (data === "escape" || data === "esc" || data === "ctrl+c") return true;
	if (data.startsWith("\x1b[27") && data.endsWith("u")) return true;
	if (data.startsWith("\x1b[99;") && data.includes(";5") && data.endsWith("u")) return true;
	return false;
}

export function attachRefineCancel(ui: RefineUi, abort: () => void): () => void {
	if (!ui.onTerminalInput) return () => {};
	return ui.onTerminalInput((data) => {
		if (!isRefineCancel(data)) return;
		abort();
		return { consume: true };
	});
}

export function formatRefineProgressLine(
	now: number,
	paint: (tone: string, text: string) => string = (_tone, text) => text,
): string {
	const frame = PROGRESS_FRAMES[Math.floor(now / 80) % PROGRESS_FRAMES.length];
	const sweep = Math.floor(now / SHIMMER_MS);
	let text = `${paint("accent", frame)} ${paint("muted", PROGRESS_ESC_ICON)} `;
	for (let i = 0; i < PROGRESS_TEXT.length; i++) {
		const [r, g, b] = SHIMMER_RGB[(i + sweep) % SHIMMER_RGB.length];
		text += `\x1b[38;2;${r};${g};${b}m${PROGRESS_TEXT[i]}\x1b[39m`;
	}
	return text;
}

export function startRefineProgress(ui: RefineUi): void {
	ui.setWidget?.(
		PROGRESS_KEY,
		(tui, theme) => {
			const timer = setInterval(() => tui.requestRender(), 80);
			return {
				render(_width: number) {
					return [formatRefineProgressLine(Date.now(), (tone, text) => theme.fg(tone, text))];
				},
				dispose() {
					clearInterval(timer);
				},
			};
		},
		{ placement: "aboveEditor" },
	);
}

export function stopRefineProgress(ui: RefineUi): void {
	ui.setWidget?.(PROGRESS_KEY, undefined);
}

export function previewActionTitle(result: RefineResult, source: string): string {
	const notes = result.notes.slice(0, 6).map((note) => `• ${note}`);
	const prompt = clipPreview(result.prompt);
	return [
		`Prompt refined using ${source}`,
		"",
		...(notes.length > 0 ? ["Changes:", ...notes, ""] : []),
		"Refined prompt:",
		prompt,
	].join("\n");
}

export async function presentRefineResult(
	ctx: PresentContext,
	result: RefineResult,
	source: string,
): Promise<false> {
	const original = ctx.ui.getEditorText();
	const preview = previewActionTitle(result, source);

	if (!ctx.hasUI) {
		ctx.ui.setEditorText(result.prompt);
		ctx.ui.notify(preview, "info");
		return false;
	}

	ctx.ui.notify(`Prompt refined using ${source}`, "info");
	const choice = await ctx.ui.select(preview, ["Apply", "Edit", "Cancel"]);
	if (choice === "Apply") {
		ctx.ui.setEditorText(result.prompt);
		return false;
	}
	if (choice === "Edit") {
		const edited = await ctx.ui.editor("Edit refined prompt (Esc cancels)", result.prompt);
		if (edited == null) {
			if (ctx.ui.getEditorText() !== original) ctx.ui.setEditorText(original);
			return false;
		}
		ctx.ui.setEditorText(edited);
		return false;
	}
	if (ctx.ui.getEditorText() !== original) ctx.ui.setEditorText(original);
	return false;
}

function clipPreview(prompt: string): string {
	const lines = prompt.split("\n");
	if (lines.length <= PREVIEW_MAX_LINES && prompt.length <= PREVIEW_MAX_CHARS) return prompt;
	const clipped = lines.slice(0, PREVIEW_MAX_LINES).join("\n").slice(0, PREVIEW_MAX_CHARS);
	return `${clipped}\n… (truncated, choose Edit to see the rest)`;
}
