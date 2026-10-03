import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { initialized, settings } from "@/lib/settings";
import { auth } from "@/security/auth";
import {
  isAdmin,
  canOwn,
  canShare,
  resultSensitivity,
} from "@/security/permissions";
import { findTest } from "@/services/tests";
import { publicSchema, testSchema } from "@/schemas/test";
import { reportData } from "@/services/report";
import { Home } from "@/components/home";
import { Install } from "@/components/install";
import { AuthForm } from "@/components/forms";
import { TakeTest } from "@/components/take-test";
import { Report } from "@/components/report";
import { MyPage, Stats } from "@/components/me";
import { Editor } from "@/components/editor";
import { Admin } from "@/components/admin";
import { AppError } from "@/lib/errors";
type Props = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
};
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const path = (await params).path ?? [];
  if (path[0] === "t" && path[1]) {
    try {
      const test = await db.test.findUnique({ where: { slug: path[1] } });
      if (
        test?.status === "published" &&
        test.visibility === "public" &&
        !test.deletedAt
      ) {
        const url = (await settings()).siteUrl;
        return {
          title: test.title,
          description: test.description,
          openGraph: {
            title: test.title,
            description: test.description,
            url: `${url}/t/${test.slug}`,
            images: [`${url}/api/og/${test.slug}`],
          },
        };
      }
    } catch {}
  }
  return path[0] &&
    ["result", "me", "admin", "s", "edit", "stats"].includes(path[0])
    ? { robots: { index: false, follow: false } }
    : {};
}
export default async function Page({ params, searchParams }: Props) {
  const path = (await params).path ?? [];
  const query = await searchParams;
  const route = path[0] ?? "home";
  let installed: boolean;
  try {
    installed = await initialized();
  } catch {
    return (
      <div className="container narrow">
        <div className="notice danger">
          <h2>数据库暂时不可用</h2>
          <p>请检查 DATABASE_URL 和数据库进程，再重新加载页面。</p>
        </div>
      </div>
    );
  }
  if (!installed && route !== "install") redirect("/install");
  if (installed && route === "install") redirect("/");
  if (route === "install") return <Install />;
  const actor = await auth();
  const config = await settings();
  if (route === "home" || route === "create") {
    const records = await db.test.findMany({
      where: { status: "published", visibility: "public", deletedAt: null },
      include: {
        currentVersion: true,
        versions: {
          select: {
            sessions: {
              where: {
                completedAt: { gte: new Date(Date.now() - 30 * 86400000) },
              },
              select: { id: true },
            },
          },
        },
        shares: { select: { clickCount: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const tiles = records
      .filter((t) => t.currentVersion)
      .map((t) => {
        const schema = testSchema.parse(t.currentVersion!.schema);
        const completed = t.versions.reduce((n, v) => n + v.sessions.length, 0);
        return {
          slug: t.slug,
          cover: t.cover,
          title: t.title,
          description: t.description,
          type: t.type,
          count: completed,
          questions: schema.questions.length,
          minutes: schema.estimated_time,
          rank:
            completed * 3 +
            t.shares.reduce((n, s) => n + s.clickCount, 0) +
            (t.recommended ? 100 : 0),
        };
      })
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 6);
    return <Home tests={tiles} />;
  }
  if (["login", "register", "forgot", "reset", "password"].includes(route))
    return (
      <AuthForm
        mode={route as "login" | "register" | "forgot" | "reset" | "password"}
        resetToken={query.token}
      />
    );
  if (route === "t" && path[1]) {
    try {
      const test = await findTest(
        path[1],
        actor
          ? {
              userId: actor.userId,
              id: actor.id,
              admin: isAdmin(actor.user?.role),
            }
          : null,
      );
      // Referral counting happens in the tracking API to avoid metadata prefetch side effects.
      return (
        <TakeTest
          test={{
            slug: test.slug,
            status: test.status,
            cover: test.cover,
            schema: publicSchema(testSchema.parse(test.currentVersion!.schema)),
            version: test.currentVersion!.version,
            owner:
              !!actor &&
              canOwn(test, { userId: actor.userId, sessionId: actor.id }),
          }}
        />
      );
    } catch (error) {
      if (error instanceof AppError)
        return (
          <div className="container narrow">
            <div className="notice danger">
              <h2>{error.status === 403 ? "无权访问" : "测试不可用"}</h2>
              <p>{error.message}</p>
            </div>
          </div>
        );
      throw error;
    }
  }
  if (route === "result" && path[1]) {
    if (!actor) redirect("/login");
    const session = await db.testSession.findUnique({
      where: { id: path[1] },
      include: {
        testVersion: { include: { test: true } },
        score: true,
        analysis: true,
      },
    });
    if (!session) notFound();
    if (!(
      (actor.userId && session.userId === actor.userId) ||
      (!session.userId &&
        session.anonymousSessionId === actor.id &&
        config.anonymousResults)
    ))
      return <Forbidden />;
    if (!session.score)
      return (
        <div className="container">
          <p>答卷尚未提交。</p>
        </div>
      );
    return (
      <Report
        report={{
          ...reportData(session),
          canPublish:
            !session.testVersion.test.deletedAt &&
            canOwn(session.testVersion.test, {
              userId: actor.userId,
              sessionId: actor.id,
            }),
        }}
      />
    );
  }
  if (route === "s" && path[1]) {
    const share = await db.share.findUnique({
      where: { shareCode: path[1] },
      include: {
        session: {
          include: {
            testVersion: { include: { test: true } },
            score: true,
            analysis: true,
          },
        },
        test: true,
      },
    });
    if (
      !share ||
      share.revokedAt ||
      share.type !== "result" ||
      !share.session?.score ||
      !share.session.analysis ||
      !canShare(
        resultSensitivity(
          share.test.sensitivity,
          testSchema.parse(share.session.testVersion.schema).sensitivity,
        ),
        config,
        true,
      ) ||
      share.test.deletedAt ||
      share.test.status !== "published" ||
      share.test.visibility !== "public"
    )
      notFound();
    return <Report report={reportData(share.session, true)} />;
  }
  if (route === "me")
    return (
      <MyPage
        section={
          path[1] === "created"
            ? "created"
            : path[1] === "tests"
              ? "tests"
              : "account"
        }
      />
    );
  if (route === "stats" && path[1]) return <Stats slug={path[1]} />;
  if (route === "edit" && path[1]) {
    if (!actor) redirect("/login");
    const test = await findTest(path[1], {
      userId: actor.userId,
      id: actor.id,
    });
    if (!canOwn(test, { userId: actor.userId, sessionId: actor.id }))
      return <Forbidden />;
    return (
      <Editor
        slug={test.slug}
        initial={testSchema.parse(test.currentVersion!.schema)}
        cover={test.cover ?? ""}
        visibility={test.visibility}
      />
    );
  }
  if (route === "admin") {
    if (!actor?.user) redirect("/login");
    if (!isAdmin(actor.user.role)) return <Forbidden />;
    return <Admin section={path[1] ?? "dashboard"} />;
  }
  if (route === "privacy")
    return (
      <div className="container narrow">
        <div className="card">
          <h1>隐私与测试说明</h1>
          <p>
            测试用于知识练习、自我探索与娱乐参考，不代表专业诊断或身份认定。
          </p>
          <h3>你留下的数据</h3>
          <p>
            本站
            {config.saveAnswers
              ? "会保存原始答案以供回顾"
              : "默认不长期保存原始答案，评分后保留维度分数和分析报告"}
            。开放题仅临时用于分析，分析任务结束后清除。历史记录保留{" "}
            {config.historyDays} 天。AI
            服务接收创建主题、维度分数与必要的开放题，请勿提交身份证件、联系方式等无关信息。
          </p>
          <h3>分享与删除</h3>
          <p>
            完整结果默认仅答题者可见。公开分享需主动创建，你可撤销公开链接或永久删除测试记录。分享图二维码指向原测试，不包含私人结果。
          </p>
          <h3>安全与广告</h3>
          <p>
            账号密码采用 Argon2 哈希，AI
            密钥在服务器加密保存。广告仅位于正文后的页脚，并在隔离 iframe
            内运行。第三方 AI 服务与广告提供者可能按照各自政策处理请求信息。
          </p>
        </div>
      </div>
    );
  notFound();
}
function Forbidden() {
  return (
    <div className="container narrow">
      <div className="notice danger">
        <h1>403</h1>
        <p>你没有访问此页面的权限。</p>
      </div>
    </div>
  );
}
