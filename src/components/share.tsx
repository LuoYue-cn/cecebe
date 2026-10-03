"use client";
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { toPng } from "html-to-image";
import { api, useApp } from "./context";
import { Feedback } from "./forms";
import type { Analysis } from "@/schemas/test";

export function SharePanel({
  slug,
  title,
  analysis,
  dimensions,
  sensitivity = "normal",
  sessionId,
  published = false,
  canPublish = false,
  totalScore,
  knowledge,
}: {
  slug: string;
  title: string;
  analysis?: Analysis;
  dimensions?: {
    name: string;
    score: number;
    label?: string;
    description?: string;
  }[];
  sensitivity?: string;
  sessionId?: string;
  published?: boolean;
  canPublish?: boolean;
  totalScore?: number;
  knowledge?: {
    correctCount: number;
    wrongCount: number;
    accuracy: number | null;
  };
}) {
  const { data } = useApp();
  const [isPublished, setPublished] = useState(published);
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");
  const [code, setCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const resultAllowed =
    !analysis ||
    sensitivity !== "high_risk" ||
    !!data?.settings.highRiskSharing;

  useEffect(() => {
    setPublished(published);
  }, [published]);
  useEffect(() => {
    if (!data || !isPublished) {
      setUrl("");
      setQr("");
      return;
    }
    let active = true;
    const target = `${data.settings.siteUrl.replace(/\/$/, "")}/t/${slug}`;
    setUrl(target);
    QRCode.toDataURL(target, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((image) => {
        if (active) setQr(image);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [data, slug, isPublished]);

  function clearFeedback() {
    setError("");
    setMessage("");
  }
  function assertSharing() {
    if (!isPublished) throw new Error("请先发布测试，再复制分享或下载结果图。");
    if (!resultAllowed) throw new Error("本站不允许高风险结果分享。");
    if (analysis && sensitivity !== "normal" && !confirmed)
      throw new Error("请先确认敏感内容分享提醒。");
  }
  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("已复制。");
  }
  async function trackedLink() {
    assertSharing();
    const tracked = await api<{ url: string }>(`tests/${slug}/share`, {});
    setUrl(tracked.url);
    setQr(await QRCode.toDataURL(tracked.url, { width: 240, margin: 1 }));
    return tracked.url;
  }
  async function copyShare() {
    clearFeedback();
    setBusy(true);
    try {
      const target = await trackedLink();
      await copy(
        analysis
          ? `我刚完成了「${title}」，本次结果是「${analysis.resultLabel}」。${analysis.shareSummary} 试试看：${target}`
          : `来试试「${title}」：${target}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    clearFeedback();
    setBusy(true);
    try {
      await api(`tests/${slug}/publish`, {});
      setPublished(true);
      setMessage("测试已发布，现在可以分享。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    clearFeedback();
    setBusy(true);
    try {
      await trackedLink();
      await document.fonts.ready;
      // Wait for the new QR, fonts and natural content height before capturing.
      for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
      if (!card.current) return;
      // Export at a stable 360 CSS-pixel width, independent of the phone preview.
      const wrapper = document.createElement("div");
      wrapper.setAttribute("aria-hidden", "true");
      wrapper.style.cssText =
        "position:fixed;left:-10000px;top:0;width:360px;pointer-events:none";
      const exportCard = card.current.cloneNode(true) as HTMLDivElement;
      exportCard.style.width = "360px";
      exportCard.style.maxWidth = "none";
      exportCard.style.margin = "0";
      wrapper.append(exportCard);
      document.body.append(wrapper);
      let image: string;
      try {
        await Promise.all(
          Array.from(exportCard.querySelectorAll("img")).map((img) =>
            img.decode(),
          ),
        );
        image = await toPng(exportCard, {
          pixelRatio: 3,
          cacheBust: true,
          backgroundColor: "#faf7ef",
        });
      } finally {
        wrapper.remove();
      }
      const link = document.createElement("a");
      link.download = `${data?.settings.siteName ?? "测测be"}-长图.png`;
      link.href = image;
      link.click();
      setMessage("图片已生成。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publicShare() {
    clearFeedback();
    setBusy(true);
    try {
      assertSharing();
      const result = await api<{ url: string; code: string }>(
        `tests/sessions/${sessionId}/share`,
        { confirmed },
      );
      setPublicUrl(result.url);
      setCode(result.code);
      setMessage("公开报告已创建，可随时撤销。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="stack" style={{ marginTop: 24 }}>
      <h3>{analysis ? "把这份发现，分享给朋友" : "邀请朋友测同款"}</h3>
      {sensitivity !== "normal" && (
        <div className="notice">
          分享图或公开报告可能展示你的敏感倾向。请确认后再分享。
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            我了解分享可能公开本次结果
          </label>
        </div>
      )}
      <div className="row" aria-label="结果分享操作">
        {sessionId && (canPublish || isPublished) && (
          <button
            className="button small"
            disabled={busy || isPublished || !canPublish}
            onClick={publish}
          >
            {isPublished ? "已发布测试" : "发布测试"}
          </button>
        )}
        <button
          className="button secondary small"
          disabled={busy || !isPublished || !resultAllowed || !url}
          onClick={copyShare}
        >
          复制分享
        </button>
        {sessionId && data?.settings.resultSharing && (
          <button
            className="button secondary small"
            disabled={busy || !isPublished || !resultAllowed || !!publicUrl}
            onClick={publicShare}
          >
            {publicUrl ? "已创建公开报告" : "创建公开报告"}
          </button>
        )}
      </div>
      {!isPublished && (
        <p className="muted">
          {canPublish
            ? "测试尚未发布。发布后才可复制分享、下载结果图或创建公开报告。"
            : "测试尚未公开发布，请联系创建者发布后再分享。"}
        </p>
      )}
      <Feedback error={error} message={message} />
      {isPublished && (
        <>
          <input
            aria-label="测试分享链接"
            readOnly
            value={url}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid var(--line)",
              borderRadius: 8,
              background: "var(--surface)",
              color: "var(--text)",
            }}
          />
          {sessionId && data?.settings.resultSharing && (
            <div className="public-report-links">
              <p className="muted">
                默认只有你能查看完整报告。创建公开报告后，持有链接的人可以查看，也可以随时撤销。
              </p>
              {publicUrl && (
                <div className="row">
                  <input aria-label="公开结果链接" readOnly value={publicUrl} />
                  <button
                    className="button secondary small"
                    onClick={() =>
                      copy(publicUrl).catch(() =>
                        setError("复制失败，请手动复制报告链接。"),
                      )
                    }
                  >
                    复制报告链接
                  </button>
                  <button
                    className="button secondary small"
                    onClick={async () => {
                      clearFeedback();
                      try {
                        await api(`tests/shares/${code}`, {});
                        setPublicUrl("");
                        setMessage("公开分享已撤销。");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    撤销分享
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="row">
            <span className="muted">手机阅读长图 · 高度随内容自动调整</span>
            <button
              className="button small"
              onClick={download}
              disabled={busy || !qr || !resultAllowed}
            >
              {busy ? "正在处理…" : "下载 PNG"}
            </button>
          </div>
          {resultAllowed && (
            <div className="card-preview">
              <div ref={card} className="share-card complete-share-card">
                <div className="share-card-content">
                  <div
                    className="brand"
                    style={{ color: data?.settings.primaryColor }}
                  >
                    {data?.settings.logo && (
                      <img
                        src={data.settings.logo}
                        alt=""
                        width={32}
                        height={32}
                      />
                    )}
                    {data?.settings.siteName ?? "测测be"}
                  </div>
                  <div className="share-card-bottom share-card-qr-top">
                    {qr && <img src={qr} alt="打开原测试的二维码" />}
                    <div>
                      <strong>
                        {data?.settings.shareFooter ?? "扫码测同款"}
                      </strong>
                      <p>{data ? new URL(data.settings.siteUrl).host : ""}</p>
                      <small>测试结果仅供探索与参考</small>
                    </div>
                  </div>
                  <span className="muted">{title}</span>
                  <h2>{analysis?.resultLabel ?? "你的好奇，有了新答案。"}</h2>
                  {totalScore !== undefined && (
                    <div className="share-total-score">
                      {totalScore}
                      <small> / 100</small>
                    </div>
                  )}
                  {knowledge && (
                    <p>
                      正确 {knowledge.correctCount} 题 · 错误{" "}
                      {knowledge.wrongCount} 题 · 正确率 {knowledge.accuracy}%
                    </p>
                  )}
                  <p>
                    {analysis?.summary ?? "完成这份测试，发现自己的另一面。"}
                  </p>
                  {dimensions
                    ?.filter((d) => knowledge || d.label)
                    .map((d) => (
                      <div key={d.name} className="share-dimension">
                        <div className="row between">
                          <span>{d.name}</span>
                          <strong>
                            {knowledge ? `${d.score} / 100` : d.label}
                          </strong>
                        </div>
                        {knowledge ? (
                          <div className="bar">
                            <span
                              style={{
                                width: `${d.score}%`,
                                background: data?.settings.primaryColor,
                              }}
                            />
                          </div>
                        ) : (
                          <p>{d.description}</p>
                        )}
                      </div>
                    ))}
                  {analysis &&
                    (
                      [
                        { key: "traits", label: "核心特征" },
                        { key: "strengths", label: "主要优势" },
                        { key: "potentialIssues", label: "值得留意" },
                        { key: "suggestions", label: "探索建议" },
                      ] as const
                    ).map(({ key, label }) => (
                      <section className="share-insight" key={key}>
                        <h3>{label}</h3>
                        <ul>
                          {analysis[key].map((text, i) => (
                            <li key={i}>{text}</li>
                          ))}
                        </ul>
                      </section>
                    ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
