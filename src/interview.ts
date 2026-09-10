import { formatContextPacket } from "./context.ts";
import { extractJson } from "./parse-result.ts";
import { interviewerSystemPrompt } from "./prompts.ts";
import type { ContextPacket, IsolatedRun, ModelRef } from "./types.ts";

const INTERVIEW_DEADLINE_MS = 60_000;
const MAX_QUESTIONS = 5;

export type InterviewOption = {
	label: string;
	description?: string;
};

export type InterviewQuestion = {
	id: string;
	question: string;
	header?: string;
	options: InterviewOption[];
	multi?: boolean;
	recommended?: number;
};

export type InterviewAnswer = {
	id: string;
	question: string;
	options: string[];
	multi: boolean;
	selectedOptions: string[];
	customInput?: string;
	note?: string;
};

export async function proposeInterviewQuestions(args: {
	draft: string;
	packet: ContextPacket;
	model: ModelRef;
	run: IsolatedRun;
}): Promise<InterviewQuestion[]> {
	const userPrompt = [
		"Write interview questions for the draft.",
		'Return JSON only. Shape: {"questions":[{"id":"done","question":"...","options":[{"label":"..."}],"recommended":0}]}',
		'If nothing is missing, return {"questions":[]}.',
		formatContextPacket({ ...args.packet, draft: args.draft }),
	].join("\n\n");
	const request = {
		model: args.model,
		systemPrompt: interviewerSystemPrompt(),
		userPrompt,
		deadlineMs: INTERVIEW_DEADLINE_MS,
	};
	const first = await args.run(request);
	try {
		return parseInterviewQuestions(first);
	} catch (error) {
		if (!(error instanceof Error) || !/json/i.test(error.message)) throw error;
		const retry = await args.run({
			...request,
			userPrompt: `${userPrompt}\n\nReturn JSON only. Shape: {"questions":[...]}. No prose.`,
		});
		try {
			return parseInterviewQuestions(retry);
		} catch {
			const sample = (retry || first).trim().slice(0, 240);
			throw new Error(
				sample
					? `Interviewer did not return JSON. Got: ${sample}`
					: "Interviewer did not return JSON.",
			);
		}
	}
}

export function parseInterviewQuestions(text: string): InterviewQuestion[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(extractJson(text));
	} catch {
		throw new Error("Interviewer did not return JSON.");
	}
	const raw = Array.isArray(parsed)
		? parsed
		: parsed && typeof parsed === "object" && "questions" in parsed && Array.isArray(parsed.questions)
			? parsed.questions
			: null;
	if (!raw) return [];
	const questions: InterviewQuestion[] = [];
	for (const item of raw) {
		if (questions.length >= MAX_QUESTIONS) break;
		const question = asQuestion(item, questions.length);
		if (question) questions.push(question);
	}
	return questions;
}

export function formatInterviewAnswers(answers: InterviewAnswer[]): string {
	return answers
		.map((answer) => {
			const picked = answer.selectedOptions.filter(Boolean);
			const custom = answer.customInput?.trim();
			const note = answer.note?.trim();
			const lines = [`Q: ${answer.question}`];
			if (picked.length > 0) lines.push(`A: ${picked.join("; ")}`);
			if (custom) lines.push(`Other: ${custom}`);
			if (note) lines.push(`Note: ${note}`);
			return lines.join("\n");
		})
		.join("\n\n");
}

function asQuestion(item: unknown, index: number): InterviewQuestion | undefined {
	if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
	if (!("question" in item) || typeof item.question !== "string" || !item.question.trim()) {
		return undefined;
	}
	if (!("options" in item) || !Array.isArray(item.options)) return undefined;
	const options: InterviewOption[] = [];
	for (const option of item.options) {
		if (!option || typeof option !== "object" || Array.isArray(option)) continue;
		if (!("label" in option) || typeof option.label !== "string" || !option.label.trim()) continue;
		const mapped: InterviewOption = { label: option.label.trim() };
		if ("description" in option && typeof option.description === "string" && option.description.trim()) {
			mapped.description = option.description.trim();
		}
		options.push(mapped);
	}
	if (options.length < 2) return undefined;
	const id =
		"id" in item && typeof item.id === "string" && item.id.trim() ? item.id.trim() : `q${index + 1}`;
	const question: InterviewQuestion = {
		id,
		question: item.question.trim(),
		options,
	};
	if ("header" in item && typeof item.header === "string" && item.header.trim()) {
		question.header = item.header.trim();
	}
	if ("multi" in item && item.multi === true) question.multi = true;
	if (
		"recommended" in item &&
		typeof item.recommended === "number" &&
		Number.isInteger(item.recommended) &&
		item.recommended >= 0 &&
		item.recommended < options.length
	) {
		question.recommended = item.recommended;
	}
	return question;
}
