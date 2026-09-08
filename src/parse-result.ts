import type { RefineResult } from "./types.ts";

export function parseRefineResult(text: string): RefineResult {
	const json = extractJson(text);
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error("Refiner did not return JSON.");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Refiner did not return JSON.");
	}
	const record = parsed as { prompt?: unknown; notes?: unknown };
	if (typeof record.prompt !== "string" || record.prompt.trim().length === 0) {
		throw new Error("Refiner returned an empty prompt.");
	}
	const notes: string[] = [];
	if (Array.isArray(record.notes)) {
		for (const note of record.notes) {
			if (typeof note === "string" && note.trim()) notes.push(note.trim());
		}
	}
	return { prompt: record.prompt.trim(), notes };
}

function extractJson(text: string): string {
	const trimmed = text.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenced) return fenced[1].trim();
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
	return trimmed;
}
