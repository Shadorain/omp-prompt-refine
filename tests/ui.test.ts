import { describe, expect, test } from "bun:test";
import {
	attachRefineCancel,
	formatPreviewLines,
	formatRefineProgressLine,
	isRefineCancel,
	presentRefineResult,
	startRefineProgress,
	stopRefineProgress,
} from "../src/ui.ts";
import type { RefineResult } from "../src/types.ts";

function mockUi(options: {
	select?: string | undefined;
	selectQueue?: Array<string | undefined>;
	editor?: string | undefined;
	hasUI?: boolean;
	customChoice?: string | undefined;
	customQueue?: Array<string | undefined>;
	useCustom?: boolean;
}) {
	let editorText = "ORIGINAL DRAFT";
	const notifies: string[] = [];
	const selectTitles: string[] = [];
	const working: Array<string | undefined> = [];
	const statuses = new Map<string, string>();
	const widgets = new Map<string, unknown>();
	const customRenders: string[] = [];
	const inputHandlers: Array<(data: string) => { consume?: boolean } | undefined> = [];
	const ui: Record<string, unknown> = {
		notify(message: string) {
			notifies.push(message);
		},
		getEditorText() {
			return editorText;
		},
		setEditorText(text: string) {
			editorText = text;
		},
		async select(title: string) {
			selectTitles.push(title);
			if (options.selectQueue) return options.selectQueue.shift();
			return options.select;
		},
		async editor(_title: string, prefill?: string) {
			return options.editor ?? prefill;
		},
		setWorkingMessage(message?: string) {
			working.push(message);
		},
		setStatus(key: string, text: string | undefined) {
			if (text === undefined) statuses.delete(key);
			else statuses.set(key, text);
		},
		setWidget(key: string, content: unknown) {
			if (content === undefined) widgets.delete(key);
			else widgets.set(key, content);
		},
		onTerminalInput(handler: (data: string) => { consume?: boolean } | undefined) {
			inputHandlers.push(handler);
			return () => {
				const index = inputHandlers.indexOf(handler);
				if (index >= 0) inputHandlers.splice(index, 1);
			};
		},
	};
	if (options.useCustom) {
		ui.custom = async (
			factory: (
				tui: unknown,
				theme: { fg: (color: string, text: string) => string },
				keybindings: { matches: () => boolean },
				done: (result: string | undefined) => void,
			) => {
				render: (width: number) => readonly string[];
				handleInput: (data: string) => void;
			},
		) => {
			let resolved: string | undefined;
			const component = factory(
				null,
				{ fg: (color: string, text: string) => `[${color}]${text}` },
				{ matches: () => false },
				(result) => {
					resolved = result;
				},
			);
			customRenders.push(...component.render(80));
			if (options.customQueue) return options.customQueue.shift();
			return options.customChoice === undefined ? resolved : options.customChoice;
		};
	}
	return {
		hasUI: options.hasUI ?? true,
		notifies,
		selectTitles,
		working,
		statuses,
		widgets,
		customRenders,
		inputHandlers,
		get editorText() {
			return editorText;
		},
		ui,
	};
}

const refined: RefineResult = {
	prompt: "REFINED PROMPT",
	notes: ["Added explicit acceptance criteria"],
};

describe("presentRefineResult", () => {
	test("Apply writes the refined prompt into the editor", async () => {
		const ctx = mockUi({ select: "Apply" });
		await presentRefineResult(ctx, refined, "@prompt_refiner");
		expect(ctx.editorText).toBe("REFINED PROMPT");
	});

	test("Apply reports the original text so it can be undone", async () => {
		const originals: string[] = [];
		const ctx = mockUi({ select: "Apply" });
		await presentRefineResult(ctx, refined, "@prompt_refiner", (original) => originals.push(original));
		expect(originals).toEqual(["ORIGINAL DRAFT"]);
	});

	test("Cancel does not report an undo original", async () => {
		const originals: string[] = [];
		const ctx = mockUi({ select: "Cancel" });
		await presentRefineResult(ctx, refined, "@prompt_refiner", (original) => originals.push(original));
		expect(originals).toEqual([]);
	});

	test("Cancel leaves the original editor text", async () => {
		const ctx = mockUi({ select: "Cancel" });
		await presentRefineResult(ctx, refined, "@prompt_refiner");
		expect(ctx.editorText).toBe("ORIGINAL DRAFT");
	});

	test("dismissed select leaves the original editor text", async () => {
		const ctx = mockUi({ select: undefined });
		await presentRefineResult(ctx, refined, "@prompt_refiner");
		expect(ctx.editorText).toBe("ORIGINAL DRAFT");
	});

	test("Edit writes the edited text, not a submit", async () => {
		const ctx = mockUi({ select: "Edit", editor: "USER TWEAKED" });
		const submitted = await presentRefineResult(ctx, refined, "@prompt_refiner");
		expect(ctx.editorText).toBe("USER TWEAKED");
		expect(submitted).toBe(false);
	});

	test("cancelled editor leaves the original editor text", async () => {
		const ctx = mockUi({ selectQueue: ["Edit", "Cancel"] });
		ctx.ui.editor = async () => undefined;
		await presentRefineResult(ctx, refined, "@prompt_refiner");
		expect(ctx.editorText).toBe("ORIGINAL DRAFT");
	});

	test("Esc from Edit returns to Apply/Edit/Cancel", async () => {
		const ctx = mockUi({ selectQueue: ["Edit", "Cancel"] });
		ctx.ui.editor = async () => undefined;
		await presentRefineResult(ctx, refined, "@prompt_refiner");
		expect(ctx.selectTitles).toHaveLength(2);
		expect(ctx.editorText).toBe("ORIGINAL DRAFT");
	});

	test("Esc from Edit then Apply still writes the refined prompt", async () => {
		const ctx = mockUi({ selectQueue: ["Edit", "Apply"] });
		ctx.ui.editor = async () => undefined;
		await presentRefineResult(ctx, refined, "@prompt_refiner");
		expect(ctx.selectTitles).toHaveLength(2);
		expect(ctx.editorText).toBe("REFINED PROMPT");
	});

	test("preview divider tees use the same accent as the frame", async () => {
		const ctx = mockUi({ useCustom: true, customChoice: "Cancel" });
		await presentRefineResult(ctx, refined, "@prompt_refiner");
		const panel = ctx.customRenders.join("\n");
		expect(panel).toContain("[accent]├");
		expect(panel).toMatch(/\[accent\]├─+┤/);
		expect(panel).not.toContain("[border]");
	});

	test("Esc during Edit aborts the editor dialog", async () => {
		const ctx = mockUi({ selectQueue: ["Edit", "Cancel"] });
		ctx.ui.editor = async (
			_title: string,
			_prefill?: string,
			dialogOptions?: { signal?: AbortSignal },
		) => {
			for (const handler of ctx.inputHandlers) {
				const result = handler("\x1b");
				if (result?.consume) break;
			}
			if (dialogOptions?.signal?.aborted) return undefined;
			return "LEAK";
		};
		await presentRefineResult(ctx, refined, "@prompt_refiner");
		expect(ctx.editorText).toBe("ORIGINAL DRAFT");
		expect(ctx.selectTitles).toHaveLength(2);
	});

	test("headless mode writes the editor and never reports submit", async () => {
		const ctx = mockUi({ hasUI: false });
		const submitted = await presentRefineResult(ctx, refined, "current");
		expect(ctx.editorText).toBe("REFINED PROMPT");
		expect(submitted).toBe(false);
	});

	test("fallback select title stays short; widget holds the prompt", async () => {
		const ctx = mockUi({ select: "Cancel" });
		await presentRefineResult(ctx, refined, "@prompt_refiner");
		expect(ctx.selectTitles).toHaveLength(1);
		expect(ctx.selectTitles[0]).toContain("@prompt_refiner");
		expect(ctx.selectTitles[0]).not.toContain("REFINED PROMPT");
		expect(ctx.selectTitles[0]).not.toContain("Added explicit acceptance criteria");
	});

	test("custom overlay shows prompt, notes, and actions", async () => {
		const ctx = mockUi({ useCustom: true, customChoice: "Apply" });
		await presentRefineResult(ctx, refined, "@prompt_refiner");
		const panel = ctx.customRenders.join("\n");
		expect(panel).toContain("REFINED PROMPT");
		expect(panel).toContain("Added explicit acceptance criteria");
		expect(panel).toContain("@prompt_refiner");
		expect(panel).toContain("Apply");
		expect(panel).toContain("Edit");
		expect(panel).toContain("Cancel");
		expect(ctx.selectTitles).toEqual([]);
		expect(ctx.editorText).toBe("REFINED PROMPT");
	});

	test("headless notify includes the refined prompt", async () => {
		const ctx = mockUi({ hasUI: false });
		await presentRefineResult(ctx, refined, "current");
		expect(ctx.notifies.join("\n")).toContain("REFINED PROMPT");
	});
});

describe("formatPreviewLines", () => {
	test("keeps header, notes, and prompt as separate blocks", () => {
		const lines = formatPreviewLines(refined, "@prompt_refiner", 72);
		expect(lines[0]).toBe("Refined · @prompt_refiner");
		expect(lines.join("\n")).toContain("Changes");
		expect(lines.join("\n")).toContain("Added explicit acceptance criteria");
		expect(lines.join("\n")).toContain("Prompt");
		expect(lines.join("\n")).toContain("REFINED PROMPT");
	});
});

describe("refine progress", () => {
	test("progress line has a spinner, ESC icon, and Refining text", () => {
		const line = formatRefineProgressLine(0);
		const plain = line.replace(/\x1b\[[0-9;]*m/g, "");
		expect(plain).toContain("⠋");
		expect(plain).toContain("󱊷");
		expect(plain).toContain("Refining");
		expect(plain).not.toContain("✦");
		expect(plain.indexOf("󱊷")).toBeLessThan(plain.indexOf("Refining"));
	});

	test("progress line changes over time", () => {
		expect(formatRefineProgressLine(0)).not.toBe(formatRefineProgressLine(240));
	});

	test("Refining text uses violet and blue, not theme success green", () => {
		const line = formatRefineProgressLine(0);
		const colors = [...line.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)].map((match) => ({
			r: Number(match[1]),
			g: Number(match[2]),
			b: Number(match[3]),
		}));
		expect(colors.length).toBeGreaterThan(0);
		for (const color of colors) {
			expect(color.b).toBeGreaterThan(color.g);
			expect(color.b).toBeGreaterThan(140);
			expect(color.r).toBeLessThan(color.b);
		}
	});

	test("startRefineProgress uses a widget, not footer status", () => {
		const ctx = mockUi({});
		startRefineProgress(ctx.ui);
		expect(ctx.statuses.size).toBe(0);
		expect(ctx.widgets.size).toBe(1);
		expect(ctx.notifies).toEqual([]);
	});

	test("stopRefineProgress clears the widget", () => {
		const ctx = mockUi({});
		startRefineProgress(ctx.ui);
		stopRefineProgress(ctx.ui);
		expect(ctx.widgets.size).toBe(0);
		expect(ctx.statuses.size).toBe(0);
	});
});

describe("refine cancel", () => {
	test("ESC and Ctrl+C are cancel keys", () => {
		expect(isRefineCancel("\x1b")).toBe(true);
		expect(isRefineCancel("\x03")).toBe(true);
		expect(isRefineCancel("a")).toBe(false);
	});

	test("attachRefineCancel aborts and consumes ESC", () => {
		const ctx = mockUi({});
		let aborted = false;
		const detach = attachRefineCancel(ctx.ui, () => {
			aborted = true;
		});
		expect(ctx.inputHandlers).toHaveLength(1);
		expect(ctx.inputHandlers[0]?.("\x1b")).toEqual({ consume: true });
		expect(aborted).toBe(true);
		detach();
		expect(ctx.inputHandlers).toHaveLength(0);
	});
});
