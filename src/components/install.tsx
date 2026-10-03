"use client";
import { useState, useEffect } from "react";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Check as CheckIcon,
} from "lucide-react";
import { api, useApp } from "./context";
import { Field, Check, Feedback } from "./forms";
import type { ProviderConfig } from "@/providers/provider";
import type { Settings } from "@/lib/settings";
export const initialProvider: ProviderConfig = {
  name: "默认 AI",
  type: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  generationModel: "",
  analysisModel: "",
  temperature: 0.7,
  maxTokens: 0,
  timeout: 120,
};
export function ProviderForm({
  value,
  onChange,
}: {
  value: ProviderConfig;
  onChange: (p: ProviderConfig) => void;
}) {
  const set = (key: keyof ProviderConfig, v: string | number) =>
    onChange({ ...value, [key]: v });
  return (
    <>
      <Field
        name="provider-name"
        label="Provider 名称"
        value={value.name}
        onChange={(v) => set("name", v)}
        required
      />
      <div className="field">
        <label htmlFor="provider-type">Provider 类型</label>
        <select
          id="provider-type"
          value={value.type}
          onChange={(e) => {
            const type = e.target.value as ProviderConfig["type"];
            onChange({
              ...value,
              type,
              baseUrl: {
                openai: "https://api.openai.com/v1",
                compatible: value.baseUrl,
                deepseek: "https://api.deepseek.com/v1",
                openrouter: "https://openrouter.ai/api/v1",
                gemini: "https://generativelanguage.googleapis.com/v1beta",
              }[type],
            });
          }}
        >
          {["openai", "compatible", "deepseek", "openrouter", "gemini"].map(
            (t) => (
              <option key={t}>{t}</option>
            ),
          )}
        </select>
      </div>
      <Field
        name="base-url"
        label="Base URL"
        value={value.baseUrl}
        onChange={(v) => set("baseUrl", v)}
        required
      />
      <Field
        name="api-key"
        label="API Key"
        value={value.apiKey}
        type="password"
        onChange={(v) => set("apiKey", v)}
        required
        help="密钥仅在服务器加密保存。"
      />
      <div className="two-col">
        <Field
          name="generation-model"
          label="出题模型"
          value={value.generationModel}
          onChange={(v) => set("generationModel", v)}
          required
        />
        <Field
          name="analysis-model"
          label="分析模型"
          value={value.analysisModel}
          onChange={(v) => set("analysisModel", v)}
          required
        />
      </div>
      <div className="two-col">
        <Field
          name="temperature"
          label="Temperature"
          type="number"
          min={0}
          max={2}
          value={value.temperature}
          onChange={(v) => set("temperature", Number(v))}
        />
        <Field
          name="max-tokens"
          label="Max Tokens（0 = 不限制）"
          type="number"
          min={0}
          value={value.maxTokens}
          onChange={(v) => set("maxTokens", Number(v))}
        />
      </div>
      <Field
        name="timeout"
        label="Timeout（秒）"
        type="number"
        min={10}
        max={300}
        value={value.timeout}
        onChange={(v) => set("timeout", Number(v))}
      />
    </>
  );
}
const privacyFields: { key: keyof Settings; label: string }[] = [
  { key: "saveAnswers", label: "保存原始答案" },
  { key: "allowSensitive", label: "允许敏感自我探索测试" },
  { key: "allowHighRisk", label: "允许高风险测试（默认关闭）" },
  { key: "aiLogs", label: "记录 AI 调用元数据（不含完整提示词）" },
  { key: "moderation", label: "启用内容审核" },
  { key: "resultSharing", label: "允许主动公开分享结果" },
  { key: "highRiskSharing", label: "允许高风险结果公开分享" },
  { key: "auditIp", label: "记录管理员审计 IP" },
];
export function PrivacyForm({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (s: Settings) => void;
}) {
  return (
    <>
      {privacyFields.map(({ key, label }) => (
        <Check
          key={key}
          label={label}
          checked={value[key] as boolean}
          onChange={(v) => onChange({ ...value, [key]: v })}
        />
      ))}
      <Field
        name="historyDays"
        type="number"
        label="历史记录保存天数"
        min={1}
        max={3650}
        value={value.historyDays}
        onChange={(v) => onChange({ ...value, historyDays: Number(v) })}
      />
    </>
  );
}
export function SiteForm({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (s: Settings) => void;
}) {
  return (
    <>
      {(
        [
          { key: "siteName", label: "站点名称" },
          { key: "description", label: "站点描述" },
          { key: "siteUrl", label: "网站 URL" },
          { key: "logo", label: "Logo 图片地址" },
          { key: "favicon", label: "Favicon 图片地址" },
          { key: "primaryColor", label: "主色（HEX）" },
          { key: "shareFooter", label: "分享图页脚文本" },
        ] as const
      ).map(({ key, label }) => (
        <Field
          key={key}
          name={key}
          label={label}
          value={value[key]}
          onChange={(v) => onChange({ ...value, [key]: v })}
        />
      ))}
      <div className="field">
        <label htmlFor="defaultLanguage">默认语言</label>
        <select
          id="defaultLanguage"
          value={value.defaultLanguage}
          onChange={(e) =>
            onChange({
              ...value,
              defaultLanguage: e.target.value as Settings["defaultLanguage"],
            })
          }
        >
          <option value="zh-CN">简体中文</option>
          <option value="en">English（测试输出语言）</option>
        </select>
      </div>
      {(
        [
          { key: "registration", label: "开放注册" },
          { key: "anonymousTest", label: "允许游客答题" },
          { key: "anonymousCreate", label: "允许游客创建测试" },
          { key: "anonymousResults", label: "允许游客查看自己的结果" },
        ] as const
      ).map(({ key, label }) => (
        <Check
          key={key}
          label={label}
          checked={value[key]}
          onChange={(v) => onChange({ ...value, [key]: v })}
        />
      ))}
    </>
  );
}
export function Install() {
  const { data } = useApp();
  const [step, setStep] = useState(0);
  const [checks, setChecks] = useState<Record<string, boolean | string>>();
  const [admin, setAdmin] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [provider, setProvider] = useState(initialProvider);
  const [config, setConfig] = useState<Settings>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    api<Record<string, boolean | string>>("install")
      .then(setChecks)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (data && !config) setConfig(data.settings);
  }, [data, config]);
  const steps = ["环境检查", "创建管理员", "连接 AI", "站点设置", "隐私与安全"];
  async function connection() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("install/connection", provider);
      setMessage("出题模型与分析模型连接成功。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function next(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (step === 0 && !checks?.database) {
      setError("数据库连接未通过。");
      return;
    }
    if (step === 1 && admin.password !== admin.confirmPassword) {
      setError("两次密码不一致。");
      return;
    }
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      await api("install/complete", { admin, provider, settings: config });
      location.href = "/login";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container narrow install-page">
      <div className="page-title">
        <span className="eyebrow">
          <Sparkles size={16} /> 你的好奇空间，即将开启
        </span>
        <h1>准备好，开始探索。</h1>
        <p>只需五步，让测测be来到你身边。</p>
      </div>
      <ol className="steps" style={{ padding: 0, listStyle: "none" }}>
        {steps.map((s, i) => (
          <li
            className={`step ${step === i ? "current" : ""} ${step > i ? "complete" : ""}`}
            key={s}
            aria-current={step === i ? "step" : undefined}
          >
            <span className="step-number">
              {step > i ? <CheckIcon size={16} /> : i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <form className="card install-card" onSubmit={next}>
        <span className="tag">第 {step + 1} 站 · 共 5 站</span>
        <h2>{steps[step]}</h2>
        {step === 0 && (
          <>
            <p className="muted">
              安装完成后，服务器会永久锁定安装入口。后续配置在后台修改。
            </p>
            {checks ? (
              Object.entries(checks).map(([k, v]) => (
                <div className="environment-check row between" key={k}>
                  <span>
                    {
                      {
                        database: "PostgreSQL 数据库",
                        cache: "Redis 缓存与任务队列",
                        writable: "上传目录写入权限",
                        configured: "环境变量配置",
                        node: "Node.js 版本",
                      }[k]
                    }
                  </span>
                  <span
                    className={v === false ? "check-failed" : "check-passed"}
                  >
                    {v === false ? (
                      <XCircle size={18} />
                    ) : (
                      <CheckCircle2 size={18} />
                    )}
                    {typeof v === "boolean" ? (v ? "可用" : "未通过") : v}
                  </span>
                </div>
              ))
            ) : (
              <p>正在检测环境…</p>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() =>
                api<Record<string, boolean | string>>("install")
                  .then(setChecks)
                  .catch((e) => setError(e.message))
              }
            >
              重新检查
            </button>
          </>
        )}
        {step === 1 && (
          <>
            {Object.entries({
              username: "管理员用户名",
              email: "邮箱",
              password: "密码（至少 10 位）",
              confirmPassword: "确认密码",
            }).map(([k, label]) => (
              <Field
                key={k}
                name={k}
                label={label}
                type={
                  k === "email"
                    ? "email"
                    : k.toLowerCase().includes("password")
                      ? "password"
                      : "text"
                }
                value={admin[k as keyof typeof admin]}
                onChange={(v) => setAdmin({ ...admin, [k]: v })}
                required
              />
            ))}
            <small>该账号将成为超级管理员。</small>
          </>
        )}
        {step === 2 && (
          <>
            <ProviderForm value={provider} onChange={setProvider} />
            <button
              className="button secondary"
              type="button"
              onClick={connection}
              disabled={busy}
            >
              测试连接
            </button>
          </>
        )}
        {step === 3 && config && (
          <SiteForm value={config} onChange={setConfig} />
        )}
        {step === 4 && config && (
          <PrivacyForm value={config} onChange={setConfig} />
        )}
        <Feedback error={error} message={message} />
        <div className="actions">
          {step > 0 && (
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setStep(step - 1);
                setError("");
                setMessage("");
              }}
            >
              上一步
            </button>
          )}
          <button
            className="button"
            disabled={
              busy ||
              !data ||
              (step === 0 &&
                (!checks || Object.values(checks).some((v) => v === false)))
            }
          >
            {busy ? "正在处理…" : step === 4 ? "完成安装" : "下一步"}
            {!busy && <ArrowRight size={17} />}
          </button>
        </div>
      </form>
    </div>
  );
}
