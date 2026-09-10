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

export function extractJson(text: string): string {
	const trimmed = text.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const body = (fenced ? fenced[1].trim() : trimmed) || trimmed;
	const arr = body.indexOf("[");
	const obj = body.indexOf("{");
	if (arr >= 0 && (obj < 0 || arr < obj)) {
		const end = body.lastIndexOf("]");
		if (end > arr) return body.slice(arr, end + 1);
	}
	if (obj >= 0) {
		const end = body.lastIndexOf("}");
		if (end > obj) return body.slice(obj, end + 1);
	}
	return body;
}
