import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"];

export type RefineConfig = {
	version: 1;
	refinerModel?: string;
	criticModel?: string;
	extraContextFiles?: string[];
};

export function agentDir(): string {
	return (
		process.env.PI_CODING_AGENT_DIR?.trim() ||
		process.env.OMP_AGENT_DIR?.trim() ||
		join(homedir(), ".omp", "agent")
	);
}

export function refineConfigPath(): string {
	return process.env.OMP_PROMPT_REFINE_CONFIG?.trim() || join(agentDir(), "prompt-refine.json");
}

export function contextFileNames(extra?: string[]): string[] {
	const names = [...DEFAULT_CONTEXT_FILES];
	for (const raw of extra ?? []) {
		const name = raw.trim();
		if (name && !names.includes(name)) names.push(name);
	}
	return names;
}

export function readRefineConfig(): RefineConfig {
	const path = refineConfigPath();
	if (!existsSync(path)) return { version: 1 };
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<RefineConfig>;
		const extra = Array.isArray(parsed.extraContextFiles)
			? parsed.extraContextFiles.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
			: undefined;
		const config: RefineConfig = { version: 1 };
		if (typeof parsed.refinerModel === "string" && parsed.refinerModel.trim()) {
			config.refinerModel = parsed.refinerModel.trim();
		}
		if (typeof parsed.criticModel === "string" && parsed.criticModel.trim()) {
			config.criticModel = parsed.criticModel.trim();
		}
		if (extra && extra.length > 0) config.extraContextFiles = extra.map((item) => item.trim());
		return config;
	} catch {
		return { version: 1 };
	}
}

export function writeRefineConfig(config: RefineConfig): void {
	const path = refineConfigPath();
	mkdirSync(dirname(path), { recursive: true });
	const body: RefineConfig = { version: 1 };
	if (config.refinerModel) body.refinerModel = config.refinerModel;
	if (config.criticModel) body.criticModel = config.criticModel;
	if (config.extraContextFiles && config.extraContextFiles.length > 0) {
		body.extraContextFiles = config.extraContextFiles;
	}
	writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}
