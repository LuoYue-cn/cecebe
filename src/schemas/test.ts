import { z } from "zod";
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/);
export const testTypes = [
  "knowledge",
  "ability",
  "personality",
  "preference",
  "relationship",
  "entertainment",
  "self_exploration",
] as const;
const option = z
  .object({
    id,
    text: z.string().min(1).max(600),
    scores: z.record(z.number().finite().min(-100).max(100)),
  })
  .strict();
const question = z
  .object({
    id,
    type: z.enum([
      "single_choice",
      "multiple_choice",
      "scale",
      "true_false",
      "text",
    ]),
    text: z.string().min(1).max(2000),
    options: z.array(option).max(10),
    correctAnswer: z.array(id).nullable(),
    explanation: z.string().max(2000),
    difficulty: z.enum(["easy", "medium", "hard"]),
    weight: z.number().finite().positive().max(10),
    knowledgePoint: z.string().max(100),
    dimensionId: id.nullable(),
    required: z.boolean(),
  })
  .strict();
export const testSchema = z
  .object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(2000),
    type: z.enum(testTypes),
    sensitivity: z.enum(["normal", "sensitive", "high_risk"]),
    estimated_time: z.number().int().min(1).max(180),
    dimensions: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1).max(80),
            description: z.string().max(1000),
            minScore: z.literal(0),
            maxScore: z.literal(100),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    questions: z.array(question).min(1).max(100),
    consistency_pairs: z
      .array(
        z
          .object({
            questionA: id,
            questionB: id,
            relation: z.enum(["inverse", "same"]),
            weight: z.number().finite().positive().max(10),
          })
          .strict(),
      )
      .max(50),
    result_config: z
      .object({
        disclaimer: z.string().max(1000),
        labels: z.array(z.string().max(80)).max(20),
      })
      .strict(),
  })
  .strict()
  .superRefine((test, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const dims = new Set(test.dimensions.map((d) => d.id));
    const qs = new Map(test.questions.map((q) => [q.id, q]));
    if (
      dims.size !== test.dimensions.length ||
      qs.size !== test.questions.length
    )
      issue("维度和题目 ID 必须唯一");
    let scored = 0;
    for (const q of test.questions) {
      const ids = new Set(q.options.map((o) => o.id));
      if (ids.size !== q.options.length) issue("选项 ID 重复");
      if (q.type === "text") {
        if (q.options.length || q.correctAnswer?.length)
          issue("开放题不能包含选项或标准答案");
      } else {
        scored++;
        if (q.options.length < 2) issue("选项至少两个");
      }
      if (q.type === "true_false" && q.options.length !== 2)
        issue("判断题必须两个选项");
      if (q.type === "scale" && q.options.length < 3)
        issue("量表必须至少三个等级");
      if (q.dimensionId && !dims.has(q.dimensionId)) issue("知识维度不存在");
      for (const o of q.options)
        for (const key of Object.keys(o.scores))
          if (!dims.has(key)) issue("评分维度不存在");
      if (
        q.correctAnswer &&
        (new Set(q.correctAnswer).size !== q.correctAnswer.length ||
          q.correctAnswer.some((a) => !ids.has(a)))
      )
        issue("正确答案引用非法");
      if (
        q.type !== "multiple_choice" &&
        q.correctAnswer &&
        q.correctAnswer.length !== 1
      )
        issue("单选标准答案必须唯一");
      if (
        ["knowledge", "ability"].includes(test.type) &&
        q.type !== "text" &&
        (!q.correctAnswer?.length || !q.dimensionId)
      )
        issue("知识/能力题必须有标准答案和知识维度");
      if (
        !["knowledge", "ability"].includes(test.type) &&
        q.type !== "text" &&
        !q.options.some((o) => Object.keys(o.scores).length)
      )
        issue("倾向题必须定义评分映射");
      if (
        !["knowledge", "ability"].includes(test.type) &&
        q.correctAnswer !== null
      )
        issue("倾向题不能设置标准答案");
    }
    if (!scored) issue("必须至少有一道可评分题");
    for (const d of dims)
      if (
        !test.questions.some(
          (q) =>
            q.type !== "text" &&
            (["knowledge", "ability"].includes(test.type)
              ? q.dimensionId === d
              : q.options.some((o) => o.scores[d] !== undefined)),
        )
      )
        issue("维度没有评分题");
    for (const pair of test.consistency_pairs) {
      const a = qs.get(pair.questionA),
        b = qs.get(pair.questionB);
      if (
        !a ||
        !b ||
        a === b ||
        !["scale", "single_choice", "true_false"].includes(a.type) ||
        !["scale", "single_choice", "true_false"].includes(b.type)
      )
        issue("一致性关系必须引用可排序单选题");
    }
  });
// Strict Structured Output cannot use an object with arbitrary dimension keys.
// The wire format uses fixed-key entries; canonical storage keeps score maps.
const scoreEntry = z
  .object({ dimensionId: id, score: z.number().finite().min(-100).max(100) })
  .strict();
const wireOption = option.extend({ scores: z.array(scoreEntry).max(12) });
const wireQuestion = question.extend({ options: z.array(wireOption).max(10) });
export const generationWireSchema = testSchema
  .innerType()
  .extend({ questions: z.array(wireQuestion).min(1).max(100) })
  .strict();
export function fromWire(value: z.infer<typeof generationWireSchema>) {
  for (const q of value.questions)
    for (const o of q.options)
      if (new Set(o.scores.map((s) => s.dimensionId)).size !== o.scores.length)
        throw new Error("评分维度重复");
  return testSchema.parse({
    ...value,
    questions: value.questions.map((q) => ({
      ...q,
      options: q.options.map((o) => ({
        ...o,
        scores: Object.fromEntries(
          o.scores.map((s) => [s.dimensionId, s.score]),
        ),
      })),
    })),
  });
}
export type TestSchema = z.infer<typeof testSchema>;
export type Answers = Record<string, string | string[]>;
export const answersSchema = z.record(
  z.union([z.string().max(3000), z.array(z.string().max(40)).max(10)]),
);
export function validateAnswers(test: TestSchema, answers: Answers) {
  for (const key of Object.keys(answers))
    if (!test.questions.some((q) => q.id === key))
      throw new Error("答案包含不存在的题目");
  for (const q of test.questions) {
    const value = answers[q.id];
    if (
      q.required &&
      (value === undefined ||
        value === "" ||
        (Array.isArray(value) && !value.length))
    )
      throw new Error(`请完成题目 ${q.id}`);
    if (value === undefined || value === "") continue;
    if (q.type === "text") {
      if (typeof value !== "string") throw new Error("开放题答案不合法");
      continue;
    }
    const selected = Array.isArray(value) ? value : [value];
    if (
      q.type === "multiple_choice"
        ? !Array.isArray(value)
        : Array.isArray(value)
    )
      throw new Error("答案类型不合法");
    if (
      new Set(selected).size !== selected.length ||
      selected.some((v) => !q.options.some((o) => o.id === v))
    )
      throw new Error("选项不合法");
  }
}
export function publicSchema(test: TestSchema) {
  return {
    title: test.title,
    description: test.description,
    type: test.type,
    sensitivity: test.sensitivity,
    estimated_time: test.estimated_time,
    dimensions: test.dimensions,
    questions: test.questions.map(({ id, type, text, options, required }) => ({
      id,
      type,
      text,
      required,
      options: options.map(({ id, text }) => ({ id, text })),
    })),
    result_config: test.result_config,
  };
}
export const analysisSchema = z
  .object({
    summary: z.string().min(1).max(2000),
    traits: z.array(z.string().max(300)).max(8),
    strengths: z.array(z.string().max(600)).max(8),
    potentialIssues: z.array(z.string().max(600)).max(8),
    suggestions: z.array(z.string().max(600)).max(8),
    resultLabel: z.string().min(1).max(100),
    shareSummary: z.string().max(300),
    dimensionInsights: z
      .array(
        z
          .object({
            dimensionId: id,
            label: z.string().min(1).max(80),
            description: z.string().min(1).max(300),
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict();
export type Analysis = z.infer<typeof analysisSchema>;
