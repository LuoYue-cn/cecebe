// Test-only deterministic fixture server. Never imported by application source.
import { createServer } from "node:http";
import { fixture, analysis } from "./fixtures";
let generationCalls = 0;
let calls = 0;
let malformedRemaining = 0;
let analysisMalformedRemaining = 0;
let analysisCalls = 0;
const server = createServer(async (req, res) => {
  if (req.url === "/stats") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ calls, generationCalls, analysisCalls }));
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.url === "/control") {
    malformedRemaining = Math.max(
      0,
      Math.min(2, JSON.parse(body).malformedRemaining ?? 0),
    );
    analysisMalformedRemaining = Math.max(
      0,
      Math.min(2, JSON.parse(body).analysisMalformedRemaining ?? 0),
    );
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  try {
    calls++;
    const request = JSON.parse(body);
    const schema =
      request.response_format?.json_schema?.schema ??
      JSON.parse(request.messages[0].content.split("JSON Schema:\n").at(-1));
    const props = schema?.properties ?? {};
    const user = JSON.parse(request.messages[1].content).USER_TEST_REQUEST;
    let value: unknown = { ok: true };
    if (props.allowed)
      value = { allowed: true, reason: "合理测试", sensitivity: "normal" };
    else if (props.questions) {
      generationCalls++;
      const canonical = fixture(user.type, user.count);
      canonical.dimensions = Array.from({ length: 6 }, (_, index) => ({
        ...canonical.dimensions[0],
        id: `dimension_${index + 1}`,
        name: `回归维度${index + 1}`,
      }));
      canonical.questions.forEach((question, index) => {
        question.dimensionId = canonical.dimensions[index % 6].id;
        question.options.forEach((option) => {
          option.scores = Object.fromEntries(
            canonical.dimensions.map((dimension) => [
              dimension.id,
              option.id === "a" ? -2 : 2,
            ]),
          );
        });
      });
      value = {
        ...canonical,
        questions: canonical.questions.map((q) => ({
          ...q,
          options: q.options.map((o) => ({
            ...o,
            scores: Object.entries(o.scores).map(([dimensionId, score]) => ({
              dimensionId,
              score,
            })),
          })),
        })),
      };
      if (malformedRemaining > 0) {
        malformedRemaining--;
        value = { questions: null };
      }
    } else if (props.summary) {
      analysisCalls++;
      value = {
        ...analysis,
        ...(user.resultMode === "typology"
          ? {
              resultLabel: "主动表达与协作偏好型",
              dimensionInsights: user.dimensions.map(
                (dimension: { id: string }, index: number) => ({
                  dimensionId: dimension.id,
                  label: [
                    "偏好面对面交流",
                    "倾向轻松互动",
                    "偏好共同探索",
                    "倾向及时表达",
                    "偏好协作交流",
                    "倾向主动倾听",
                  ][index % 6],
                  description: "本次选择呈现出主动交流的偏好，不代表能力高低。",
                }),
              ),
            }
          : { dimensionInsights: [] }),
        traits: [
          ...analysis.traits,
          "第三条完整特征",
          "第四条特征也应完整出现在分享图片中",
        ],
        summary:
          analysis.summary +
          "这是一段用于检查长内容导出完整性的说明。".repeat(8),
      };
      if (analysisMalformedRemaining > 0) {
        analysisMalformedRemaining--;
        value = { summary: null };
      }
    } else if (props.type)
      value = {
        type: /C 语言|C语言|knowledge/.test(user.topic)
          ? "knowledge"
          : "personality",
        sensitivity: "normal",
      };
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(value) } }],
        usage: { prompt_tokens: 100, completion_tokens: 200 },
      }),
    );
  } catch {
    res.writeHead(400);
    res.end("{}");
  }
});
server.listen(5100, "127.0.0.1", () =>
  console.log("Test fixture AI server listening on 5100"),
);
process.on("SIGTERM", () => server.close());
