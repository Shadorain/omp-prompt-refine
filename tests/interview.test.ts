import { describe, expect, test } from "bun:test";
import { formatContextPacket } from "../src/context.ts";
import {
	formatInterviewAnswers,
	parseInterviewQuestions,
	proposeInterviewQuestions,
} from "../src/interview.ts";
import type { IsolatedRun } from "../src/types.ts";

describe("parseInterviewQuestions", () => {
	test("keeps at most five questions with at least two options each", () => {
		const questions = parseInterviewQuestions(
			JSON.stringify({
				questions: [
					{
						id: "done",
						question: "What does done look like?",
						recommended: 0,
						options: [{ label: "Tests pass" }, { label: "CI is green" }, { label: "Ship a spike" }],
					},
					{
						id: "scope",
						question: "What is out of scope?",
						options: [{ label: "No API change" }, { label: "API may change" }],
					},
				],
			}),
		);
		expect(questions).toHaveLength(2);
		expect(questions[0]?.id).toBe("done");
		expect(questions[0]?.options.map((option) => option.label)).toEqual(["Tests pass", "CI is green", "Ship a spike"]);
		expect(questions[0]?.recommended).toBe(0);
	});

	test("returns no questions when the draft is already enough", () => {
		expect(parseInterviewQuestions(JSON.stringify({ questions: [] }))).toEqual([]);
	});

	test("drops questions with fewer than two options", () => {
		const questions = parseInterviewQuestions(
			JSON.stringify({
				questions: [{ id: "bad", question: "Huh?", options: [{ label: "Only one" }] }],
			}),
		);
		expect(questions).toEqual([]);
	});

	test("extracts JSON from prose wrapping", () => {
		const questions = parseInterviewQuestions(`Sure, here you go:
\`\`\`json
{"questions":[{"id":"done","question":"What does done look like?","options":[{"label":"Tests pass"},{"label":"Ship a spike"}],"recommended":0}]}
\`\`\`
`);
		expect(questions).toHaveLength(1);
		expect(questions[0]?.id).toBe("done");
	});

	test("accepts a top-level questions array", () => {
		const questions = parseInterviewQuestions(
			JSON.stringify([
				{
					id: "done",
					question: "What does done look like?",
					options: [{ label: "Tests pass" }, { label: "Ship a spike" }],
				},
			]),
		);
		expect(questions).toHaveLength(1);
	});
});

describe("formatInterviewAnswers", () => {
	test("records selected options, Other text, and notes as authoritative", () => {
		const text = formatInterviewAnswers([
			{
				id: "done",
				question: "What does done look like?",
				options: ["Tests pass", "CI is green"],
				multi: false,
				selectedOptions: ["Tests pass"],
				note: "also grep for the old timeout",
			},
			{
				id: "scope",
				question: "What is out of scope?",
				options: ["No API change"],
				multi: false,
				selectedOptions: [],
				customInput: "no new endpoints",
			},
		]);
		expect(text).toContain("What does done look like?");
		expect(text).toContain("Tests pass");
		expect(text).toContain("also grep for the old timeout");
		expect(text).toContain("no new endpoints");
	});
});

describe("proposeInterviewQuestions", () => {
	test("asks the isolated runner and parses its JSON", async () => {
		const run: IsolatedRun = async ({ systemPrompt, userPrompt }) => {
			expect(systemPrompt).toContain("interview");
			expect(userPrompt).toContain("Return JSON only");
			expect(userPrompt).toContain("fix the login timeout");
			return JSON.stringify({
				questions: [
					{
						id: "done",
						question: "How will you know this is fixed?",
						options: [{ label: "No 5-minute kicks remain" }, { label: "Just auth.ts" }],
						recommended: 0,
					},
				],
			});
		};
		const questions = await proposeInterviewQuestions({
			draft: "fix the login timeout",
			packet: { draft: "fix the login timeout", cwd: "/tmp", recent: [], project: [] },
			model: { provider: "test", id: "refiner" },
			run,
		});
		expect(questions[0]?.question).toContain("How will you know");
	});
});

describe("formatContextPacket interview answers", () => {
	test("marks interview answers as authoritative", () => {
		const text = formatContextPacket({
			draft: "fix login",
			cwd: "/tmp",
			recent: [],
			project: [],
			interview: "Q: How will you know this is fixed?\nA: No 5-minute kicks remain",
		});
		expect(text).toContain("INTERVIEW ANSWERS: authoritative");
		expect(text).toContain("No 5-minute kicks remain");
	});
});
