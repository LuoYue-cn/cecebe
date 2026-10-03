import { validateAnswers, type TestSchema, type Answers } from "@/schemas/test";
import { consistency } from "./consistency";
const percent = (n: number) =>
  Math.max(0, Math.min(100, Math.round(n * 10000) / 100));
export class ScoringEngine {
  static calculate(test: TestSchema, answers: Answers) {
    validateAnswers(test, answers);
    const dimensions: Record<string, number> = {};
    const review: {
      questionId: string;
      question: string;
      selected: string[];
      correctAnswer: string[];
      explanation: string;
      correct: boolean;
    }[] = [];
    const knowledge = ["knowledge", "ability"].includes(test.type);
    let correctCount = 0,
      gradedCount = 0,
      totalWeight = 0,
      earned = 0;
    for (const d of test.dimensions) {
      let raw = 0,
        min = 0,
        max = 0;
      for (const q of test.questions) {
        if (q.type === "text") continue;
        const value = answers[q.id];
        const selected =
          value === undefined || value === ""
            ? []
            : Array.isArray(value)
              ? value
              : [value];
        if (knowledge) {
          if (q.dimensionId !== d.id) continue;
          const correct =
            selected.length === (q.correctAnswer?.length ?? 0) &&
            selected.every((s) => q.correctAnswer?.includes(s));
          max += q.weight;
          if (correct) raw += q.weight;
        } else {
          const scores = q.options.map((o) => (o.scores[d.id] ?? 0) * q.weight);
          if (q.type === "multiple_choice") {
            min += scores.filter((v) => v < 0).reduce((a, b) => a + b, 0);
            max += scores.filter((v) => v > 0).reduce((a, b) => a + b, 0);
          } else {
            min += Math.min(...scores);
            max += Math.max(...scores);
          }
          raw += q.options
            .filter((o) => selected.includes(o.id))
            .reduce((a, o) => a + (o.scores[d.id] ?? 0) * q.weight, 0);
        }
      }
      dimensions[d.id] = max === min ? 50 : percent((raw - min) / (max - min));
    }
    if (knowledge)
      for (const q of test.questions.filter((q) => q.type !== "text")) {
        const value = answers[q.id];
        const selected =
          value === undefined || value === ""
            ? []
            : Array.isArray(value)
              ? value
              : [value];
        const correct =
          selected.length === (q.correctAnswer?.length ?? 0) &&
          selected.every((s) => q.correctAnswer?.includes(s));
        gradedCount++;
        totalWeight += q.weight;
        if (correct) {
          correctCount++;
          earned += q.weight;
        }
        review.push({
          questionId: q.id,
          question: q.text,
          selected,
          correctAnswer: q.correctAnswer ?? [],
          explanation: q.explanation,
          correct,
        });
      }
    const totalScore = knowledge
      ? percent(earned / totalWeight)
      : Math.round(
          (Object.values(dimensions).reduce((a, b) => a + b, 0) /
            test.dimensions.length) *
            100,
        ) / 100;
    return {
      totalScore,
      dimensions,
      consistencyScore: consistency(test, answers),
      metadata: {
        knowledge,
        correctCount,
        wrongCount: gradedCount - correctCount,
        accuracy: gradedCount ? percent(correctCount / gradedCount) : null,
        review,
      },
    };
  }
}
