import { describe, it, expect } from "vitest";
import { fixture } from "./fixtures";
import { ScoringEngine } from "../src/scoring/engine";
import { consistency } from "../src/scoring/consistency";
import {
  testSchema,
  publicSchema,
  validateAnswers,
  generationWireSchema,
  fromWire,
} from "../src/schemas/test";
import {
  canShare,
  canOwn,
  isAdmin,
  isSuper,
  installAllowed,
  resultSensitivity,
} from "../src/security/permissions";
import { encrypt, decrypt } from "../src/security/crypto";
import { enforceContent, sensitivity } from "../src/security/content";
import { settingsSchema } from "../src/lib/settings";
import { zodToJsonSchema } from "zod-to-json-schema";

it("wire schema keeps structured output objects strict and converts to score maps", () => {
  const canonical = fixture();
  const wire = {
    ...canonical,
    questions: canonical.questions.map((q) => ({
      ...q,
      options: q.options.map((o) => ({
        ...o,
        scores: Object.entries(o.scores).map(([dimensionId, score]) => ({
          dimensionId,
          score,
        })),
      })),
    })),
  };
  expect(fromWire(generationWireSchema.parse(wire))).toEqual(canonical);
  const schema = zodToJsonSchema(generationWireSchema, {
    $refStrategy: "none",
  });
  function check(value: unknown) {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.type === "object")
      expect(record.additionalProperties).toBe(false);
    Object.values(record).forEach(check);
  }
  check(schema);
});
it("historical sensitive levels cannot be downgraded by edits", () => {
  expect(resultSensitivity("normal", "sensitive")).toBe("sensitive");
  expect(resultSensitivity("sensitive", "high_risk")).toBe("high_risk");
});
describe("Scoring Engine", () => {
  it("same answers always produce identical scores", () => {
    const t = fixture();
    const a = { q1: "a", q2: "b", q3: "b" };
    expect(ScoringEngine.calculate(t, a)).toEqual(
      ScoringEngine.calculate(t, a),
    );
    expect(ScoringEngine.calculate(t, a).totalScore).toBeCloseTo(66.67);
  });
  it("normalizes negative contributions to 0..100", () => {
    expect(
      ScoringEngine.calculate(fixture(), { q1: "a", q2: "a", q3: "a" })
        .totalScore,
    ).toBe(0);
    expect(
      ScoringEngine.calculate(fixture(), { q1: "b", q2: "b", q3: "b" })
        .totalScore,
    ).toBe(100);
  });
  it("knowledge has correctness, weighted grade and accuracy", () => {
    const t = fixture("knowledge");
    t.questions[0].weight = 2;
    const result = ScoringEngine.calculate(t, { q1: "b", q2: "a", q3: "b" });
    expect(result.totalScore).toBe(75);
    expect(result.metadata.correctCount).toBe(2);
    expect(result.metadata.wrongCount).toBe(1);
    expect(result.metadata.accuracy).toBe(66.67);
  });
  it("multi-choice exact matching rejects partial correctness", () => {
    const t = fixture("knowledge", 1);
    t.questions[0].type = "multiple_choice";
    t.questions[0].correctAnswer = ["a", "b"];
    expect(ScoringEngine.calculate(t, { q1: ["a"] }).totalScore).toBe(0);
    expect(ScoringEngine.calculate(t, { q1: ["b", "a"] }).totalScore).toBe(100);
  });
  it("multi-select uses sums and feasible signed bounds", () => {
    const t = fixture("personality", 1);
    t.questions[0].type = "multiple_choice";
    expect(ScoringEngine.calculate(t, { q1: ["a", "b"] }).totalScore).toBe(50);
    expect(ScoringEngine.calculate(t, { q1: ["a"] }).totalScore).toBe(0);
  });
  it("does not score supplemental text", () => {
    const t = fixture();
    t.questions.push({
      id: "q4",
      type: "text",
      text: "补充",
      options: [],
      correctAnswer: null,
      explanation: "",
      difficulty: "easy",
      weight: 1,
      knowledgePoint: "",
      dimensionId: null,
      required: false,
    });
    expect(
      ScoringEngine.calculate(t, { q1: "b", q2: "b", q3: "b", q4: "文字" })
        .totalScore,
    ).toBe(100);
  });
  it("rejects missing, unknown and duplicated answers", () => {
    expect(() => validateAnswers(fixture(), { q1: "a" })).toThrow();
    expect(() =>
      validateAnswers(fixture(), { q1: "x", q2: "a", q3: "a" }),
    ).toThrow();
    expect(() =>
      validateAnswers(fixture(), { q1: "a", q2: "a", q3: "a", q4: "a" }),
    ).toThrow();
    const t = fixture("personality", 1);
    t.questions[0].type = "multiple_choice";
    expect(() => validateAnswers(t, { q1: ["a", "a"] })).toThrow();
  });
});
describe("Consistency Engine", () => {
  it("inverse relation matches opposite options", () =>
    expect(consistency(fixture(), { q1: "a", q2: "b", q3: "a" })).toBe(100));
  it("inverse relation detects equal endpoints", () =>
    expect(consistency(fixture(), { q1: "a", q2: "a", q3: "a" })).toBe(0));
  it("same relation matches equal responses", () => {
    const t = fixture();
    t.consistency_pairs[0].relation = "same";
    expect(consistency(t, { q1: "a", q2: "a", q3: "a" })).toBe(100);
  });
  it("returns null when no pairs can be evaluated", () =>
    expect(consistency(fixture("personality", 1), { q1: "a" })).toBeNull());
});
describe("Schema validation and answer secrecy", () => {
  it("validates every supported test type", () => {
    for (const type of [
      "knowledge",
      "ability",
      "personality",
      "preference",
      "relationship",
      "entertainment",
      "self_exploration",
    ] as const) {
      const t = fixture(type);
      if (type === "ability")
        for (const q of t.questions) q.correctAnswer = ["b"];
      expect(testSchema.safeParse(t).success).toBe(true);
    }
  });
  it("rejects null questions and duplicate question IDs", () => {
    expect(
      testSchema.safeParse({ ...fixture(), questions: null }).success,
    ).toBe(false);
    const t = fixture();
    t.questions[1].id = "q1";
    expect(testSchema.safeParse(t).success).toBe(false);
  });
  it("rejects missing dimensions and illegal scores", () => {
    const t = fixture();
    t.questions[0].options[0].scores = { unknown: 3 };
    expect(testSchema.safeParse(t).success).toBe(false);
    t.questions[0].options[0].scores = { communication: Infinity };
    expect(testSchema.safeParse(t).success).toBe(false);
  });
  it("rejects incorrect standard answer references", () => {
    const t = fixture("knowledge");
    t.questions[0].correctAnswer = ["x"];
    expect(testSchema.safeParse(t).success).toBe(false);
  });
  it("rejects unmeasured knowledge dimensions and answer keys in preference tests", () => {
    const knowledge = fixture("knowledge");
    knowledge.dimensions.push({
      id: "unused",
      name: "未覆盖维度",
      description: "没有题目",
      minScore: 0,
      maxScore: 100,
    });
    expect(testSchema.safeParse(knowledge).success).toBe(false);
    const preference = fixture("preference");
    preference.questions[0].correctAnswer = ["a"];
    expect(testSchema.safeParse(preference).success).toBe(false);
  });
  it("rejects invalid consistency references", () => {
    const t = fixture();
    t.consistency_pairs[0].questionB = "missing";
    expect(testSchema.safeParse(t).success).toBe(false);
  });
  it("public projection hides answers, scores and explanations", () => {
    const raw = JSON.stringify(publicSchema(fixture("knowledge")));
    expect(raw).not.toContain("correctAnswer");
    expect(raw).not.toContain("scores");
    expect(raw).not.toContain("explanation");
    expect(raw).not.toContain("consistency_pairs");
  });
});
describe("Permissions, install lock and sensitive sharing", () => {
  it("distinguishes administrators and super admins", () => {
    expect(isAdmin("USER")).toBe(false);
    expect(isAdmin("ADMIN")).toBe(true);
    expect(isSuper("ADMIN")).toBe(false);
    expect(isSuper("SUPER_ADMIN")).toBe(true);
  });
  it("verifies ownership rather than knowing an ID", () => {
    expect(canOwn({ creatorId: "u1" }, { userId: "u2", sessionId: "s" })).toBe(
      false,
    );
    expect(canOwn({ anonymousOwner: "s" }, { sessionId: "s" })).toBe(true);
  });
  it("installation is disabled if either persisted flag is set", () => {
    expect(installAllowed(false, false)).toBe(true);
    expect(installAllowed(true, false)).toBe(false);
    expect(installAllowed(false, true)).toBe(false);
    expect(installAllowed(true, true)).toBe(false);
  });
  it("requires confirmation for sensitive results and disables high-risk by default", () => {
    const config = { resultSharing: true, highRiskSharing: false };
    expect(canShare("normal", config, false)).toBe(true);
    expect(canShare("sensitive", config, false)).toBe(false);
    expect(canShare("sensitive", config, true)).toBe(true);
    expect(canShare("high_risk", config, true)).toBe(false);
    expect(canShare("normal", { ...config, resultSharing: false }, true)).toBe(
      false,
    );
  });
  it("identifies medical diagnosis and applies policies", () => {
    const config = settingsSchema.parse({ siteUrl: "https://example.org" });
    expect(sensitivity("疾病诊断")).toBe("high_risk");
    expect(() => enforceContent("疾病诊断", config)).toThrow();
    expect(sensitivity("性取向探索")).toBe("sensitive");
    expect(
      enforceContent("仅用于自我探索，不代表专业诊断或身份认定。", config),
    ).toBe("normal");
  });
  it("encrypts keys with authenticated encryption", () => {
    process.env.ENCRYPTION_KEY = "ab".repeat(32);
    const encrypted = encrypt("secret-key");
    expect(encrypted).not.toContain("secret-key");
    expect(decrypt(encrypted)).toBe("secret-key");
    expect(() => decrypt(encrypted.slice(0, -2) + "00")).toThrow();
  });
});
