import type { TestSchema } from "../src/schemas/test";
export function fixture(
  type: TestSchema["type"] = "personality",
  count = 3,
): TestSchema {
  return {
    title: type === "knowledge" ? "C 语言基础测试" : "沟通风格测试",
    description: "通过具体场景探索你的沟通习惯。",
    type,
    sensitivity: "normal",
    estimated_time: 5,
    dimensions: [
      {
        id: "communication",
        name: "沟通倾向",
        description: "沟通习惯",
        minScore: 0,
        maxScore: 100,
      },
    ],
    questions: Array.from({ length: count }, (_, i) => ({
      id: `q${i + 1}`,
      type: "single_choice",
      text:
        type === "knowledge"
          ? `C 语言中第 ${i + 1} 个基础问题：哪个选项正确？`
          : `第 ${i + 1} 个沟通场景：你通常如何表达？`,
      options: [
        { id: "a", text: "先观察并梳理", scores: { communication: -2 } },
        { id: "b", text: "直接表达并讨论", scores: { communication: 2 } },
      ],
      correctAnswer: type === "knowledge" ? ["b"] : null,
      explanation: "选项 b 是标准答案。",
      difficulty: "easy",
      weight: 1,
      knowledgePoint: "基础语法",
      dimensionId: "communication",
      required: true,
    })),
    consistency_pairs:
      count >= 2
        ? [{ questionA: "q1", questionB: "q2", relation: "inverse", weight: 1 }]
        : [],
    result_config: {
      disclaimer: "仅供自我探索与学习参考。",
      labels: ["主动沟通型"],
    },
  };
}
export const analysis = {
  summary: "根据本次测试结果，你在这些场景中表现出主动沟通的倾向。",
  traits: ["表达清晰", "关注交流"],
  strengths: ["能够及时表达需求"],
  potentialIssues: ["可以给对方更多思考时间"],
  suggestions: ["在表达后留出倾听空间"],
  resultLabel: "主动沟通型",
  shareSummary: "我在这次探索中发现了主动沟通的倾向。",
};
