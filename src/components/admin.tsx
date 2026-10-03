"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, useApp, csrfValue } from "./context";
import { Field, Check, Feedback, AsyncButton } from "./forms";
import {
  ProviderForm,
  initialProvider,
  PrivacyForm,
  SiteForm,
} from "./install";
import type { ProviderConfig } from "@/providers/provider";
import type { Settings } from "@/lib/settings";
import { zh } from "@/i18n/zh-CN";
type Row = {
  id: string;
  email?: string;
  username?: string;
  role?: string;
  status?: string;
  deletedAt?: string;
  createdAt?: string;
  title?: string;
  slug?: string;
  sensitivity?: string;
  creator?: { username: string };
  versions?: { version: number; _count: { sessions: number } }[];
  recommended?: boolean;
  actorId?: string;
  action?: string;
  target?: string;
  name?: string;
  type?: string;
  baseUrl?: string;
  generationModel?: string;
  analysisModel?: string;
  apiKey?: string;
  enabled?: boolean;
  isDefault?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  kind?: string;
  version?: number;
  content?: string;
  code?: string;
  pages?: string[];
  label?: string;
  impressions?: number;
  _count?: { attempts: number; tests: number };
};
type AdminData = {
  items?: Row[];
  total?: number;
  page?: number;
  settings?: Settings;
  defaults?: Record<string, string>;
  ai?: {
    id: string;
    kind: string;
    model: string;
    status: string;
    latency: number;
    promptTokens: number;
    completionTokens: number;
  }[];
  popular?: { title: string; slug: string; count: number }[];
  [key: string]: unknown;
};
export function Admin({ section }: { section: string }) {
  const { data: app } = useApp();
  const [data, setData] = useState<AdminData>();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      setData(
        await api<AdminData>(
          `admin/${section}?page=${page}&q=${encodeURIComponent(query)}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, [section, page, query]);
  useEffect(() => {
    load();
  }, [load]);
  const superAdmin = app?.user?.role === "SUPER_ADMIN";
  return (
    <div className="container" style={{ maxWidth: 1280 }}>
      <div className="admin-layout">
        <aside className="admin-sidebar" aria-label="管理员导航">
          {Object.entries(zh.adminNav)
            .filter(
              ([key]) =>
                superAdmin ||
                !["ai", "prompts", "security", "settings"].includes(key),
            )
            .map(([key, value]) => (
              <Link
                key={key}
                className={section === key ? "active" : ""}
                href={key === "dashboard" ? "/admin" : `/admin/${key}`}
              >
                {value}
              </Link>
            ))}
        </aside>
        <section>
          <div className="page-title">
            <span className="eyebrow">管理后台</span>
            <h1 style={{ fontSize: "2rem" }}>
              {zh.adminNav[section as keyof typeof zh.adminNav] ?? section}
            </h1>
          </div>
          <Feedback error={error} />
          {!data && !error ? (
            <div className="skeleton" />
          ) : (
            <>
              {section === "dashboard" && data && <Dashboard data={data} />}
              {["users", "tests"].includes(section) && data && (
                <>
                  <form
                    className="row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setQuery(search);
                      setPage(1);
                    }}
                  >
                    <input
                      aria-label="搜索"
                      placeholder={
                        section === "users"
                          ? "搜索邮箱 / 用户名"
                          : "搜索测试名称"
                      }
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                        background: "var(--surface)",
                        color: "var(--text)",
                      }}
                    />
                    <button className="button small">搜索</button>
                  </form>
                  <div className="card table-wrap" style={{ marginTop: 20 }}>
                    <table>
                      <thead>
                        <tr>
                          {(section === "users"
                            ? ["用户", "角色 / 状态", "测试记录", "操作"]
                            : [
                                "测试",
                                "创建者 / 敏感级别",
                                "版本 / 人数",
                                "操作",
                              ]
                          ).map((v) => (
                            <th key={v}>{v}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.items?.map((item) => (
                          <tr key={item.id}>
                            {section === "users" ? (
                              <>
                                <td>
                                  <strong>{item.username}</strong>
                                  <br />
                                  <small>{item.email}</small>
                                </td>
                                <td>
                                  {item.role}
                                  <br />
                                  {item.deletedAt ? "已删除" : item.status}
                                </td>
                                <td>{item._count?.attempts ?? 0} 份</td>
                                <td>
                                  <div className="row">
                                    <Action
                                      section="users"
                                      action={
                                        item.status === "banned"
                                          ? "unban"
                                          : "ban"
                                      }
                                      item={item}
                                      refresh={load}
                                    >
                                      {item.status === "banned"
                                        ? "解封"
                                        : "封禁"}
                                    </Action>
                                    <Action
                                      section="users"
                                      action={
                                        item.deletedAt ? "restore" : "delete"
                                      }
                                      item={item}
                                      refresh={load}
                                    >
                                      {item.deletedAt ? "恢复" : "删除"}
                                    </Action>
                                    {superAdmin && (
                                      <label>
                                        角色{" "}
                                        <select
                                          aria-label={`修改 ${item.username} 的角色`}
                                          value={item.role}
                                          onChange={async (e) => {
                                            try {
                                              await api("admin/users/role", {
                                                id: item.id,
                                                role: e.target.value,
                                              });
                                              await load();
                                            } catch (e) {
                                              setError((e as Error).message);
                                            }
                                          }}
                                        >
                                          {["USER", "ADMIN", "SUPER_ADMIN"].map(
                                            (r) => (
                                              <option key={r}>{r}</option>
                                            ),
                                          )}
                                        </select>
                                      </label>
                                    )}
                                    <AsyncButton
                                      onClick={async () => {
                                        const records = await api<{
                                          items: {
                                            id: string;
                                            status: string;
                                            startedAt: string;
                                            testVersion: {
                                              test: { title: string };
                                            };
                                          }[];
                                        }>("admin/users/records", {
                                          id: item.id,
                                        });
                                        alert(
                                          records.items
                                            .map(
                                              (r) =>
                                                `${r.testVersion.test.title} · ${r.status} · ${r.startedAt}`,
                                            )
                                            .join("\n") || "没有测试记录。",
                                        );
                                      }}
                                    >
                                      查看记录
                                    </AsyncButton>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td>
                                  <strong>{item.title}</strong>
                                  <br />
                                  <small>
                                    {item.status}
                                    {item.deletedAt ? " / 已删除" : ""}
                                  </small>
                                </td>
                                <td>
                                  {item.creator?.username ?? "游客"}
                                  <br />
                                  {item.sensitivity}
                                </td>
                                <td>
                                  {item.versions
                                    ?.map(
                                      (v) =>
                                        `V${v.version} (${v._count.sessions})`,
                                    )
                                    .join(" / ")}
                                </td>
                                <td>
                                  <div className="row">
                                    <Action
                                      section="tests"
                                      action={
                                        item.status === "removed"
                                          ? "restore"
                                          : "remove"
                                      }
                                      item={item}
                                      refresh={load}
                                    >
                                      {item.status === "removed"
                                        ? "恢复"
                                        : "下架"}
                                    </Action>
                                    <Action
                                      section="tests"
                                      action="delete"
                                      item={item}
                                      refresh={load}
                                    >
                                      删除
                                    </Action>
                                    <AsyncButton
                                      onClick={async () => {
                                        await api("admin/tests/recommend", {
                                          id: item.id,
                                          recommended: !item.recommended,
                                        });
                                        await load();
                                      }}
                                    >
                                      {item.recommended ? "取消推荐" : "推荐"}
                                    </AsyncButton>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!data.items?.length && (
                      <p className="muted">没有符合条件的记录。</p>
                    )}
                  </div>
                  <div className="pagination">
                    <button
                      className="button secondary small"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      上一页
                    </button>
                    <span>
                      第 {page} 页 / 共 {data.total ?? 0} 条
                    </span>
                    <button
                      className="button secondary small"
                      disabled={page * 20 >= (data.total ?? 0)}
                      onClick={() => setPage(page + 1)}
                    >
                      下一页
                    </button>
                  </div>
                </>
              )}
              {section === "ai" && data && (
                <AIManagement items={data.items ?? []} refresh={load} />
              )}
              {section === "prompts" && data && (
                <Prompts data={data} refresh={load} />
              )}
              {(section === "security" || section === "settings") &&
                data?.settings && (
                  <SettingsForm
                    section={section}
                    initial={data.settings}
                    refresh={load}
                  />
                )}
              {section === "ads" && data && (
                <Ads items={data.items ?? []} refresh={load} />
              )}
              {section === "logs" && data && (
                <Logs data={data} page={page} setPage={setPage} />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
function Dashboard({ data }: { data: AdminData }) {
  const labels = {
    users: "总用户数",
    todayUsers: "今日新用户",
    tests: "测试数量",
    todayCompleted: "今日完成",
    aiRequests: "AI 请求数",
    aiTokens: "Token 用量",
    aiErrorRate: "AI 错误率 %",
    shareVisits: "分享访问",
  };
  return (
    <>
      <div className="metrics">
        {Object.entries(labels).map(([k, v]) => (
          <div className="card metric" key={k}>
            <small>{v}</small>
            <strong>{String(data[k] ?? 0)}</strong>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>热门测试</h3>
        {data.popular?.map((t) => (
          <p key={t.slug}>
            <Link href={`/t/${t.slug}`}>{t.title}</Link>{" "}
            <span className="muted">{t.count} 人参加</span>
          </p>
        ))}
        {!data.popular?.length && <p className="muted">暂无测试。</p>}
      </div>
    </>
  );
}
function Action({
  section,
  action,
  item,
  refresh,
  children,
}: {
  section: string;
  action: string;
  item: Row;
  refresh: () => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <AsyncButton
      onClick={async () => {
        if (
          ["delete", "ban", "remove"].includes(action) &&
          !confirm(
            `确认${typeof children === "string" ? children : "执行此操作"}？`,
          )
        )
          return;
        await api(`admin/${section}/${action}`, { id: item.id });
        await refresh();
      }}
    >
      {children}
    </AsyncButton>
  );
}
function AIManagement({
  items,
  refresh,
}: {
  items: Row[];
  refresh: () => Promise<void>;
}) {
  const [config, setConfig] = useState(initialProvider);
  const [id, setId] = useState<string>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      {items.map((item) => (
        <div className="card" key={item.id}>
          <div className="row between">
            <h3>
              {item.name} {item.isDefault && <span className="tag">默认</span>}
            </h3>
            <small>{item.enabled ? "启用" : "停用"}</small>
          </div>
          <p className="muted">
            {item.type} · {item.generationModel} / {item.analysisModel} ·{" "}
            {item.apiKey}
          </p>
          <div className="row">
            <AsyncButton
              onClick={async () => {
                await api("admin/ai/connection", { id: item.id });
                setMessage("连接成功。");
              }}
            >
              测试连接
            </AsyncButton>
            <AsyncButton
              onClick={async () => {
                await api("admin/ai/default", { id: item.id });
                await refresh();
              }}
            >
              设为默认
            </AsyncButton>
            <AsyncButton
              onClick={async () => {
                await api("admin/ai/disable", { id: item.id });
                await refresh();
              }}
            >
              停用
            </AsyncButton>
            <button
              className="button secondary small"
              onClick={() => {
                setId(item.id);
                setConfig({
                  name: item.name!,
                  type: item.type as ProviderConfig["type"],
                  baseUrl: item.baseUrl!,
                  generationModel: item.generationModel!,
                  analysisModel: item.analysisModel!,
                  temperature: item.temperature!,
                  maxTokens: item.maxTokens!,
                  timeout: item.timeout!,
                  apiKey: "",
                });
              }}
            >
              编辑配置 / 更换密钥
            </button>
          </div>
        </div>
      ))}
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            await api("admin/ai/save", { ...config, id });
            setConfig(initialProvider);
            setId(undefined);
            await refresh();
            setMessage("AI 配置已保存。");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{id ? "编辑 Provider" : "添加 Provider"}</h2>
        <ProviderForm value={config} onChange={setConfig} />
        <Feedback error={error} message={message} />
        <div className="row">
          <button className="button" disabled={busy}>
            保存
          </button>
          <AsyncButton
            onClick={async () => {
              await api("admin/ai/connection", config);
              setMessage("连接成功。");
            }}
          >
            测试新配置
          </AsyncButton>
          {id && (
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setId(undefined);
                setConfig(initialProvider);
              }}
            >
              取消编辑
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
function Prompts({
  data,
  refresh,
}: {
  data: AdminData;
  refresh: () => Promise<void>;
}) {
  const [kind, setKind] = useState("generation");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setContent(
      data.items?.find((i) => i.kind === kind)?.content ??
        data.defaults?.[kind] ??
        "",
    );
  }, [kind, data]);
  return (
    <div className="card">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("admin/prompts/save", { kind, content });
            await refresh();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="field">
          <label htmlFor="prompt-kind">提示词类型</label>
          <select
            id="prompt-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {Object.keys(data.defaults ?? {}).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="prompt-content">提示词内容</label>
          <textarea
            id="prompt-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{ minHeight: 220 }}
          />
        </div>
        <Feedback error={error} />
        <button className="button">保存新版本</button>
      </form>
      <h3 style={{ marginTop: 24 }}>版本历史</h3>
      {data.items
        ?.filter((i) => i.kind === kind)
        .map((i) => (
          <details key={i.id}>
            <summary>
              V{i.version} · {new Date(i.createdAt!).toLocaleString("zh-CN")}
            </summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>
              {i.content}
            </pre>
          </details>
        ))}
    </div>
  );
}
function SettingsForm({
  section,
  initial,
  refresh,
}: {
  section: string;
  initial: Settings;
  refresh: () => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`admin/${section}/save`, value);
          setMessage("配置已保存。");
          await refresh();
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      {section === "settings" ? (
        <>
          <SiteForm value={value} onChange={setValue} />
          <div className="field">
            <label htmlFor="upload">上传 Logo / Favicon（2MB 以内）</label>
            <input
              id="upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const form = new FormData();
                  form.set("file", file);
                  const response = await fetch("/api/uploads", {
                    method: "POST",
                    headers: { "x-csrf-token": csrfValue() },
                    body: form,
                  });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error);
                  setValue({ ...value, logo: result.url });
                  setMessage("图片已上传，保存配置后生效。");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          </div>
        </>
      ) : (
        <>
          <PrivacyForm value={value} onChange={setValue} />
          {(
            [
              { key: "maxQuestions", label: "最大题目数量" },
              { key: "maxInputLength", label: "最大主题长度" },
              { key: "generationPerMinute", label: "每分钟生成上限" },
              { key: "anonymousPerMinute", label: "游客每分钟生成上限" },
            ] as const
          ).map(({ key, label }) => (
            <Field
              key={key}
              name={key}
              label={label}
              type="number"
              value={value[key]}
              onChange={(v) => setValue({ ...value, [key]: Number(v) })}
            />
          ))}
          <h3>允许的测试类型</h3>
          {Object.entries(zh.types)
            .filter(([k]) => k !== "auto")
            .map(([k, label]) => (
              <Check
                key={k}
                label={label}
                checked={value.allowedTypes.includes(
                  k as Settings["allowedTypes"][number],
                )}
                onChange={(v) =>
                  setValue({
                    ...value,
                    allowedTypes: v
                      ? [
                          ...value.allowedTypes,
                          k as Settings["allowedTypes"][number],
                        ]
                      : value.allowedTypes.filter((t) => t !== k),
                  })
                }
              />
            ))}
          <div className="field">
            <label htmlFor="sensitive-words">禁止主题词（每行一个）</label>
            <textarea
              id="sensitive-words"
              value={value.sensitiveWords.join("\n")}
              onChange={(e) =>
                setValue({
                  ...value,
                  sensitiveWords: e.target.value.split("\n").filter(Boolean),
                })
              }
            />
          </div>
        </>
      )}
      <Feedback error={error} message={message} />
      <button className="button">保存设置</button>
    </form>
  );
}
function Ads({
  items,
  refresh,
}: {
  items: Row[];
  refresh: () => Promise<void>;
}) {
  const [ad, setAd] = useState({
    id: undefined as string | undefined,
    enabled: false,
    code: "",
    pages: ["home", "test", "result", "other"],
    label: "广告 / Advertisement",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  return (
    <div className="stack">
      {items.map((item) => (
        <div className="card row between" key={item.id}>
          <div>
            <h3>{item.label}</h3>
            <small>
              {item.enabled ? "启用" : "关闭"} · 曝光 {item.impressions} ·{" "}
              {item.pages?.join(", ")}
            </small>
          </div>
          <button
            className="button secondary small"
            onClick={() =>
              setAd({
                id: item.id,
                enabled: item.enabled!,
                code: item.code!,
                pages: item.pages!,
                label: item.label!,
              })
            }
          >
            编辑
          </button>
        </div>
      ))}
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("admin/ads/save", ad);
            setMessage("广告配置已保存。");
            await refresh();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <h2>{ad.id ? "编辑页脚广告" : "添加页脚广告"}</h2>
        <p className="muted">
          广告仅显示在正文结束后，并在隔离 iframe 内执行。
        </p>
        <Check
          label="启用广告"
          checked={ad.enabled}
          onChange={(v) => setAd({ ...ad, enabled: v })}
        />
        <Field
          name="ad-label"
          label="明确广告标签"
          value={ad.label}
          onChange={(v) => setAd({ ...ad, label: v })}
        />
        <div className="field">
          <label htmlFor="ad-code">广告 HTML / Script</label>
          <textarea
            id="ad-code"
            value={ad.code}
            onChange={(e) => setAd({ ...ad, code: e.target.value })}
            style={{ minHeight: 180 }}
          />
        </div>
        {Object.entries({
          home: "首页页脚",
          test: "测试页脚",
          result: "结果页脚",
          other: "其他页面页脚",
        }).map(([k, v]) => (
          <Check
            label={v}
            key={k}
            checked={ad.pages.includes(k)}
            onChange={(checked) =>
              setAd({
                ...ad,
                pages: checked
                  ? [...ad.pages, k]
                  : ad.pages.filter((p) => p !== k),
              })
            }
          />
        ))}
        <Feedback error={error} message={message} />
        <button className="button">保存广告</button>
      </form>
    </div>
  );
}
function Logs({
  data,
  page,
  setPage,
}: {
  data: AdminData;
  page: number;
  setPage: (p: number) => void;
}) {
  return (
    <div className="stack">
      <div className="card table-wrap">
        <h3>管理员审计日志</h3>
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>管理员</th>
              <th>操作</th>
              <th>目标</th>
            </tr>
          </thead>
          <tbody>
            {data.items?.map((i) => (
              <tr key={i.id}>
                <td>{new Date(i.createdAt!).toLocaleString("zh-CN")}</td>
                <td>{i.actorId?.slice(0, 8)}</td>
                <td>{i.action}</td>
                <td>{i.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pagination">
          <button
            className="button secondary small"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </button>
          <span>{page}</span>
          <button
            className="button secondary small"
            disabled={page * 20 >= (data.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </button>
        </div>
      </div>
      <div className="card table-wrap">
        <h3>最近 AI 调用</h3>
        <table>
          <thead>
            <tr>
              <th>用途</th>
              <th>模型</th>
              <th>状态</th>
              <th>Token</th>
              <th>耗时</th>
            </tr>
          </thead>
          <tbody>
            {data.ai?.map((i) => (
              <tr key={i.id}>
                <td>{i.kind}</td>
                <td>{i.model}</td>
                <td>{i.status}</td>
                <td>{i.promptTokens + i.completionTokens}</td>
                <td>{i.latency}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
