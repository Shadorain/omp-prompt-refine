import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { draftFromEditor, parseRefineArgs, refineArgumentCompletions } from "./commands.ts";
import { contextFileNames, readRefineConfig, refineConfigPath, writeRefineConfig } from "./config.ts";
import { buildContextPacket, lastUserDraft } from "./context.ts";
import { formatInterviewAnswers, proposeInterviewQuestions } from "./interview.ts";
import { resolveCriticModel, resolveRefinerModel } from "./models.ts";
import { pickSingleLabel } from "./picker.ts";
import { compilePrompt } from "./refine.ts";
import { runIsolatedInference } from "./session.ts";
import { RefineCancelledError, type IsolatedRunRequest, type ProjectSnippet } from "./types.ts";
import { attachRefineCancel, presentRefineResult, startRefineProgress, stopRefineProgress } from "./ui.ts";

const PROJECT_SNIPPET_CHARS = 2000;
const CURRENT_MODEL = "(current session model)";
const SAME_CRITIC = "(same as refiner)";

export default function promptRefinerExtension(pi: ExtensionAPI) {
	pi.setLabel("Prompt refiner");

	let catalog: string[] = [];
	let lastOriginal: string | undefined;

	function rememberOriginal(text: string) {
		lastOriginal = text;
	}

	function refreshCatalog(ctx: ExtensionContext) {
		catalog = ctx.models.list().map((model) => `${model.provider}/${model.id}`);
	}

	pi.on("session_start", async (_event, ctx) => {
		refreshCatalog(ctx);
	});

	async function runRefine(args: string, ctx: ExtensionContext) {
		refreshCatalog(ctx);
		const parsed = parseRefineArgs(args);
		if (!parsed.ok) {
			ctx.ui.notify(parsed.error, "error");
			return;
		}
		if (parsed.action === "undo") {
			undoLast(ctx);
			return;
		}
		if (parsed.action === "setup") {
			await runSetup(ctx);
			return;
		}

		const original = ctx.ui.getEditorText();
		let draft = parsed.prompt;
		let mode = parsed.mode;
		let model = parsed.model;
		let noContext = parsed.noContext === true;
		let last = parsed.last === true;
		let interview = parsed.interview === true;
		if (!draft && !last) {
			const peeled = draftFromEditor(original);
			if (!peeled.ok) {
				ctx.ui.notify(peeled.error, "error");
				return;
			}
			if (peeled.action === "undo") {
				undoLast(ctx);
				return;
			}
			if (peeled.action === "setup") {
				await runSetup(ctx);
				return;
			}
			draft = peeled.prompt;
			if (!args.trim()) {
				mode = peeled.mode;
				model = peeled.model;
				noContext = peeled.noContext === true;
				last = peeled.last === true;
				interview = peeled.interview === true;
			}
		}
		if (last) {
			draft = lastUserDraft(ctx.sessionManager.getBranch()) ?? "";
			if (!draft) {
				ctx.ui.notify("No previous user message to refine.", "warning");
				return;
			}
		}
		if (!draft) {
			ctx.ui.notify(
				"Nothing to refine. Pass a prompt, put /refine on the first line of the draft, or press Alt+Shift+R while the draft is in the editor.",
				"warning",
			);
			return;
		}

		const config = readRefineConfig();
		const compiler = resolveRefinerModel(ctx.models, model, config.refinerModel);
		if ("error" in compiler) {
			ctx.ui.notify(compiler.error, "error");
			return;
		}

		const cancel = new AbortController();
		const detachCancel = attachRefineCancel(ctx.ui, () => cancel.abort());
		startRefineProgress(ctx.ui);
		try {
			const packet = noContext
				? { draft, cwd: ctx.cwd, recent: [], project: [] }
				: buildContextPacket({
						draft,
						entries: ctx.sessionManager.getBranch(),
						cwd: ctx.cwd,
						gitBranch: await gitBranch(pi, ctx.cwd),
						projectSnippets: readProjectSnippets(ctx.cwd, contextFileNames(config.extraContextFiles)),
					});
			const run = (request: IsolatedRunRequest) => infer(pi, ctx, { ...request, signal: cancel.signal });
			if (interview) {
				if (typeof ctx.ui.askDialog !== "function") {
					throw new Error("Interview needs the interactive ask dialog.");
				}
				const questions = await proposeInterviewQuestions({
					draft,
					packet,
					model: compiler.model,
					run,
				});
				if (cancel.signal.aborted) throw new RefineCancelledError();
				if (questions.length > 0) {
					stopRefineProgress(ctx.ui);
					const asked = await ctx.ui.askDialog(questions, { signal: cancel.signal });
					startRefineProgress(ctx.ui);
					if (!asked || asked.kind !== "submit") throw new RefineCancelledError();
					packet.interview = formatInterviewAnswers(asked.results);
				}
			}
			const result = await compilePrompt({
				mode,
				draft,
				packet,
				compiler,
				critic: mode === "deep" ? resolveCriticModel(ctx.models, compiler.model, config.criticModel) : undefined,
				run,
			});
			if (cancel.signal.aborted) throw new RefineCancelledError();
			stopRefineProgress(ctx.ui);
			detachCancel();
			await presentRefineResult(ctx, result, compiler.source, rememberOriginal);
		} catch (error) {
			if (ctx.ui.getEditorText() !== original) ctx.ui.setEditorText(original);
			if (error instanceof RefineCancelledError || cancel.signal.aborted) {
				ctx.ui.notify("Refinement cancelled.", "warning");
			} else {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		} finally {
			detachCancel();
			stopRefineProgress(ctx.ui);
		}
	}

	function undoLast(ctx: ExtensionContext) {
		if (lastOriginal == null) {
			ctx.ui.notify("Nothing to undo. Apply a refine first.", "warning");
			return;
		}
		ctx.ui.setEditorText(lastOriginal);
		ctx.ui.notify("Restored the pre-Apply draft.", "info");
	}

	async function runSetup(ctx: ExtensionContext) {
		const specs = catalog.length > 0 ? catalog : ctx.models.list().map((model) => `${model.provider}/${model.id}`);
		const refiner = await pickSingleLabel(
			ctx,
			"Default /refine model",
			[{ label: CURRENT_MODEL, description: "Whatever is selected in this session" }, ...specs.map((spec) => ({ label: spec }))],
			"Used when /refine has no --model",
		);
		if (refiner === undefined) {
			ctx.ui.notify("Setup cancelled.", "warning");
			return;
		}
		const critic = await pickSingleLabel(
			ctx,
			"Default critic model",
			[{ label: SAME_CRITIC, description: "Deep mode uses the refiner" }, ...specs.map((spec) => ({ label: spec }))],
			"Deep mode only",
		);
		if (critic === undefined) {
			ctx.ui.notify("Setup cancelled.", "warning");
			return;
		}
		const current = readRefineConfig();
		const extraText = await ctx.ui.editor(
			"Extra context files, one per line (Esc keeps current extras)",
			(current.extraContextFiles ?? []).join("\n"),
		);
		const extra =
			extraText == null
				? current.extraContextFiles
				: extraText
						.split(/\r?\n/)
						.map((line) => line.trim())
						.filter(Boolean);
		writeRefineConfig({
			version: 1,
			refinerModel: refiner === CURRENT_MODEL ? undefined : refiner,
			criticModel: critic === SAME_CRITIC ? undefined : critic,
			extraContextFiles: extra,
		});
		ctx.ui.notify(`Saved refine config to ${refineConfigPath()}`, "info");
	}

	pi.registerCommand("refine", {
		description: "Reword the draft so the agent is more likely to do what you meant",
		getArgumentCompletions: (prefix) => refineArgumentCompletions(prefix, catalog),
		handler: async (args, ctx) => {
			await runRefine(args, ctx);
		},
	});

	pi.registerShortcut("alt+shift+r", {
		description: "Reword the current editor draft for the agent",
		handler: async (ctx) => {
			await runRefine("", ctx);
		},
	});
}

async function infer(pi: ExtensionAPI, ctx: ExtensionContext, request: IsolatedRunRequest): Promise<string> {
	const spec = `${request.model.provider}/${request.model.id}`;
	const live = ctx.models.resolve(spec);
	if (!live) throw new Error(`Model "${spec}" is not available.`);
	const thinkingLevel = pi.getThinkingLevel();
	return runIsolatedInference(
		{
			cwd: ctx.cwd,
			authStorage: ctx.modelRegistry.authStorage,
			modelRegistry: ctx.modelRegistry,
			model: live,
		},
		thinkingLevel ? { ...request, thinkingLevel } : request,
	);
}

async function gitBranch(pi: ExtensionAPI, cwd: string): Promise<string | undefined> {
	try {
		const result = await pi.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
		if (result.code !== 0) return undefined;
		const branch = (result.stdout ?? "").trim();
		if (!branch || branch === "HEAD") return undefined;
		return branch;
	} catch {
		return undefined;
	}
}

function readProjectSnippets(cwd: string, names: string[]): ProjectSnippet[] {
	const snippets: ProjectSnippet[] = [];
	for (const name of names) {
		const path = join(cwd, name);
		if (!existsSync(path)) continue;
		try {
			const text = readFileSync(path, "utf8").slice(0, PROJECT_SNIPPET_CHARS).trim();
			if (text) snippets.push({ path: name, text });
		} catch {
			continue;
		}
	}
	return snippets;
}
