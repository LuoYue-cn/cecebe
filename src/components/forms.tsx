"use client";
import { useState, type ReactNode } from "react";
import { api, useApp } from "./context";
import Link from "next/link";
export function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
  help,
  min,
  max,
}: {
  label: string;
  name: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  help?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        step={type === "number" ? "any" : undefined}
        min={min}
        max={max}
        autoComplete={type === "password" ? "new-password" : undefined}
      />
      {help && <small>{help}</small>}
    </div>
  );
}
export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
export function Feedback({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  return (
    <>
      {error && (
        <div className="notice danger" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice success" role="status">
          {message}
        </div>
      )}
    </>
  );
}
export function AsyncButton({
  children,
  onClick,
  className = "button secondary small",
}: {
  children: ReactNode;
  onClick: () => Promise<unknown>;
  className?: string;
}) {
  const { data } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className={className}
        disabled={busy || !data}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onClick();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
      </button>
      {error && (
        <span className="notice danger" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
export function AuthForm({
  mode,
  resetToken = "",
}: {
  mode: "login" | "register" | "forgot" | "reset" | "password";
  resetToken?: string;
}) {
  const { reload, data } = useApp();
  const [values, setValues] = useState({
    email: "",
    password: "",
    username: "",
    oldPassword: "",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const labels = {
    login: "欢迎回来",
    register: "创建你的账号",
    forgot: "找回密码",
    reset: "设置新密码",
    password: "修改密码",
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ message?: string }>(`auth/${mode}`, {
        ...values,
        token: resetToken,
      });
      if (mode === "forgot") {
        setMessage(r.message ?? "邮件已发送。");
      } else if (mode === "reset") {
        location.href = "/login";
      } else {
        await reload();
        location.href = "/me";
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function field(name: keyof typeof values, label: string, type = "text") {
    return (
      <Field
        name={name}
        label={label}
        type={type}
        value={values[name]}
        onChange={(v) => setValues({ ...values, [name]: v })}
        required
      />
    );
  }
  return (
    <div className="container">
      <div className="card auth-card">
        <h2>{labels[mode]}</h2>
        <p className="muted">
          {mode === "login"
            ? "继续你的探索，查看和管理测试记录。"
            : "所有核心测试功能免费。"}
        </p>
        <form onSubmit={submit}>
          {mode === "register" && field("username", "用户名")}
          {["login", "register", "forgot"].includes(mode) &&
            field("email", "邮箱", "email")}
          {mode === "password" && field("oldPassword", "原密码", "password")}
          {mode !== "forgot" &&
            field(
              "password",
              mode === "login" ? "密码" : "密码（至少 10 位）",
              "password",
            )}
          <Feedback error={error} message={message} />
          <button className="button" disabled={busy || !data}>
            {busy ? "正在处理…" : labels[mode]}
          </button>
        </form>
        {mode === "login" && (
          <div className="row between" style={{ marginTop: 20 }}>
            <Link className="text-button" href="/register">
              注册账号
            </Link>
            <Link className="text-button" href="/forgot">
              忘记密码？
            </Link>
          </div>
        )}
        {mode === "register" && (
          <p>
            <Link className="text-button" href="/login">
              已有账号？登录
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
