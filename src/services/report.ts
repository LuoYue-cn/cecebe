import type { Prisma } from "@prisma/client";
import { testSchema, analysisSchema } from "@/schemas/test";
import { resultSensitivity } from "@/security/permissions";
import type { ReportData } from "@/components/report";
type Session = Prisma.TestSessionGetPayload<{
  include: {
    testVersion: { include: { test: true } };
    score: true;
    analysis: true;
  };
}>;
type AnalysisInsight = {
  dimensionId: string;
  label: string;
  description: string;
};
export function reportData(session: Session, isPublic = false): ReportData {
  const schema = testSchema.parse(session.testVersion.schema);
  const scores = (session.score?.dimensionScores ?? {}) as Record<
    string,
    number
  >;
  const metadata = session.score?.metadata as unknown as ReportData["metadata"];
  return {
    id: session.id,
    status: session.status,
    title: schema.title,
    slug: session.testVersion.test.slug,
    sensitivity: resultSensitivity(
      session.testVersion.test.sensitivity,
      schema.sensitivity,
    ),
    type: schema.type,
    version: session.testVersion.version,
    totalScore: session.score?.totalScore ?? 0,
    consistencyScore: session.consistencyScore,
    dimensions: schema.dimensions.map((d) => ({
      name: d.name,
      score: scores[d.id] ?? 0,
      ...(
        (session.analysis?.dimensionInsights ?? []) as AnalysisInsight[]
      ).find((item) => item.dimensionId === d.id),
    })),
    metadata: isPublic
      ? { ...metadata, review: [] }
      : {
          ...metadata,
          review: metadata.review.map((r) => ({
            ...r,
            correctAnswer: r.correctAnswer.map(
              (key) =>
                schema.questions
                  .find((q) =>
                    r.questionId ? q.id === r.questionId : q.text === r.question,
                  )
                  ?.options.find((o) => o.id === key)?.text ?? key,
            ),
          })),
        },
    analysis: session.analysis
      ? analysisSchema.parse({
          summary: session.analysis.summary,
          traits: session.analysis.traits,
          strengths: session.analysis.strengths,
          potentialIssues: session.analysis.potentialIssues,
          suggestions: session.analysis.suggestions,
          resultLabel: session.analysis.resultLabel,
          shareSummary: session.analysis.shareSummary,
          dimensionInsights: session.analysis.dimensionInsights,
        })
      : null,
    testPublished:
      session.testVersion.test.status === "published" &&
      session.testVersion.test.visibility === "public" &&
      !session.testVersion.test.deletedAt,
    public: isPublic,
  };
}
