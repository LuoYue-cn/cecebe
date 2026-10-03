"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const routes: string[] = [];
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const previousPage = useRef<string | null>(null);
  useEffect(() => {
    try {
      const stored = JSON.parse(
        sessionStorage.getItem("cecebe:route-trail") || "[]",
      );
      const trail: string[] = Array.isArray(stored)
        ? stored.filter(
            (path) =>
              typeof path === "string" &&
              path.startsWith("/") &&
              !path.startsWith("//"),
          )
        : [];
      if (trail.at(-1) !== pathname) {
        if (trail.at(-2) === pathname) trail.pop();
        else trail.push(pathname);
      }
      previousPage.current = trail.at(-2) ?? null;
      sessionStorage.setItem(
        "cecebe:route-trail",
        JSON.stringify(trail.slice(-50)),
      );
    } catch {}
    if (routes.at(-1) !== pathname) {
      if (routes.at(-2) === pathname) routes.pop();
      else routes.push(pathname);
    }
  }, [pathname]);
  if (pathname === "/" || pathname === "/install") return null;
  const fallback = pathname.startsWith("/result/")
    ? "/me/tests"
    : pathname.startsWith("/edit/")
      ? pathname.replace("/edit/", "/t/")
      : pathname.startsWith("/stats/")
        ? "/me/created"
        : pathname.startsWith("/admin/")
          ? "/admin"
          : pathname.startsWith("/me/")
            ? "/me"
            : "/";
  function back() {
    let sameSiteReferrer = false;
    try {
      const referrer = new URL(document.referrer);
      sameSiteReferrer =
        referrer.origin === location.origin && referrer.pathname !== pathname;
    } catch {}
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const internalReload =
      navigation?.type === "reload" && !!previousPage.current;
    if (
      history.length > 1 &&
      (routes.length > 1 || sameSiteReferrer || internalReload)
    )
      router.back();
    else if (previousPage.current) router.replace(previousPage.current);
    else router.push(fallback);
  }
  return (
    <div className="container page-back">
      <button type="button" className="button secondary small" onClick={back}>
        <ArrowLeft size={16} aria-hidden="true" />
        返回
      </button>
    </div>
  );
}
