"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Settings } from "@/lib/settings";
export type Bootstrap = {
  installed: boolean;
  csrf: string;
  user: {
    id: string;
    username: string;
    role: "USER" | "ADMIN" | "SUPER_ADMIN";
  } | null;
  settings: Settings;
};
const Context = createContext<{
  data: Bootstrap | null;
  reload: () => Promise<void>;
}>({ data: null, reload: async () => {} });
let csrfToken = "";
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
): Promise<T> {
  if (body !== undefined && !csrfToken) {
    const boot = await api<Bootstrap>("bootstrap");
    csrfToken = boot.csrf;
  }
  const response = await fetch(
    `/api/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "请求失败。");
  return result as T;
}
export function AppContext({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");
  async function reload() {
    const next = await api<Bootstrap>("bootstrap");
    csrfToken = next.csrf;
    setData(next);
    document.documentElement.style.setProperty(
      "--brand",
      next.settings.primaryColor,
    );
    setError("");
  }
  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, []);
  return (
    <Context.Provider value={{ data, reload }}>
      {error && (
        <div className="notice danger" role="alert">
          {error}
          <button onClick={() => reload().catch((e) => setError(e.message))}>
            重试连接
          </button>
        </div>
      )}
      {children}
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
export function csrfValue() {
  return csrfToken;
}
