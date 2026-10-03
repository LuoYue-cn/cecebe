import type { TestSchema, Answers } from "@/schemas/test";
export function consistency(test: TestSchema, answers: Answers) {
  let sum = 0,
    weights = 0;
  for (const pair of test.consistency_pairs) {
    const a = test.questions.find((q) => q.id === pair.questionA)!,
      b = test.questions.find((q) => q.id === pair.questionB)!;
    const av = a.options.findIndex((o) => o.id === answers[a.id]),
      bv = b.options.findIndex((o) => o.id === answers[b.id]);
    if (av < 0 || bv < 0) continue;
    const x = av / (a.options.length - 1),
      y = bv / (b.options.length - 1);
    sum +=
      (1 - Math.abs(pair.relation === "inverse" ? x + y - 1 : x - y)) *
      pair.weight;
    weights += pair.weight;
  }
  return weights ? Math.round((sum / weights) * 100) : null;
}
