import { describe, expect, test } from "bun:test";
import {
	attachRefineCancel,
	formatRefineProgressLine,
	isRefineCancel,
	presentRefineResult,
	startRefineProgress,
	stopRefineProgress,
} from "../src/ui.ts";
import type { RefineResult } from "../src/types.ts";

function mockUi(options: {
	select?: string | undefined;
	editor?: string | undefined;
	hasUI?: boolean;
}) {
	let editorText = "ORIGINAL DRAFT";
	const notifies: string[] = [];
	const selectTitles: string[] = [];
	const working: Array<string | undefined> = [];
	const statuses = new Map<string, string>();
	const widgets = new Map<string, unknown>();
	const inputHandlers: Array<(data: string) => { consume?: boolean } | undefined> = [];
	return {
		hasUI: options.hasUI ?? true,
		notifies,
		selectTitles,
		working,
		statuses,
		widgets,
		inputHandlers,
		get editorText() {
			return editorText;
		},
		ui: {
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
		},
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
		const ctx = mockUi({ select: "Edit", editor: undefined });
		ctx.ui.editor = async () => undefined;
		await presentRefineResult(ctx, refined, "@prompt_refiner");
		expect(ctx.editorText).toBe("ORIGINAL DRAFT");
	});

	test("headless mode writes the editor and never reports submit", async () => {
		const ctx = mockUi({ hasUI: false });
		const submitted = await presentRefineResult(ctx, refined, "current");
		expect(ctx.editorText).toBe("REFINED PROMPT");
		expect(submitted).toBe(false);
	});

	test("select title includes the refined prompt before Apply/Edit/Cancel", async () => {
		const ctx = mockUi({ select: "Cancel" });
		await presentRefineResult(ctx, refined, "@prompt_refiner");
		expect(ctx.selectTitles).toHaveLength(1);
		expect(ctx.selectTitles[0]).toContain("REFINED PROMPT");
		expect(ctx.selectTitles[0]).toContain("Added explicit acceptance criteria");
		expect(ctx.selectTitles[0]).toContain("@prompt_refiner");
	});

	test("headless notify includes the refined prompt", async () => {
		const ctx = mockUi({ hasUI: false });
		await presentRefineResult(ctx, refined, "current");
		expect(ctx.notifies.join("\n")).toContain("REFINED PROMPT");
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
