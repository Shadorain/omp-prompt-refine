import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { parseRefineArgs, refineArgumentCompletions } from "./commands.ts";
import { buildContextPacket } from "./context.ts";
import { resolveCriticModel, resolveRefinerModel } from "./models.ts";
import { compilePrompt } from "./refine.ts";
import { runIsolatedInference } from "./session.ts";
import { RefineCancelledError, type IsolatedRunRequest, type ProjectSnippet } from "./types.ts";
import { attachRefineCancel, presentRefineResult, startRefineProgress, stopRefineProgress } from "./ui.ts";

const PROJECT_FILES = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"];
const PROJECT_SNIPPET_CHARS = 2000;

export default function promptRefinerExtension(pi: ExtensionAPI) {
	pi.setLabel("Prompt refiner");

	async function runRefine(args: string, ctx: ExtensionCommandContext) {
		const parsed = parseRefineArgs(args);
		if (!parsed.ok) {
			ctx.ui.notify(parsed.error, "error");
			return;
		}

		const original = ctx.ui.getEditorText();
		const draft = parsed.prompt || original.trim();
		if (!draft) {
			ctx.ui.notify(
				"Nothing to refine. Pass a prompt, put /refine on the first line of the draft, or press Alt+Shift+R while the draft is in the editor.",
				"warning",
			);
			return;
		}

		const compiler = resolveRefinerModel(ctx.models, parsed.model);
		if ("error" in compiler) {
			ctx.ui.notify(compiler.error, "error");
			return;
		}

		const cancel = new AbortController();
		const detachCancel = attachRefineCancel(ctx.ui, () => cancel.abort());
		startRefineProgress(ctx.ui);
		try {
			const packet = buildContextPacket({
				draft,
				entries: ctx.sessionManager.getBranch(),
				cwd: ctx.cwd,
				gitBranch: await gitBranch(pi, ctx.cwd),
				projectSnippets: readProjectSnippets(ctx.cwd),
			});
			const result = await compilePrompt({
				mode: parsed.mode,
				draft,
				packet,
				compiler,
				critic: parsed.mode === "deep" ? resolveCriticModel(ctx.models, compiler.model) : undefined,
				run: (request) => infer(ctx, { ...request, signal: cancel.signal }),
			});
			if (cancel.signal.aborted) throw new RefineCancelledError();
			stopRefineProgress(ctx.ui);
			await presentRefineResult(ctx, result, compiler.source);
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

	pi.registerCommand("refine", {
		description: "Compile the editor draft or /refine args into a stronger prompt without sending it",
		getArgumentCompletions: (prefix) => refineArgumentCompletions(prefix),
		handler: runRefine,
	});

	pi.registerShortcut("alt+shift+r", {
		description: "Refine the current editor draft without sending it",
		handler: async (ctx) => {
			await runRefine("", ctx as ExtensionCommandContext);
		},
	});
}

async function infer(ctx: ExtensionCommandContext, request: IsolatedRunRequest): Promise<string> {
	const spec = `${request.model.provider}/${request.model.id}`;
	const live = ctx.models.resolve(spec) ?? ctx.models.current() ?? ctx.model;
	if (!live) throw new Error(`Model "${spec}" is not available.`);
	return runIsolatedInference(
		{
			cwd: ctx.cwd,
			authStorage: ctx.modelRegistry.authStorage,
			modelRegistry: ctx.modelRegistry,
			model: live,
		},
		request,
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

function readProjectSnippets(cwd: string): ProjectSnippet[] {
	const snippets: ProjectSnippet[] = [];
	for (const name of PROJECT_FILES) {
		const path = join(cwd, name);
		if (!existsSync(path)) continue;
		try {
			const text = readFileSync(path, "utf8").slice(0, PROJECT_SNIPPET_CHARS).trim();
			if (text) snippets.push({ path: name, text });
		} catch {
			// Supporting context only; skip unreadable files.
		}
	}
	return snippets;
}
