import type { KeybindingsManager, Theme } from "@oh-my-pi/pi-coding-agent";

export interface PickOption {
	label: string;
	description?: string;
}

export type PickHost = {
	ui: {
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
		) => Promise<T>;
		select: (title: string, options: string[]) => Promise<string | undefined>;
	};
};

export function optionsMatchingQuery(options: PickOption[], query: string): PickOption[] {
	const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return options;
	return options.filter((option) => {
		const hay = `${option.label} ${option.description ?? ""}`.toLowerCase();
		return tokens.every((token) => hay.includes(token));
	});
}

export async function pickSingleLabel(
	ctx: PickHost,
	title: string,
	options: PickOption[],
	helpText: string,
): Promise<string | undefined> {
	if (typeof ctx.ui.custom === "function") {
		return ctx.ui.custom<string | undefined>((_tui, theme, keybindings, done) =>
			singlePickComponent(title, options, helpText, theme, keybindings, done),
		);
	}
	return ctx.ui.select(title, options.map((option) => option.label));
}

function paint(theme: Theme, color: string, text: string): string {
	if (typeof theme.fg !== "function") return text;
	return theme.fg(color as "accent" | "dim" | "muted" | "success" | "error", text);
}

function isEnter(data: string, keybindings: KeybindingsManager): boolean {
	return keybindings.matches(data, "tui.select.confirm") || data === "\n" || data === "\r";
}

function isSpace(data: string): boolean {
	return data === " " || data === "space";
}

function isBackspace(data: string, keybindings: KeybindingsManager): boolean {
	return keybindings.matches(data, "tui.select.cancel")
		? false
		: data === "\x7f" || data === "\b" || data === "backspace";
}

function printableChar(data: string): string | undefined {
	if (data.length !== 1) return undefined;
	if (data === " " || data < " " || data > "~") return undefined;
	return data;
}

function singlePickComponent(
	title: string,
	options: PickOption[],
	helpText: string,
	theme: Theme,
	keybindings: KeybindingsManager,
	done: (result: string | undefined) => void,
) {
	let query = "";
	let cursor = 0;
	const visible = () => optionsMatchingQuery(options, query);
	const clampCursor = () => {
		const rows = visible();
		cursor = rows.length === 0 ? 0 : Math.max(0, Math.min(cursor, rows.length - 1));
	};

	return {
		render(width: number): readonly string[] {
			clampCursor();
			const rows = visible();
			const lines = [
				paint(theme, "accent", title),
				paint(theme, "dim", `Type to filter. Enter selects. Esc cancels. ${helpText}`),
			];
			if (query) lines.push(paint(theme, "accent", `Filter: ${query}`));
			lines.push("");
			const budget = Math.max(6, Math.min(14, rows.length));
			const start = Math.max(0, Math.min(cursor - Math.floor(budget / 2), Math.max(0, rows.length - budget)));
			const slice = rows.slice(start, start + budget);
			for (let i = 0; i < slice.length; i += 1) {
				const option = slice[i];
				if (!option) continue;
				const index = start + i;
				const prefix = index === cursor ? "> " : "  ";
				const desc = option.description ? `  ${option.description}` : "";
				const line = `${prefix}${option.label}${desc}`;
				lines.push(index === cursor ? paint(theme, "accent", line.slice(0, Math.max(1, width))) : line.slice(0, Math.max(1, width)));
			}
			if (rows.length === 0) lines.push(paint(theme, "dim", "  No matches"));
			return lines;
		},
		invalidate() {},
		handleInput(data: string) {
			if (keybindings.matches(data, "tui.select.cancel")) {
				done(undefined);
				return;
			}
			if (keybindings.matches(data, "tui.select.up") || data === "k") {
				cursor -= 1;
				clampCursor();
				return;
			}
			if (keybindings.matches(data, "tui.select.down") || data === "j") {
				cursor += 1;
				clampCursor();
				return;
			}
			if (isEnter(data, keybindings) || isSpace(data)) {
				const option = visible()[cursor];
				if (option) done(option.label);
				return;
			}
			if (isBackspace(data, keybindings)) {
				query = query.slice(0, -1);
				cursor = 0;
				return;
			}
			const ch = printableChar(data);
			if (ch) {
				query += ch;
				cursor = 0;
			}
		},
	};
}
