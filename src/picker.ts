import type { ExtensionRows, ExtensionTheme, ExtensionUiHost, KeybindingsManager } from "@oh-my-pi/pi-coding-agent";
import { decodeKey } from "@oh-my-pi/pi-tui/driver/input/keys";

export interface PickOption {
	label: string;
	description?: string;
}

export type PickHost = {
	ui: {
		custom?: <T>(
			factory: (
				ui: ExtensionUiHost,
				theme: ExtensionTheme,
				keybindings: KeybindingsManager,
				done: (result: T) => void,
			) => ExtensionRows,
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
		return ctx.ui.custom<string | undefined>((ui, theme, keybindings, done) => {
			const view = singlePickComponent(title, options, helpText, theme, keybindings, done);
			return { ...view, handleInput(data: string) { view.handleInput(data); ui.requestRender(); } };
		});
	}
	return ctx.ui.select(title, options.map((option) => option.label));
}

function paint(theme: ExtensionTheme, color: string, text: string): string {
	if (typeof theme.fg !== "function") return text;
	return theme.fg(color as "accent" | "dim" | "muted" | "success" | "error", text);
}


function singlePickComponent(
	title: string,
	options: PickOption[],
	helpText: string,
	theme: ExtensionTheme,
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
		handleInput(data: string) {
			const key = decodeKey(data, { kitty: true, backspaceIsCtrl: false });
			if (!key || key.kind === "release") return;
			if (keybindings.matches(key, "tui.select.cancel")) {
				done(undefined);
				return;
			}
			if (keybindings.matches(key, "tui.select.up") || key.id === "k") {
				cursor -= 1;
				clampCursor();
				return;
			}
			if (keybindings.matches(key, "tui.select.down") || key.id === "j") {
				cursor += 1;
				clampCursor();
				return;
			}
			if (keybindings.matches(key, "tui.select.confirm") || key.id === "space") {
				const option = visible()[cursor];
				if (option) done(option.label);
				return;
			}
			if (key.id === "backspace") {
				query = query.slice(0, -1);
				cursor = 0;
				return;
			}
			const ch = key.text;
			if (ch && ch !== " " && ch >= " " && ch <= "~") {
				query += ch;
				cursor = 0;
			}
		},
	};
}
