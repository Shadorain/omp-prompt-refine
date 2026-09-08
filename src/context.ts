import type { ContextPacket, ContextTurn, ProjectSnippet } from "./types.ts";

const PATH_RE = /(?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)*\.[A-Za-z][A-Za-z0-9.-]{1,}/g;
const SKILL_RE = /\/skill:[\w-]+/g;
const TICK_RE = /`([^`]+)`/g;
const QUOTE_RE = /"([^"]+)"/g;

export interface SessionLikeEntry {
	type?: string;
	message?: {
		role?: string;
		content?: unknown;
	};
}

export interface BuildContextArgs {
	draft: string;
	entries: SessionLikeEntry[];
	cwd: string;
	gitBranch?: string;
	projectSnippets?: ProjectSnippet[];
	maxEntries?: number;
	maxEntryChars?: number;
	maxTotalChars?: number;
}

export function buildContextPacket(args: BuildContextArgs): ContextPacket {
	const maxEntries = args.maxEntries ?? 8;
	const maxEntryChars = args.maxEntryChars ?? 1200;
	const maxTotalChars = args.maxTotalChars ?? 8000;

	const turns: ContextTurn[] = [];
	for (const entry of args.entries) {
		if (entry.type && entry.type !== "message") continue;
		const role = entry.message?.role;
		if (role !== "user" && role !== "assistant") continue;
		const text = clip(messageText(entry.message?.content), maxEntryChars);
		if (!text) continue;
		turns.push({ role, text });
	}

	const recent = turns.slice(-maxEntries);
	let used = 0;
	const bounded: ContextTurn[] = [];
	for (let i = recent.length - 1; i >= 0; i--) {
		const turn = recent[i];
		if (used + turn.text.length > maxTotalChars && bounded.length > 0) break;
		bounded.unshift(turn);
		used += turn.text.length;
	}

	const packet: ContextPacket = {
		draft: args.draft,
		cwd: args.cwd,
		recent: bounded,
		project: args.projectSnippets ?? [],
	};
	if (args.gitBranch) packet.gitBranch = args.gitBranch;
	return packet;
}

export function formatContextPacket(packet: ContextPacket): string {
	const recent = packet.recent
		.map((turn) => `${turn.role.toUpperCase()}: ${turn.text}`)
		.join("\n\n");
	const project = packet.project
		.map((snippet) => `${snippet.path}:\n${snippet.text}`)
		.join("\n\n");

	return [
		"CURRENT USER DRAFT: authoritative",
		`<draft>\n${packet.draft}\n</draft>`,
		"<context>",
		"EXPLICIT USER INSTRUCTIONS FROM RECENT CONTEXT: authoritative when they constrain this draft",
		"RECENT CONVERSATION: supporting context",
		"PROJECT/REPOSITORY METADATA: supporting context",
		`cwd: ${packet.cwd}`,
		packet.gitBranch ? `git branch: ${packet.gitBranch}` : "git branch: unknown",
		recent ? `\n${recent}` : "\n(no recent conversation)",
		project ? `\n${project}` : "",
		"</context>",
	].join("\n");
}

export function extractAnchors(text: string): string[] {
	const found = new Set<string>();
	for (const match of text.match(PATH_RE) ?? []) found.add(match);
	for (const match of text.match(SKILL_RE) ?? []) found.add(match);
	for (const match of text.matchAll(TICK_RE)) {
		if (match[1].trim()) found.add(match[1].trim());
	}
	for (const match of text.matchAll(QUOTE_RE)) {
		if (match[1].trim().length >= 4) found.add(match[1].trim());
	}
	return [...found];
}

export function missingAnchors(draft: string, refined: string): string[] {
	return extractAnchors(draft).filter((anchor) => !refined.includes(anchor));
}

export function lastUserDraft(entries: SessionLikeEntry[]): string | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type && entry.type !== "message") continue;
		if (entry.message?.role !== "user") continue;
		const text = messageText(entry.message.content);
		if (!text) continue;
		const first = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
		if (/^\/refine(?:\s|$)/.test(first)) continue;
		return text;
	}
	return undefined;
}

function messageText(content: unknown): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const record = block as { type?: string; text?: string };
		if (record.type === "text" && typeof record.text === "string") parts.push(record.text);
	}
	return parts.join("").trim();
}

function clip(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, Math.max(0, max - 1))}…`;
}
