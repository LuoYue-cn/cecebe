"use client";
import { useState } from "react";
import Link from "next/link";
import { api, useApp } from "./context";
import { zh } from "@/i18n/zh-CN";
import { Feedback, AsyncButton } from "./forms";
import type { publicSchema, Answers } from "@/schemas/test";
import { SharePanel } from "./share";
type PublicSchema = ReturnType<typeof publicSchema>;
export function TakeTest({
  test,
}: {
  test: {
    slug: string;
    status: string;
    schema: PublicSchema;
    version: number;
    owner: boolean;
    cover?: string | null;
  };
}) {
  const { data } = useApp();
  const [answers, setAnswers] = useState<Answers>({});
  const [sessionId, setSessionId] = useState("");
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [share, setShare] = useState(false);
  const schema = test.schema;
  const answered = schema.questions.filter((q) => {
    const v = answers[q.id];
    return v !== undefined && v !== "" && (!Array.isArray(v) || v.length > 0);
  }).length;
  async function start() {
    setError("");
    setBusy(true);
    try {
      const result = await api<{ sessionId: string }>(
        `tests/${test.slug}/start`,
        {},
      );
      setSessionId(result.sessionId);
      setStarted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const missing = schema.questions.find(
      (q) =>
        q.required &&
        (!answers[q.id] ||
          (Array.isArray(answers[q.id]) && !answers[q.id].length)),
    );
    if (missing) {
      setError(`请完成题目：${missing.text}`);
      document
        .getElementById(`question-${missing.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ resultId: string }>(
        `tests/${test.slug}/submit`,
        { sessionId, answers },
      );
      location.href = `/result/${result.resultId}`;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="container narrow">
      <div className="page-title">
        {test.cover && (
          <img
            src={test.cover}
            alt=""
            style={{
              width: "100%",
              maxHeight: 260,
              objectFit: "cover",
              borderRadius: 18,
              marginBottom: 20,
            }}
          />
        )}
        <div className="row">
          <span className="tag">{zh.types[schema.type]}</span>
          <small>版本 {test.version}</small>
          {test.status !== "published" && <span className="tag">草稿预览</span>}
        </div>
        <h1 style={{ fontSize: "2.3rem", marginTop: 18 }}>{schema.title}</h1>
        <p>{schema.description}</p>
        <div className="row muted">
          <span>{schema.questions.length} 道题</span>
          <span>预计 {schema.estimated_time} 分钟</span>
          <span>按自己的真实情况作答</span>
        </div>
        {schema.sensitivity !== "normal" && (
          <div className="notice">{zh.privacy}</div>
        )}
        {schema.result_config.disclaimer && (
          <p className="muted">{schema.result_config.disclaimer}</p>
        )}
      </div>
      <Feedback error={error} message={message} />
      {!started ? (
        <div className="card">
          <h2>准备好探索了吗？</h2>
          <p className="muted">
            一次完成后即可查看维度评分和分析报告。每份答卷使用当前版本评分。
          </p>
          <div className="actions">
            <button className="button" onClick={start} disabled={busy || !data}>
              开始测试
            </button>
            {test.status === "published" && (
              <button
                className="button secondary"
                onClick={() => setShare(!share)}
              >
                分享测试
              </button>
            )}
            {test.owner && (
              <>
                <Link href={`/edit/${test.slug}`} className="button secondary">
                  编辑测试
                </Link>
                {test.status !== "published" && (
                  <AsyncButton
                    onClick={async () => {
                      await api(`tests/${test.slug}/publish`, {});
                      setMessage("测试已公开发布。");
                      location.reload();
                    }}
                  >
                    公开发布
                  </AsyncButton>
                )}
              </>
            )}
          </div>
          {share && (
            <SharePanel
              slug={test.slug}
              title={schema.title}
              published={test.status === "published"}
            />
          )}
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="card">
            <div className="row between">
              <strong>作答进度</strong>
              <span>
                {answered} / {schema.questions.length}
              </span>
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={answered}
              aria-valuemin={0}
              aria-valuemax={schema.questions.length}
            >
              <span
                style={{
                  width: `${(answered / schema.questions.length) * 100}%`,
                }}
              />
            </div>
          </div>
          {schema.questions.map((q, i) => (
            <fieldset className="question" id={`question-${q.id}`} key={q.id}>
              <legend>
                {i + 1}. {q.text}
                {!q.required && <small>（可选）</small>}
              </legend>
              {q.type === "text" ? (
                <>
                  <label className="sr-only" htmlFor={`answer-${q.id}`}>
                    补充回答
                  </label>
                  <textarea
                    id={`answer-${q.id}`}
                    maxLength={3000}
                    required={q.required}
                    value={(answers[q.id] as string) ?? ""}
                    onChange={(e) =>
                      setAnswers({ ...answers, [q.id]: e.target.value })
                    }
                  />
                </>
              ) : (
                q.options.map((o) => (
                  <label className="option" key={o.id}>
                    <input
                      type={q.type === "multiple_choice" ? "checkbox" : "radio"}
                      name={q.id}
                      value={o.id}
                      checked={
                        q.type === "multiple_choice"
                          ? ((answers[q.id] as string[]) ?? []).includes(o.id)
                          : answers[q.id] === o.id
                      }
                      onChange={(e) => {
                        if (q.type === "multiple_choice") {
                          const previous = (answers[q.id] as string[]) ?? [];
                          setAnswers({
                            ...answers,
                            [q.id]: e.target.checked
                              ? [...previous, o.id]
                              : previous.filter((v) => v !== o.id),
                          });
                        } else setAnswers({ ...answers, [q.id]: o.id });
                      }}
                    />
                    <span>{o.text}</span>
                  </label>
                ))
              )}
            </fieldset>
          ))}
          <Feedback error={error} />
          <div className="actions">
            <button className="button" disabled={busy}>
              {busy ? "正在评分…" : "提交答卷"}
            </button>
            <span className="muted">提交后由服务器计算分数。</span>
          </div>
        </form>
      )}
    </div>
  );
}
