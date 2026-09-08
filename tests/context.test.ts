import { describe, expect, test } from "bun:test";
import { buildContextPacket, extractAnchors, lastUserDraft, missingAnchors } from "../src/context.ts";

const user = (text: string) => ({
	type: "message" as const,
	message: { role: "user", content: [{ type: "text", text }] },
});
const assistant = (text: string) => ({
	type: "message" as const,
	message: { role: "assistant", content: [{ type: "text", text }] },
});
const tool = (text: string) => ({
	type: "message" as const,
	message: { role: "toolResult", content: [{ type: "text", text }] },
});

describe("buildContextPacket", () => {
	test("keeps the draft authoritative and bounds recent user/assistant turns", () => {
		const entries = [];
		for (let i = 0; i < 20; i++) {
			entries.push(user(`user ${i}`));
			entries.push(assistant(`assistant ${i}`));
			entries.push(tool(`tool noise ${i} `.repeat(50)));
		}

		const packet = buildContextPacket({
			draft: "ship the invoice exporter",
			entries,
			cwd: "/tmp/project",
			gitBranch: "feat/invoices",
			projectSnippets: [{ path: "AGENTS.md", text: "Use bun test." }],
			maxEntries: 8,
			maxEntryChars: 200,
			maxTotalChars: 4000,
		});

		expect(packet.draft).toBe("ship the invoice exporter");
		expect(packet.cwd).toBe("/tmp/project");
		expect(packet.gitBranch).toBe("feat/invoices");
		expect(packet.recent).toHaveLength(8);
		expect(packet.recent.every((row) => row.role === "user" || row.role === "assistant")).toBe(true);
		expect(packet.recent.map((row) => row.text).join(" ")).not.toContain("tool noise");
		expect(packet.project[0]?.path).toBe("AGENTS.md");
	});

	test("truncates oversized entries instead of dumping the session", () => {
		const packet = buildContextPacket({
			draft: "x",
			entries: [user("n".repeat(5000))],
			cwd: "/tmp",
			maxEntries: 8,
			maxEntryChars: 80,
			maxTotalChars: 200,
		});
		expect(packet.recent[0]?.text.length).toBeLessThanOrEqual(80);
	});
});

describe("lastUserDraft", () => {
	test("returns the latest user turn, skipping /refine itself", () => {
		const text = lastUserDraft([
			user("first ask"),
			assistant("ok"),
			user("the real request"),
			assistant("working"),
			user("/refine --deep"),
		]);
		expect(text).toBe("the real request");
	});

	test("returns undefined when there is no prior user turn", () => {
		expect(lastUserDraft([assistant("hello"), user("/refine")])).toBeUndefined();
	});
});

describe("extractAnchors / missingAnchors", () => {
	test("preserves paths, skill names, and quoted constraints", () => {
		const draft =
			'Use /skill:brainstorming on src/auth/session.ts and keep "no compatibility facade". Limit is 12.';
		const refined =
			'Use /skill:brainstorming. Search src/auth/session.ts. Keep "no compatibility facade". Limit is 12.';
		expect(missingAnchors(draft, refined)).toEqual([]);
	});

	test("reports dropped path and skill tokens", () => {
		const draft = "Fix src/payments/ledger.ts using /skill:systematic-debugging";
		const refined = "Fix the payments code.";
		const missing = missingAnchors(draft, refined);
		expect(missing).toContain("src/payments/ledger.ts");
		expect(missing).toContain("/skill:systematic-debugging");
	});

	test("treats top-level files as anchors", () => {
		const draft = "Update package.json and CLAUDE.md";
		expect(extractAnchors(draft)).toEqual(expect.arrayContaining(["package.json", "CLAUDE.md"]));
		expect(missingAnchors(draft, "Update the package manifest.")).toEqual(
			expect.arrayContaining(["package.json", "CLAUDE.md"]),
		);
		expect(missingAnchors(draft, "Update package.json and CLAUDE.md")).toEqual([]);
	});
});
