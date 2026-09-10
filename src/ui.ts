import type { KeybindingsManager, Theme } from "@oh-my-pi/pi-coding-agent";
import type { RefineResult } from "./types.ts";

const PROGRESS_KEY = "prompt-refiner";
const PREVIEW_KEY = "prompt-refiner-preview";
const PREVIEW_MAX_LINES = 40;
const PREVIEW_MAX_CHARS = 4000;
const PREVIEW_ACTIONS = [
	{ id: "Apply", hint: "put this in the editor" },
	{ id: "Edit", hint: "tweak it first" },
	{ id: "Cancel", hint: "keep the original" },
] as const;
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
	select(
		title: string,
		options: Array<string | { label: string; description?: string }>,
	): Promise<string | undefined>;
	editor(
		title: string,
		prefill?: string,
		dialogOptions?: { signal?: AbortSignal },
	): Promise<string | undefined>;
	custom?: <T>(
		factory: (
			tui: unknown,
			theme: Theme,
			keybindings: KeybindingsManager,
			done: (result: T) => void,
		) => {
			render: (width: number) => readonly string[];
			invalidate: () => void;
			handleInput: (data: string) => void;
		},
		options?: { overlay?: boolean },
	) => Promise<T>;
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

export function formatPreviewLines(result: RefineResult, source: string, width = 80): string[] {
	const inner = Math.max(16, width);
	const lines: string[] = [`Refined · ${source}`, ""];
	if (result.notes.length > 0) {
		lines.push("Changes");
		for (const note of result.notes.slice(0, 8)) {
			const wrapped = wrapText(`• ${note}`, inner - 2);
			for (let i = 0; i < wrapped.length; i++) {
				lines.push(i === 0 ? `  ${wrapped[i]}` : `    ${wrapped[i]}`);
			}
		}
		lines.push("");
	}
	lines.push("Prompt");
	let count = 0;
	for (const raw of clipPreview(result.prompt).split("\n")) {
		const wrapped = wrapText(raw, inner - 2);
		for (const row of wrapped) {
			if (count >= PREVIEW_MAX_LINES) {
				lines.push("  …");
				return lines;
			}
			lines.push(row.length > 0 ? `  ${row}` : "");
			count++;
		}
	}
	return lines;
}

export async function presentRefineResult(
	ctx: PresentContext,
	result: RefineResult,
	source: string,
	onApplied?: (original: string) => void,
): Promise<false> {
	const original = ctx.ui.getEditorText();
	if (!ctx.hasUI) {
		onApplied?.(original);
		ctx.ui.setEditorText(result.prompt);
		ctx.ui.notify(formatPreviewLines(result, source).join("\n"), "info");
		return false;
	}

	while (true) {
		const choice = await choosePreviewAction(ctx, result, source);
		if (choice === "Apply") {
			onApplied?.(original);
			ctx.ui.setEditorText(result.prompt);
			return false;
		}
		if (choice === "Edit") {
			const edited = await editRefinedPrompt(ctx.ui, result.prompt);
			if (edited == null) continue;
			onApplied?.(original);
			ctx.ui.setEditorText(edited);
			return false;
		}
		if (ctx.ui.getEditorText() !== original) ctx.ui.setEditorText(original);
		return false;
	}
}

async function editRefinedPrompt(ui: RefineUi, prompt: string): Promise<string | undefined> {
	const abort = new AbortController();
	const detach = attachRefineCancel(ui, () => {
		if (!abort.signal.aborted) abort.abort();
	});
	try {
		return await ui.editor("Edit refined prompt (Esc back)", prompt, { signal: abort.signal });
	} catch {
		return undefined;
	} finally {
		detach();
	}
}

async function choosePreviewAction(
	ctx: PresentContext,
	result: RefineResult,
	source: string,
): Promise<string | undefined> {
	if (typeof ctx.ui.custom === "function") {
		return ctx.ui.custom(
			(_tui, theme, keybindings, done) => previewOverlay(result, source, theme, keybindings, done),
			{ overlay: true },
		);
	}
	ctx.ui.setWidget?.(PREVIEW_KEY, formatPreviewLines(result, source), { placement: "aboveEditor" });
	try {
		return await ctx.ui.select(`Refined · ${source}`, [
			{ label: "Apply", description: "put this in the editor" },
			{ label: "Edit", description: "tweak it first" },
			{ label: "Cancel", description: "keep the original" },
		]);
	} finally {
		ctx.ui.setWidget?.(PREVIEW_KEY, undefined);
	}
}

function previewOverlay(
	result: RefineResult,
	source: string,
	theme: Theme,
	keybindings: KeybindingsManager,
	done: (result: string | undefined) => void,
) {
	let cursor = 0;
	const clamp = () => {
		cursor = Math.max(0, Math.min(cursor, PREVIEW_ACTIONS.length - 1));
	};
	return {
		render(width: number): readonly string[] {
			clamp();
			return renderPreviewPanel(result, source, theme, cursor, width);
		},
		invalidate() {},
		handleInput(data: string) {
			if (keybindings.matches(data, "tui.select.cancel") || isRefineCancel(data)) {
				done(undefined);
				return;
			}
			if (keybindings.matches(data, "tui.select.up") || data === "k") {
				cursor -= 1;
				clamp();
				return;
			}
			if (keybindings.matches(data, "tui.select.down") || data === "j") {
				cursor += 1;
				clamp();
				return;
			}
			if (data === "a" || data === "A" || data === "1") {
				done("Apply");
				return;
			}
			if (data === "e" || data === "E" || data === "2") {
				done("Edit");
				return;
			}
			if (data === "c" || data === "C" || data === "3") {
				done("Cancel");
				return;
			}
			if (
				keybindings.matches(data, "tui.select.confirm") ||
				data === "\n" ||
				data === "\r" ||
				data === " "
			) {
				done(PREVIEW_ACTIONS[cursor]?.id);
			}
		},
	};
}

function renderPreviewPanel(
	result: RefineResult,
	source: string,
	theme: Theme,
	cursor: number,
	width: number,
): string[] {
	const boxWidth = Math.max(36, Math.min(width, 100));
	const inner = boxWidth - 4;
	const body = formatPreviewLines(result, source, inner);
	const title = body[0] ?? `Refined · ${source}`;
	const rest = body.slice(1);
	const lines: string[] = [boxTop(title, boxWidth, theme)];
	for (const row of rest) {
		lines.push(boxRow(row, boxWidth, theme, row === "Changes" || row === "Prompt" ? "muted" : undefined));
	}
	lines.push(boxDivider(boxWidth, theme));
	for (let i = 0; i < PREVIEW_ACTIONS.length; i++) {
		const action = PREVIEW_ACTIONS[i];
		const selected = i === cursor;
		const marker = selected ? "▶ " : "  ";
		const label = `${marker}${action.id}`;
		const hint = `  ${action.hint}`;
		const text = padVisible(`${label}${hint}`, inner);
		const painted = selected
			? paint(theme, "accent", text)
			: `${paint(theme, "text", padVisible(label, 10))}${paint(theme, "dim", hint)}`;
		lines.push(boxRowRaw(painted, boxWidth, theme));
	}
	lines.push(boxBottom(boxWidth, theme));
	lines.push(paint(theme, "dim", "  enter select   a apply   e edit   esc cancel"));
	return lines;
}

function clipPreview(prompt: string): string {
	const lines = prompt.split("\n");
	if (lines.length <= PREVIEW_MAX_LINES && prompt.length <= PREVIEW_MAX_CHARS) return prompt;
	const clipped = lines.slice(0, PREVIEW_MAX_LINES).join("\n").slice(0, PREVIEW_MAX_CHARS);
	return `${clipped}\n…`;
}

function wrapText(text: string, width: number): string[] {
	const max = Math.max(8, width);
	if (text.length <= max) return [text];
	const out: string[] = [];
	let rest = text;
	while (rest.length > max) {
		let cut = rest.lastIndexOf(" ", max);
		if (cut < max / 2) cut = max;
		out.push(rest.slice(0, cut).trimEnd());
		rest = rest.slice(cut).trimStart();
	}
	if (rest.length > 0) out.push(rest);
	return out.length > 0 ? out : [""];
}

function paint(theme: Theme, color: string, text: string): string {
	if (typeof theme.fg !== "function") return text;
	return theme.fg(color as "accent" | "dim" | "muted" | "success" | "error" | "text", text);
}

function visibleWidth(text: string): number {
	return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function padVisible(text: string, width: number): string {
	const vis = visibleWidth(text);
	if (vis >= width) return text.slice(0, Math.max(0, text.length - (vis - width)));
	return `${text}${" ".repeat(width - vis)}`;
}

function boxTop(title: string, width: number, theme: Theme): string {
	const label = `─ ${title} `;
	const fill = Math.max(0, width - 2 - visibleWidth(label));
	return paint(theme, "accent", `╭${label}${"─".repeat(fill)}╮`);
}

function boxBottom(width: number, theme: Theme): string {
	return paint(theme, "accent", `╰${"─".repeat(Math.max(0, width - 2))}╯`);
}

function boxDivider(width: number, theme: Theme): string {
	return paint(theme, "accent", `├${"─".repeat(Math.max(0, width - 2))}┤`);
}

function boxRow(text: string, width: number, theme: Theme, tone?: string): string {
	const inner = padVisible(text, width - 4);
	const body = tone ? paint(theme, tone, inner) : inner;
	return boxRowRaw(body, width, theme);
}

function boxRowRaw(innerPainted: string, width: number, theme: Theme): string {
	const padded = padVisible(innerPainted, width - 4);
	return `${paint(theme, "accent", "│")} ${padded} ${paint(theme, "accent", "│")}`;
}
