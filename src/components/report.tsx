"use client";
import { useEffect, useState } from "react";
import { api } from "./context";
import { zh } from "@/i18n/zh-CN";
import { AsyncButton } from "./forms";
import { SharePanel } from "./share";
import type { Analysis } from "@/schemas/test";
export type ReportData = {
  id: string;
  status: string;
  title: string;
  slug: string;
  sensitivity: string;
  type: string;
  version: number;
  dimensions: {
    name: string;
    score: number;
    label?: string;
    description?: string;
  }[];
  totalScore: number;
  consistencyScore: number | null;
  metadata: {
    knowledge: boolean;
    correctCount: number;
    wrongCount: number;
    accuracy: number | null;
    review: {
      questionId?: string;
      question: string;
      correct: boolean;
      explanation: string;
      correctAnswer: string[];
      selected?: string[];
    }[];
  };
  analysis: Analysis | null;
  public?: boolean;
  testPublished: boolean;
  canPublish?: boolean;
};
export function Report({ report }: { report: ReportData }) {
  const [status, setStatus] = useState(report.status);
  useEffect(() => {
    if (report.analysis || report.public || status === "analysis_failed")
      return;
    const interval = setInterval(() => {
      api<{ status: string }>(`tests/jobs/${report.id}`)
        .then((r) => {
          if (r.status === "completed") location.reload();
          if (r.status === "failed") setStatus("analysis_failed");
        })
        .catch(() => {});
    }, 1800);
    return () => clearInterval(interval);
  }, [report.id, report.analysis, report.public, status]);
  return (
    <div className="container report-page">
      <div className="page-title">
        <span className="eyebrow">你的测试报告 · V{report.version}</span>
        <h1 style={{ fontSize: "2.1rem" }}>{report.title}</h1>
      </div>
      <div className="report-overview">
        <section className="card report-top">
          <span className="tag">
            {zh.types[report.type as keyof typeof zh.types]}
          </span>
          <h2
            style={{
              marginTop: 20,
              ...(report.metadata.knowledge
                ? {}
                : { fontSize: "2rem", lineHeight: 1.5 }),
            }}
          >
            {report.analysis?.resultLabel ??
              (report.metadata.knowledge ? "评分已完成" : "倾向分析中")}
          </h2>
          {report.metadata.knowledge && (
            <div className="report-score">
              {report.totalScore}
              <span style={{ fontSize: 20, color: "var(--muted)" }}>
                {" "}
                / 100
              </span>
            </div>
          )}
          {!report.metadata.knowledge && (
            <p className="report-type-caption">
              本次倾向类型 · 偏好没有高低优劣
            </p>
          )}
          <p>
            {report.analysis?.summary ??
              (report.metadata.knowledge
                ? "你的基础分数已由确定性评分引擎计算，分析报告正在生成。"
                : "你的回答已保存，倾向画像正在生成。")}
          </p>
          {report.metadata.knowledge && (
            <div className="chips">
              <span className="chip">
                正确 {report.metadata.correctCount} 题
              </span>
              <span className="chip">错误 {report.metadata.wrongCount} 题</span>
              <span className="chip">正确率 {report.metadata.accuracy}%</span>
            </div>
          )}
        </section>
        <section className="card report-dimensions">
          <span className="eyebrow">一点点了解，更完整的自己</span>
          <h2>{report.metadata.knowledge ? "维度画像" : "倾向画像"}</h2>
          {!report.metadata.knowledge &&
            !report.dimensions.some((d) => d.label) && (
              <p className="muted">
                请结合下方核心特征与文字分析了解你的偏好。
              </p>
            )}
          {report.dimensions
            .filter((d) => report.metadata.knowledge || d.label)
            .map((d) => (
              <div className="dimension" key={d.name}>
                <div className="row between">
                  <span>{d.name}</span>
                  <strong>
                    {report.metadata.knowledge ? `${d.score} / 100` : d.label}
                  </strong>
                </div>
                {report.metadata.knowledge ? (
                  <div
                    className="bar"
                    role="meter"
                    aria-label={d.name}
                    aria-valuenow={d.score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${d.score}%` }} />
                  </div>
                ) : (
                  <p className="muted">{d.description}</p>
                )}
              </div>
            ))}
        </section>
      </div>
      {report.analysis ? (
        <div className="two-col" style={{ marginTop: 22 }}>
          {(
            [
              { key: "traits", label: "核心特征" },
              { key: "strengths", label: "主要优势" },
              {
                key: "potentialIssues",
                label:
                  report.type === "relationship" ? "潜在冲突点" : "值得留意",
              },
              {
                key: "suggestions",
                label:
                  report.type === "relationship"
                    ? "适合的关系模式与建议"
                    : "探索建议",
              },
            ] as const
          ).map(({ key, label }) => (
            <section className={`card report-section insight-${key}`} key={key}>
              <h3>{label}</h3>
              <ul>
                {report.analysis![key].map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <section className="card" style={{ marginTop: 22 }}>
          {status === "analysis_failed" ? (
            <>
              <h3>结果分析暂未完成</h3>
              <p>回答已经保存，可以重试分析，无需重新作答。</p>
              <AsyncButton
                onClick={async () => {
                  await api(`tests/sessions/${report.id}/retry`, {});
                  setStatus("analyzing");
                }}
              >
                重新分析
              </AsyncButton>
            </>
          ) : (
            <>
              <div className="spinner" />
              <p style={{ textAlign: "center" }}>
                正在根据维度分数生成分析报告…
              </p>
            </>
          )}
        </section>
      )}
      <section className="card" style={{ marginTop: 22 }}>
        <h3>回答一致性</h3>
        <p>
          {report.consistencyScore === null
            ? "本测试没有设置可用的一致性检查关系。"
            : `${report.consistencyScore}%`}
        </p>
        {report.consistencyScore !== null && report.consistencyScore < 60 && (
          <div className="notice">
            你的部分回答之间存在明显差异，因此本次结果的参考价值可能较低。
          </div>
        )}
        <p className="muted">{zh.privacy}</p>
      </section>
      {report.metadata.knowledge && (
        <section className="card" style={{ marginTop: 22 }}>
          <h3>错误题目回顾</h3>
          {report.metadata.review
            .filter((r) => !r.correct)
            .map((r, i) => (
              <details key={i}>
                <summary>{r.question}</summary>
                <p>正确选项：{r.correctAnswer.join("、")}</p>
                <p>{r.explanation}</p>
              </details>
            ))}
          {report.metadata.wrongCount === 0 && (
            <p className="muted">本次作答全部正确。</p>
          )}
        </section>
      )}
      {report.analysis && !report.public && (
        <section className="card report-share" style={{ marginTop: 22 }}>
          <SharePanel
            slug={report.slug}
            title={report.title}
            analysis={report.analysis}
            dimensions={report.dimensions}
            sensitivity={report.sensitivity}
            sessionId={report.id}
            published={report.testPublished}
            canPublish={report.canPublish}
            totalScore={
              report.metadata.knowledge ? report.totalScore : undefined
            }
            knowledge={report.metadata.knowledge ? report.metadata : undefined}
          />
        </section>
      )}
    </div>
  );
}
