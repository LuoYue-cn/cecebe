"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  BookOpen,
  Compass,
  Heart,
  Check,
  Share2,
  ArrowUpRight,
} from "lucide-react";
import { api, useApp } from "./context";
import { zh } from "@/i18n/zh-CN";
type Tile = {
  slug: string;
  title: string;
  description: string;
  type: string;
  count: number;
  questions: number;
  minutes: number;
  cover?: string | null;
};
export function Home({ tests }: { tests: Tile[] }) {
  const { data } = useApp();
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("10");
  const [custom, setCustom] = useState(15);
  const [language, setLanguage] = useState("zh-CN");
  const [mode, setMode] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<{
    id: string;
    stage: string;
    status: string;
    error?: string;
  }>();
  useEffect(() => {
    if (!job?.id || job.status === "failed") return;
    const timer = setInterval(async () => {
      try {
        const next = await api<{
          id: string;
          stage: string;
          status: string;
          resultId: string;
          error?: string;
        }>(`tests/jobs/${job.id}`);
        setJob(next);
        if (next.status === "completed") {
          clearInterval(timer);
          location.href = `/t/${next.resultId}`;
        }
        if (next.status === "failed") {
          setError(next.error ?? "生成失败。");
          setBusy(false);
          clearInterval(timer);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }, 1600);
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);
  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api<{ jobId: string }>("tests/generate", {
        topic,
        count: count === "custom" ? custom : Number(count),
        language,
        mode,
      });
      setJob({ id: result.jobId, status: "queued", stage: "queued" });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const examples = [
    "测试我的 C 语言水平",
    "我适合怎样的恋爱关系？",
    "探索我的沟通风格",
  ];
  return (
    <div className="container home-page">
      <section className="hero">
        <div className="eyebrow">
          <Sparkles size={16} /> 给好奇心一点自由
        </div>
        <h1>
          今天，发现一个
          <br />
          <em>不一样的自己。</em>
        </h1>
        <p>{zh.homeSubtitle}</p>
        <form className="card generator" onSubmit={generate}>
          <label className="composer-label" htmlFor="topic">
            <Sparkles size={16} /> 说说你想测什么
          </label>
          <textarea
            className="topic-input"
            aria-label={zh.topic}
            id="topic"
            placeholder={zh.topicPlaceholder}
            required
            minLength={3}
            maxLength={data?.settings.maxInputLength ?? 500}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <div className="generator-controls">
            <div className="field">
              <label htmlFor="count">{zh.count}</label>
              <select
                id="count"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              >
                {[10, 20, 30, 50]
                  .filter((v) => v <= (data?.settings.maxQuestions ?? 50))
                  .map((v) => (
                    <option key={v} value={v}>
                      {v} 道
                    </option>
                  ))}
                <option value="custom">自定义</option>
              </select>
            </div>
            {count === "custom" && (
              <div className="field">
                <label htmlFor="custom-count">自定义数量</label>
                <input
                  id="custom-count"
                  type="number"
                  min={1}
                  max={data?.settings.maxQuestions ?? 50}
                  value={custom}
                  onChange={(e) => setCustom(Number(e.target.value))}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="language">{zh.language}</label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="zh-CN">简体中文</option>
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="mode">{zh.mode}</label>
              <select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                {Object.entries(zh.types).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <button className="button" disabled={busy || !data}>
              <Sparkles size={17} />
              {busy ? "正在构建测试…" : zh.generate}
            </button>
          </div>
          {error && (
            <div className="notice danger" role="alert">
              {error}
            </div>
          )}
          {busy && job && (
            <div role="status" aria-live="polite" className="notice">
              <div className="spinner" />
              {zh.stages[job.stage as keyof typeof zh.stages] ?? job.stage}
              <p className="muted">
                生成完成后会自动打开测试。题目将保存，可重复参加。
              </p>
            </div>
          )}
        </form>
        <div className="chips">
          {examples.map((example) => (
            <button
              className="chip"
              key={example}
              onClick={() => setTopic(example)}
            >
              {example}
            </button>
          ))}
        </div>
        <div className="trust-row">
          <span>
            <Check size={12} /> 核心功能免费
          </span>
          <span>
            <Check size={12} /> 稳定评分
          </span>
          <span>
            <Share2 size={12} /> 分享给朋友
          </span>
        </div>
      </section>
      <section className="discovery-section" aria-label="探索灵感">
        <div className="section-heading">
          <h2>挑一个好奇，出发吧</h2>
          <span className="muted">从一个小问题，认识更大的世界</span>
        </div>
        <div className="discovery-grid">
          {[
            {
              title: "知识补给站",
              text: "给你的知识储备做个小检查。",
              topic: examples[0],
              icon: BookOpen,
              tone: "mint",
            },
            {
              title: "遇见另一个自己",
              text: "表达与倾听，都有你的方式。",
              topic: examples[2],
              icon: Compass,
              tone: "peach",
            },
            {
              title: "关系里的小秘密",
              text: "从一点了解，到更好的相处。",
              topic: examples[1],
              icon: Heart,
              tone: "lilac",
            },
          ].map(({ title, text, topic: example, icon: Icon, tone }) => (
            <button
              type="button"
              className={`discovery-card tone-${tone}`}
              key={title}
              onClick={() => {
                setTopic(example);
                document.getElementById("topic")?.focus();
                document
                  .getElementById("topic")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              <span className="tile-icon">
                <Icon size={22} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
              <span className="discovery-action">
                用这个灵感创建测试 <ArrowUpRight size={17} />
              </span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <h2>{zh.popular}</h2>
          <span className="muted">一份测试，新的发现</span>
        </div>
        {tests.length ? (
          <div className="test-grid">
            {tests.map((t, i) => (
              <Link
                href={`/t/${t.slug}`}
                key={t.slug}
                className={`card test-tile tone-${t.type === "knowledge" || t.type === "ability" ? "mint" : t.type === "relationship" ? "peach" : "lilac"}`}
              >
                <>
                  {t.cover && (
                    <img
                      src={t.cover}
                      alt=""
                      style={{
                        width: "100%",
                        height: 120,
                        borderRadius: 12,
                        objectFit: "cover",
                      }}
                    />
                  )}
                  <span className="tile-icon">
                    {t.type === "knowledge" ? (
                      <BookOpen size={22} />
                    ) : t.type === "relationship" ? (
                      <Heart size={22} />
                    ) : (
                      <Compass size={22} />
                    )}
                  </span>
                </>
                <div className="row between">
                  <span className="tag">
                    {zh.types[t.type as keyof typeof zh.types] ?? t.type}
                  </span>
                  {i === 0 && t.count > 0 && <small>热门探索</small>}
                </div>
                <h3>{t.title}</h3>
                <p>{t.description}</p>
                <div className="tile-meta">
                  <span>
                    {t.questions} 题 · 约 {t.minutes} 分钟
                  </span>
                  <span>
                    {t.count} 人完成 <ArrowUpRight size={16} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">
            这里将展示已发布的热门测试。创建并发布第一份测试，让好奇开始流动。
          </div>
        )}
      </section>
    </div>
  );
}
