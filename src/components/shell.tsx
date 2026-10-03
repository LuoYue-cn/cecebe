"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, Sun, Moon, Menu } from "lucide-react";
import { useApp, api } from "./context";
import { zh } from "@/i18n/zh-CN";
export function Header() {
  const { data, reload } = useApp();
  const [theme, setTheme] = useState("system");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setTheme(localStorage.getItem("theme") || "system");
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  return (
    <header className="header">
      <Link className="brand" href="/">
        {data?.settings.logo ? (
          <img src={data.settings.logo} alt="" width={32} height={32} />
        ) : (
          <span className="brand-mark">
            <Sparkles size={20} />
          </span>
        )}
        {data?.settings.siteName ?? zh.brand}
        <span className="brand-tag">好奇有答案</span>
      </Link>
      <button
        className="icon mobile-menu"
        aria-label="打开导航"
        onClick={() => setOpen(!open)}
      >
        <Menu />
      </button>
      <nav className={open ? "nav open" : "nav"} aria-label="主导航">
        <Link href="/">探索</Link>
        <Link href="/me/tests">{zh.history}</Link>
        <Link href="/me/created">{zh.created}</Link>
        {data?.user && data.user.role !== "USER" && (
          <Link href="/admin">{zh.admin}</Link>
        )}
        <button
          className="icon"
          title={`主题：${theme}`}
          aria-label="切换明亮、深色和系统主题"
          onClick={() => {
            const next =
              theme === "system"
                ? "light"
                : theme === "light"
                  ? "dark"
                  : "system";
            localStorage.setItem("theme", next);
            setTheme(next);
          }}
        >
          {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        {data?.user ? (
          <>
            <Link className="user-pill" href="/me">
              {data.user.username}
            </Link>
            <button
              className="text-button"
              onClick={async () => {
                await api("auth/logout", {});
                await reload();
                location.href = "/";
              }}
            >
              {zh.logout}
            </button>
          </>
        ) : (
          <Link className="button small secondary" href="/login">
            {zh.login}
          </Link>
        )}
      </nav>
    </header>
  );
}
export function Footer() {
  const { data } = useApp();
  const path = usePathname();
  const [ads, setAds] = useState<{ id: string; label: string }[]>([]);
  const page =
    path === "/"
      ? "home"
      : path.startsWith("/t/")
        ? "test"
        : path.startsWith("/result/")
          ? "result"
          : "other";
  useEffect(() => {
    if (data?.installed && path !== "/install") {
      const ref =
        new URLSearchParams(window.location.search).get("ref") ||
        (path.startsWith("/s/") ? path.split("/")[2] : null);
      if (ref) api("track", { code: ref }).catch(() => {});
      api<{ items: { id: string; label: string }[] }>(`ads?page=${page}`)
        .then((r) => {
          setAds(r.items);
          r.items.forEach((a) => api("ads", { id: a.id }).catch(() => {}));
        })
        .catch(() => {});
    }
  }, [data?.installed, page, path]);
  return (
    <>
      <div className="ads-container">
        {ads.map((ad) => (
          <aside className="footer-ad" aria-label={ad.label} key={ad.id}>
            <small>{ad.label}</small>
            <iframe
              title={ad.label}
              sandbox="allow-scripts"
              src={`/api/ad-frame/${ad.id}`}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </aside>
        ))}
      </div>
      <footer className="footer">
        <span>
          © {new Date().getFullYear()} {data?.settings.siteName ?? zh.brand}
        </span>
        <span>保持好奇 · 理性看待每一份结果</span>
        <Link href="/privacy">隐私与测试说明</Link>
      </footer>
    </>
  );
}
