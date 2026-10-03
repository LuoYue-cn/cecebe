"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, useApp } from "./context";
import { AsyncButton, Feedback } from "./forms";
import { zh } from "@/i18n/zh-CN";
type Created = {
  id: string;
  title: string;
  slug: string;
  status: string;
  currentVersion: { version: number };
  versions: { _count: { sessions: number } }[];
  _count: { shares: number };
};
type History = {
  id: string;
  completedAt: string;
  status: string;
  analysis: { summary: string; resultLabel: string } | null;
  testVersion: { version: number; test: { title: string; slug: string } };
};
export function MyPage({
  section,
}: {
  section: "tests" | "created" | "account";
}) {
  const { data } = useApp();
  const [items, setItems] = useState<(Created | History)[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      if (section !== "account")
        setItems(
          (await api<{ items: (Created | History)[] }>(`me/${section}`)).items,
        );
      setLoading(false);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }, [section]);
  useEffect(() => {
    load();
  }, [load]);
  if (data && !data.user)
    return (
      <div className="container narrow">
        <div className="empty">
          登录后查看你的测试与记录。
          <p>
            <Link className="button" href="/login">
              登录
            </Link>
          </p>
        </div>
      </div>
    );
  return (
    <div className="container">
      <div className="page-title">
        <span className="eyebrow">我的探索</span>
        <h1>
          {section === "tests"
            ? zh.history
            : section === "created"
              ? zh.created
              : zh.account}
        </h1>
      </div>
      <div className="chips" style={{ justifyContent: "flex-start" }}>
        <Link
          className={`chip ${section === "tests" ? "active" : ""}`}
          href="/me/tests"
        >
          测试历史
        </Link>
        <Link
          className={`chip ${section === "created" ? "active" : ""}`}
          href="/me/created"
        >
          我创建的测试
        </Link>
        <Link
          className={`chip ${section === "account" ? "active" : ""}`}
          href="/me"
        >
          账号设置
        </Link>
      </div>
      <Feedback error={error} />
      {section === "account" ? (
        <div className="card">
          <h2>{data?.user?.username}</h2>
          <p>账号角色：{data?.user?.role}</p>
          <Link className="button secondary" href="/password">
            修改密码
          </Link>
        </div>
      ) : loading ? (
        <div className="skeleton" />
      ) : items.length ? (
        <div className="stack">
          {items.map((item) =>
            section === "created" ? (
              <CreatedItem
                key={item.id}
                item={item as Created}
                refresh={load}
              />
            ) : (
              <HistoryItem
                key={item.id}
                item={item as History}
                refresh={load}
              />
            ),
          )}
        </div>
      ) : (
        <div className="empty">
          {section === "created" ? zh.noCreated : zh.noHistory}
          <p>
            <Link className="button" href="/">
              去创建一个测试
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
function CreatedItem({
  item,
  refresh,
}: {
  item: Created;
  refresh: () => Promise<void>;
}) {
  return (
    <div className="card">
      <div className="row between">
        <div>
          <h3>{item.title}</h3>
          <p className="muted">
            {
              { draft: "草稿", published: "已发布", removed: "已下架" }[
                item.status
              ]
            }{" "}
            · V{item.currentVersion?.version} ·{" "}
            {item.versions.reduce((n, v) => n + v._count.sessions, 0)} 人参加 ·{" "}
            {item._count.shares} 个分享
          </p>
        </div>
        <Link className="button secondary small" href={`/t/${item.slug}`}>
          查看
        </Link>
      </div>
      <div className="row">
        <Link className="text-button" href={`/edit/${item.slug}`}>
          编辑
        </Link>
        <Link className="text-button" href={`/stats/${item.slug}`}>
          匿名统计
        </Link>
        <AsyncButton
          onClick={async () => {
            await api(
              `tests/${item.slug}/${item.status === "published" ? "unpublish" : "publish"}`,
              {},
            );
            await refresh();
          }}
        >
          {item.status === "published" ? "取消发布" : "发布"}
        </AsyncButton>
        <AsyncButton
          onClick={async () => {
            const result = await api<{ slug: string }>(
              `tests/${item.slug}/copy`,
              {},
            );
            location.href = `/edit/${result.slug}`;
          }}
        >
          复制测试
        </AsyncButton>
        <AsyncButton
          onClick={async () => {
            if (!confirm("删除这份测试？历史答卷会保留，公开入口将失效。"))
              return;
            await api(`tests/${item.slug}/delete`, {});
            await refresh();
          }}
        >
          删除
        </AsyncButton>
      </div>
    </div>
  );
}
function HistoryItem({
  item,
  refresh,
}: {
  item: History;
  refresh: () => Promise<void>;
}) {
  return (
    <div className="card">
      <h3>{item.testVersion.test.title}</h3>
      <p>{item.analysis?.resultLabel ?? "分析处理中"}</p>
      <p className="muted">{item.analysis?.summary}</p>
      <small>
        {new Date(item.completedAt).toLocaleString("zh-CN")} · V
        {item.testVersion.version}
      </small>
      <div className="actions">
        <Link className="button small" href={`/result/${item.id}`}>
          重新查看
        </Link>
        <Link
          className="button secondary small"
          href={`/t/${item.testVersion.test.slug}`}
        >
          再次测试
        </Link>
        <AsyncButton
          onClick={async () => {
            if (!confirm("永久删除这份答卷、报告和公开分享？")) return;
            await api(`tests/sessions/${item.id}/delete`, {});
            await refresh();
          }}
        >
          删除记录
        </AsyncButton>
      </div>
    </div>
  );
}
export function Stats({ slug }: { slug: string }) {
  const [stats, setStats] = useState<{
    started: number;
    completed: number;
    averageSeconds: number;
    dropoutRate: number;
    shareVisits: number;
    distribution: Record<string, number>;
    dimensions: Record<string, number>;
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    api<typeof stats>(`tests/${slug}/stats`)
      .then(setStats)
      .catch((e) => setError(e.message));
  }, [slug]);
  return (
    <div className="container narrow">
      <h1>测试匿名统计</h1>
      <Feedback error={error} />
      {stats && (
        <>
          <div className="metrics">
            {Object.entries({
              参加人数: stats.started,
              完成人数: stats.completed,
              平均秒数: stats.averageSeconds,
              退出率: `${stats.dropoutRate}%`,
              分享访问: stats.shareVisits,
            }).map(([k, v]) => (
              <div className="card metric" key={k}>
                <small>{k}</small>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <div className="two-col">
            <div className="card">
              <h3>结果分布</h3>
              {Object.entries(stats.distribution).map(([k, v]) => (
                <p key={k}>
                  {k}：{v}
                </p>
              ))}
            </div>
            <div className="card">
              <h3>维度平均值</h3>
              {Object.entries(stats.dimensions).map(([k, v]) => (
                <div className="dimension" key={k}>
                  <div className="row between">
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </div>
                  <div className="bar">
                    <span style={{ width: `${v}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
