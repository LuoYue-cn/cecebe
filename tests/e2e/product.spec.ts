import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
test.afterAll(() => db.$disconnect());
const base = process.env.E2E_URL || "http://localhost:3000";
async function bootstrap(request: APIRequestContext) {
  return (await request.get("/api/bootstrap")).json();
}
async function post(request: APIRequestContext, path: string, body: unknown) {
  const boot = await bootstrap(request);
  return request.post(`/api/${path}`, {
    data: body,
    headers: { Origin: base, "x-csrf-token": boot.csrf },
  });
}
async function login(request: APIRequestContext) {
  expect(
    (
      await post(request, "auth/login", {
        email: "admin@example.test",
        password: "Test-password-2026!",
      })
    ).ok(),
  ).toBe(true);
}
let slug = "",
  resultId = "",
  testId = "";
test.describe.serial("Complete product acceptance", () => {
  test("fresh database redirects to install; wizard finishes and locks API", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/install$/);
    await expect(
      page.getByRole("heading", { name: "环境检查", exact: true }),
    ).toBeVisible();
    const boot = await bootstrap(request);
    expect(boot.installed).toBe(false);
    const checks = await (await request.get("/api/install")).json();
    expect(checks).toMatchObject({
      database: true,
      cache: true,
      writable: true,
      configured: true,
    });
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.screenshot({
      path: "docs/screenshots/install-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await page.getByLabel("管理员用户名").fill("站点管理员");
    await page.getByLabel("邮箱", { exact: true }).fill("admin@example.test");
    await page.getByLabel("密码（至少 10 位）").fill("Test-password-2026!");
    await page.getByLabel("确认密码").fill("Test-password-2026!");
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await page
      .getByLabel("Base URL", { exact: true })
      .fill("http://127.0.0.1:5100/v1");
    await page
      .getByLabel("API Key", { exact: true })
      .fill("fixture-private-api-key");
    await page
      .getByLabel("出题模型", { exact: true })
      .fill("fixture-generation");
    await page.getByLabel("分析模型", { exact: true }).fill("fixture-analysis");
    await page.getByRole("button", { name: "测试连接", exact: true }).click();
    await expect(page.getByText("出题模型与分析模型连接成功。")).toBeVisible();
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await page.getByRole("button", { name: "完成安装", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await post(request, "install/complete", {})).status()).toBe(409);
    await page.goto("/install");
    await expect(page).toHaveURL(base + "/");
  });
  test("login, create real queued test and retain scores only", async ({
    page,
    request,
  }) => {
    await login(request);
    expect((await post(request, "auth/logout", {})).ok()).toBe(true);
    await login(request);
    await login(page.request);
    await page.goto("/login");
    await page.getByLabel("邮箱", { exact: true }).fill("admin@example.test");
    await page.getByLabel("密码", { exact: true }).fill("Test-password-2026!");
    await page.getByRole("button", { name: "欢迎回来", exact: true }).click();
    await expect(page).toHaveURL(/\/me$/);
    await page.goto("/");
    await page
      .getByLabel("测试主题", { exact: true })
      .fill("测试我的 C 语言水平");
    await page
      .getByRole("button", { name: "AI 生成测试", exact: true })
      .click();
    await expect(page).toHaveURL(/\/t\/test-/, { timeout: 60000 });
    slug = page.url().split("/t/")[1];
    const testData = await (await request.get(`/api/tests/${slug}`)).json();
    testId = testData.id;
    expect(testData.schema.questions.length).toBe(10);
    const serialized = JSON.stringify(testData);
    expect(serialized).not.toContain("correctAnswer");
    expect(serialized).not.toContain("scores");
    expect(serialized).not.toContain("fixture-private-api-key");
    const throttled = await post(page.request, "tests/generate", {
      topic: "再次测试我的 C 语言水平",
      count: 10,
      language: "zh-CN",
      mode: "auto",
    });
    expect(throttled.status()).toBe(429);
    await page.getByRole("button", { name: "公开发布", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "分享测试", exact: true }),
    ).toBeVisible();
    expect(
      (await request.get(`/api/og/${slug}`)).headers()["content-type"],
    ).toContain("image/png");
    await page.getByRole("button", { name: "开始测试", exact: true }).click();
    await expect(page.locator("fieldset")).toHaveCount(10);
    for (const field of await page.locator("fieldset").all())
      await field.getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: "提交答卷", exact: true }).click();
    await expect(page).toHaveURL(/\/result\//);
    resultId = page.url().split("/result/")[1];
    await expect(
      page.getByRole("heading", { name: "主动沟通型", exact: true }).first(),
    ).toBeVisible({ timeout: 60000 });
    await expect(page.getByText("正确率 100%", { exact: true })).toBeVisible();
    expect(await db.answer.count({ where: { sessionId: resultId } })).toBe(0);
    await page.screenshot({
      path: "docs/screenshots/result-desktop.png",
      fullPage: true,
    });
  });
  test("export PNG and create/revoke a public report", async ({
    page,
    request,
    browser,
  }) => {
    await login(request);
    await login(page.request);
    await page.goto(`/result/${resultId}`);
    await page
      .getByRole("heading", { name: "主动沟通型", exact: true })
      .first()
      .waitFor();
    await post(request, `tests/${slug}/unpublish`, {});
    await page.reload();
    await expect(
      page.getByRole("button", { name: "发布测试", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "复制分享", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "创建公开报告", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("测试分享链接")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "复制测试链接", exact: true }),
    ).toHaveCount(0);
    expect((await post(request, `tests/${slug}/share`, {})).status()).toBe(400);
    await expect(
      page.getByLabel("结果分享操作").getByRole("button"),
    ).toHaveText(["发布测试", "复制分享", "创建公开报告"]);
    await page.getByRole("button", { name: "发布测试", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "已发布测试", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "复制分享", exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel("测试分享链接")).toBeVisible();
    for (const label of ["核心特征", "主要优势", "值得留意", "探索建议"])
      await expect(
        page
          .locator(".share-card")
          .getByRole("heading", { name: label, exact: true }),
      ).toBeVisible();
    await expect
      .poll(() =>
        page.locator(".share-card").evaluate((node) => {
          const inner = node.querySelector(".share-card-content")!;
          return (
            inner.getBoundingClientRect().bottom <=
            node.getBoundingClientRect().bottom - 20
          );
        }),
      )
      .toBe(true);
    await expect(page.locator(".share-card .share-dimension")).toHaveCount(6);
    await expect(
      page
        .locator(".share-card")
        .getByText("第四条特征也应完整出现在分享图片中", { exact: true }),
    ).toBeVisible();
    await page
      .locator(".share-card")
      .screenshot({ path: "docs/screenshots/share-card-complete-preview.png" });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载 PNG", exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs("docs/screenshots/result-card.png");
    expect(await download.failure()).toBeNull();
    const png = PNG.sync.read(
      await readFile("docs/screenshots/result-card.png"),
    );
    expect(png.width).toBe(1080);
    expect(png.height).toBeGreaterThan(png.width);
    const decoded = jsQR(
      new Uint8ClampedArray(png.data),
      png.width,
      png.height,
    );
    expect(decoded?.data).toContain(`/t/${slug}?ref=`);
    expect(decoded?.data).not.toContain("/result/");
    await expect(page.getByLabel("图片比例")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page
          .locator(".card-preview")
          .evaluate((node) => node.scrollWidth <= node.clientWidth),
      )
      .toBe(true);
    expect(
      await page
        .locator(".share-card-content > p")
        .first()
        .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThanOrEqual(18);
    await page
      .locator(".share-card")
      .screenshot({ path: "docs/screenshots/result-card-mobile-preview.png" });
    const second = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载 PNG", exact: true }).click();
    await (await second).saveAs("docs/screenshots/result-card-mobile.png");
    const portrait = PNG.sync.read(
      await readFile("docs/screenshots/result-card-mobile.png"),
    );
    expect(portrait.width).toBe(1080);
    expect(portrait.height).toBeGreaterThan(portrait.width);
    expect(portrait.height).toBe(png.height);
    await page
      .getByRole("button", { name: "创建公开报告", exact: true })
      .click();
    await expect(page.getByLabel("公开结果链接")).toBeVisible();
    expect(
      await page.evaluate(() => {
        const test = document
          .querySelector('[aria-label="测试分享链接"]')!
          .getBoundingClientRect();
        const report = document
          .querySelector('[aria-label="公开结果链接"]')!
          .getBoundingClientRect();
        const picture = document
          .querySelector(".card-preview")!
          .getBoundingClientRect();
        return test.bottom <= report.top && report.bottom < picture.top;
      }),
    ).toBe(true);
    const url = await page.getByLabel("公开结果链接").inputValue();
    const stranger = await browser.newContext();
    const publicPage = await stranger.newPage();
    await publicPage.goto(url);
    await expect(
      publicPage
        .getByRole("heading", { name: "主动沟通型", exact: true })
        .first(),
    ).toBeVisible();
    await db.test.update({
      where: { id: testId },
      data: { visibility: "private" },
    });
    await publicPage.reload();
    await expect(
      publicPage.getByRole("heading", { name: "404", exact: true }),
    ).toBeVisible();
    await db.test.update({
      where: { id: testId },
      data: { visibility: "public" },
    });
    await publicPage.reload();
    await expect(
      publicPage
        .getByRole("heading", { name: "主动沟通型", exact: true })
        .first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "撤销分享", exact: true }).click();
    await expect(
      page.getByText("公开分享已撤销。", { exact: true }),
    ).toBeVisible();
    await publicPage.reload();
    await expect(
      publicPage.getByRole("heading", { name: "404", exact: true }),
    ).toBeVisible();
    await stranger.close();
  });
  test("typology reports show AI labels without grades; interior pages can go back", async ({
    page,
    browser,
  }) => {
    // The first generation verifies the production 1/minute limit above.
    // Raise only the isolated fixture's quota for the remaining queue scenarios.
    const site = await db.systemSetting.findUniqueOrThrow({
      where: { key: "site" },
    });
    await db.systemSetting.update({
      where: { key: "site" },
      data: {
        value: {
          ...(site.value as Record<string, unknown>),
          generationPerMinute: 100,
        },
      },
    });
    await login(page.request);
    await page.goto("/");
    await page
      .getByLabel("测试主题", { exact: true })
      .fill("探索我的沟通风格偏好");
    await page
      .getByRole("button", { name: "AI 生成测试", exact: true })
      .click();
    await expect(page).toHaveURL(/\/t\//, { timeout: 60000 });
    const target = page.url();
    await page.getByRole("button", { name: "开始测试", exact: true }).click();
    await expect(page.locator("fieldset")).toHaveCount(10);
    for (const field of await page.locator("fieldset").all())
      await field.getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: "提交答卷", exact: true }).click();
    await expect(page).toHaveURL(/\/result\//);
    await expect(
      page
        .locator(".report-top")
        .getByRole("heading", { name: "主动表达与协作偏好型", exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await expect(page.locator(".report-top .report-score")).toHaveCount(0);
    await expect(page.locator(".report-dimensions .bar")).toHaveCount(0);
    await expect(page.locator(".report-dimensions strong")).toHaveCount(6);
    await expect(page.locator(".report-dimensions")).not.toContainText("/ 100");
    await page.getByRole("button", { name: "发布测试", exact: true }).click();
    await expect(page.locator(".share-card .share-dimension")).toHaveCount(6);
    await expect(page.locator(".share-card .share-total-score")).toHaveCount(0);
    await expect(page.locator(".share-card .bar")).toHaveCount(0);
    await expect(page.locator(".share-card")).toContainText("偏好面对面交流");
    await page.screenshot({
      path: "docs/screenshots/typology-result.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(page).toHaveURL(target);
    const direct = await browser.newPage();
    await direct.goto("/login");
    await direct.getByRole("button", { name: "返回", exact: true }).click();
    await expect(direct).toHaveURL(base + "/");
    await direct.close();
  });
  test("second user reuses test without generation and cannot see private result", async ({
    browser,
    request,
  }) => {
    const before = await (await fetch("http://127.0.0.1:5100/stats")).json();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto(`/t/${slug}`);
    await expect(
      page.getByRole("heading", { name: "C 语言基础测试", exact: true }),
    ).toBeVisible();
    const after = await (await fetch("http://127.0.0.1:5100/stats")).json();
    expect(after.generationCalls).toBe(before.generationCalls);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "docs/screenshots/test-mobile.png",
      fullPage: true,
    });
    await page.goto(`/result/${resultId}`);
    await expect(
      page.getByRole("heading", { name: "403", exact: true }),
    ).toBeVisible();
    await context.close();
    const noCsrf = await request.post("/api/tests/generate", {
      data: { topic: "主题", count: 10 },
      headers: { Origin: base },
    });
    expect(noCsrf.status()).toBe(403);
  });
  test("editing creates immutable version while old report stays at V1", async ({
    request,
    page,
  }) => {
    await login(request);
    await login(page.request);
    const edit = await (await request.get(`/api/tests/${slug}/edit`)).json();
    const schema = edit.schema;
    schema.title = "C 语言基础测试 · 第二版";
    expect((await post(request, `tests/${slug}/edit`, { schema })).ok()).toBe(
      true,
    );
    const current = await (await request.get(`/api/tests/${slug}`)).json();
    expect(current.version).toBe(2);
    await page.goto(`/result/${resultId}`);
    await expect(page.getByText("你的测试报告 · V1")).toBeVisible();
  });
  test("admin controls providers/prompts/ads and non-admin is rejected", async ({
    page,
    request,
    playwright,
  }) => {
    await login(request);
    await login(page.request);
    const providers = await (await request.get("/api/admin/ai")).json();
    expect(providers.items[0].apiKey).toContain("****");
    expect(JSON.stringify(providers)).not.toContain("fixture-private-api-key");
    expect(providers.items[0].encryptedKey).toBeUndefined();
    expect(
      (
        await post(request, "admin/prompts/save", {
          kind: "share",
          content: "Write an accurate concise sharing summary.",
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post(request, "admin/ads/save", {
          enabled: true,
          code: "<div>测试广告</div>",
          pages: ["home", "test", "result", "other"],
          label: "广告 / Advertisement",
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/admin");
    await expect(page.getByText("总用户数", { exact: true })).toBeVisible();
    await page.goto("/");
    await expect(page.getByTitle("广告 / Advertisement")).toBeVisible();
    await expect(
      page.frameLocator("iframe").getByText("测试广告", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "docs/screenshots/home-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: /知识补给站/ }).click();
    await expect(page.getByLabel("测试主题", { exact: true })).toHaveValue(
      "测试我的 C 语言水平",
    );
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/", `/result/${resultId}`, "/admin"]) {
        await page.goto(route);
        await expect(page.locator(".header")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.screenshot({
      path: "docs/screenshots/home-mobile.png",
      fullPage: true,
    });
    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({
      path: "docs/screenshots/home-dark-mobile.png",
      fullPage: true,
    });
    await page.goto(`/result/${resultId}`);
    await page.screenshot({
      path: "docs/screenshots/result-dark-mobile.png",
      fullPage: true,
    });
    await page.evaluate(() => localStorage.setItem("theme", "system"));
    const user = await playwright.request.newContext({ baseURL: base });
    expect(
      (
        await post(user, "auth/register", {
          email: "user@example.test",
          username: "普通用户",
          password: "Test-password-2026!",
        })
      ).ok(),
    ).toBe(true);
    expect((await user.get("/api/admin/users")).status()).toBe(403);
    await user.dispose();
    const testList = await (await request.get("/api/admin/tests")).json();
    expect(testList.items.some((t: { id: string }) => t.id === testId)).toBe(
      true,
    );
    expect((await request.get("/api/admin/logs")).ok()).toBe(true);
  });
  test("queue repairs invalid output once and persists no damaged tests", async ({
    request,
  }) => {
    await login(request);
    const control = async (n: number) =>
      fetch("http://127.0.0.1:5100/control", {
        method: "POST",
        body: JSON.stringify({ malformedRemaining: n }),
      });
    const counter = async () =>
      (await (await fetch("http://127.0.0.1:5100/stats")).json())
        .generationCalls;
    const generate = async () => {
      const response = await post(request, "tests/generate", {
        topic: "测试沟通风格",
        count: 10,
        language: "zh-CN",
        mode: "auto",
      });
      expect(response.ok()).toBe(true);
      return (await response.json()).jobId;
    };
    await control(1);
    const before = await counter();
    const repaired = await generate();
    await expect
      .poll(
        async () =>
          (await (await request.get(`/api/tests/jobs/${repaired}`)).json())
            .status,
        { timeout: 30000 },
      )
      .toBe("completed");
    expect((await counter()) - before).toBe(2);
    await control(2);
    const testCount = await db.test.count();
    const beforeFailure = await counter();
    const failed = await generate();
    await expect
      .poll(
        async () =>
          (await (await request.get(`/api/tests/jobs/${failed}`)).json())
            .status,
        { timeout: 30000 },
      )
      .toBe("failed");
    expect((await counter()) - beforeFailure).toBe(2);
    expect(await db.test.count()).toBe(testCount);
  });
  test("failed analysis can be queued again and completes", async ({
    request,
  }) => {
    await login(request);
    const control = async (n: number) =>
      fetch("http://127.0.0.1:5100/control", {
        method: "POST",
        body: JSON.stringify({ analysisMalformedRemaining: n }),
      });
    const analysisCalls = async () =>
      (await (await fetch("http://127.0.0.1:5100/stats")).json())
        .analysisCalls as number;
    const testData = await (await request.get(`/api/tests/${slug}`)).json();
    const answers = Object.fromEntries(
      testData.schema.questions.map(
        (question: { id: string; options: { id: string }[] }) => [
          question.id,
          question.options[1].id,
        ],
      ),
    );
    const start = await post(request, `tests/${slug}/start`, {});
    expect(start.ok()).toBe(true);
    const { sessionId } = await start.json();
    await control(2);
    const before = await analysisCalls();
    const submit = await post(request, `tests/${slug}/submit`, {
      sessionId,
      answers,
    });
    expect(submit.ok()).toBe(true);
    await expect
      .poll(
        async () =>
          (await (await request.get(`/api/tests/jobs/${sessionId}`)).json())
            .status,
        { timeout: 30000 },
      )
      .toBe("failed");
    expect((await analysisCalls()) - before).toBe(2);
    await control(0);
    const retry = await post(request, `tests/sessions/${sessionId}/retry`, {});
    expect(retry.ok()).toBe(true);
    await expect
      .poll(
        async () =>
          (await (await request.get(`/api/tests/jobs/${sessionId}`)).json())
            .status,
        { timeout: 30000 },
      )
      .toBe("completed");
    const result = await db.testSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { analysis: true },
    });
    expect(result.status).toBe("completed");
    expect(result.analysis).not.toBeNull();
  });
  test("sensitive shares need confirmation; deleting record revokes data", async ({
    request,
  }) => {
    await login(request);
    const original = await (
      await request.get(`/api/tests/${slug}/edit`)
    ).json();
    original.schema.sensitivity = "sensitive";
    expect(
      (
        await post(request, `tests/${slug}/edit`, { schema: original.schema })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post(request, `tests/sessions/${resultId}/share`, {
          confirmed: false,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(request, `tests/sessions/${resultId}/share`, {
          confirmed: true,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (await post(request, `tests/sessions/${resultId}/delete`, {})).ok(),
    ).toBe(true);
    const history = await (await request.get("/api/me/tests")).json();
    expect(history.items.some((r: { id: string }) => r.id === resultId)).toBe(
      false,
    );
  });
});
