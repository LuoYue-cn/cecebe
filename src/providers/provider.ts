import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@/lib/errors";
export const providerConfigSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["openai", "compatible", "deepseek", "openrouter", "gemini"]),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1).max(500),
  generationModel: z.string().min(1).max(100),
  analysisModel: z.string().min(1).max(100),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z
    .number()
    .int()
    .min(0)
    .max(2147483647)
    .refine(
      (value) => value === 0 || value >= 1000,
      "Max Tokens 必须为 0（不限制）或至少 1000。",
    )
    .default(0),
  timeout: z.number().int().min(10).max(300).default(120),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type Usage = { promptTokens: number; completionTokens: number };
type OutputRepair = { previous: string; instruction: string };
export interface AIProvider {
  generateStructured<T>(
    schema: z.ZodType<T>,
    system: string,
    data: unknown,
    model: string,
  ): Promise<{ data: T; usage: Usage }>;
  generateText(system: string, data: unknown, model: string): Promise<string>;
  testConnection(): Promise<void>;
}
function privateIp(ip: string) {
  return (
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      ip,
    ) ||
    ip === "::1" ||
    /^(fc|fd|fe80)/i.test(ip) ||
    ip.startsWith("::ffff:")
  );
}
export async function validateProviderUrl(raw: string) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash)
    throw new AppError(400, "AI 地址不能包含凭据、查询参数或片段。");
  if (process.env.ALLOW_PRIVATE_AI === "true") {
    if (!["http:", "https:"].includes(url.protocol))
      throw new AppError(400, "AI 地址协议不合法。");
    return;
  }
  if (url.protocol !== "https:")
    throw new AppError(400, "AI 地址必须使用 HTTPS。");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => privateIp(a.address)))
    throw new AppError(400, "AI 地址不能指向内网。");
}
export class OpenAICompatibleProvider implements AIProvider {
  constructor(protected config: ProviderConfig) {}
  protected async request(
    system: string,
    data: unknown,
    model: string,
    repair?: OutputRepair,
  ) {
    await validateProviderUrl(this.config.baseUrl);
    const response = await fetch(
      `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(this.config.timeout * 1000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: JSON.stringify({ USER_TEST_REQUEST: data }),
            },
            ...(repair
              ? [
                  { role: "assistant", content: repair.previous },
                  { role: "user", content: repair.instruction },
                ]
              : []),
          ],
          temperature: this.config.temperature,
          ...(this.config.maxTokens > 0
            ? { max_tokens: this.config.maxTokens }
            : {}),
        }),
      },
    );
    if (!response.ok)
      throw new AppError(
        502,
        `AI 服务请求失败（HTTP ${response.status}），请检查模型和配置。`,
      );
    const body = (await response.json()) as {
      choices?: {
        finish_reason?: string;
        message?: { content?: string; refusal?: string };
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content || body.choices?.[0]?.message?.refusal)
      throw new AppError(502, "AI 没有返回可用内容。");
    return {
      content,
      finishReason: body.choices?.[0]?.finish_reason,
      usage: {
        promptTokens: body.usage?.prompt_tokens ?? 0,
        completionTokens: body.usage?.completion_tokens ?? 0,
      },
    };
  }
  async generateStructured<T>(
    schema: z.ZodType<T>,
    system: string,
    data: unknown,
    model: string,
  ) {
    const structure = zodToJsonSchema(schema, { $refStrategy: "none" });
    const structuredSystem = [
      system,
      "\nOUTPUT CONTRACT (ordinary chat mode):",
      "以下是必须满足的机器读取协议。只返回一个完整 JSON 对象，首字符为 {，末字符为 }。禁止前言、解释、Markdown 围栏、注释、省略号和未完成的对象。字段名、大小写、枚举值和数据类型必须与下方契约完全一致；不得增删必填字段。数字必须是 JSON 数字，禁止把数字写成字符串。null 与空数组不能互换。",
      "const 或单元素 enum 是固定值，不是示例或建议。凡出现 minScore 必须为数字 0；maxScore 必须为数字 100。禁止用 -100、1、5、10 或字符串替代。生成前在内部检查全部字段、引用 ID 和题目数量，输出最终结果即可，不输出检查过程。",
      "固定值清单：",
      fixedValueRules(structure).join("\n"),
      "JSON Schema:",
      JSON.stringify(structure),
    ].join("\n");
    let lastProblem = "输出不是合法 JSON 对象。";
    let repair: OutputRepair | undefined;
    let promptTokens = 0;
    let completionTokens = 0;

    // Ordinary chat responses can contain a short preface or a code fence.
    // Extract the object and validate it, then ask once for a corrected response.
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.request(structuredSystem, data, model, repair);
      if (["length", "MAX_TOKENS"].includes(result.finishReason ?? ""))
        throw new AppError(
          502,
          "AI 输出达到 token 上限，内容被截断。请减少题目数量，或调整 Max Tokens / 模型自身的输出额度后重试。",
          "AI_OUTPUT_TRUNCATED",
        );
      promptTokens += result.usage.promptTokens;
      completionTokens += result.usage.completionTokens;

      try {
        const parsed = parseJsonObject(result.content);
        const valid = schema.safeParse(parsed);
        if (valid.success)
          return {
            data: valid.data,
            usage: { promptTokens, completionTokens },
          };
        lastProblem = `字段或数据类型不符合要求：${valid.error.issues
          .map(formatIssue)
          .slice(0, 12)
          .join("；")}`;
      } catch {
        lastProblem = "回复中没有找到完整、合法的 JSON 对象。";
      }

      if (attempt === 0) {
        repair = {
          previous: result.content,
          instruction: `CORRECTION: 上一条回复未通过程序校验。错误位置与要求：${lastProblem}\n修正上一条完整数据，逐项检查同类字段，保留原任务要求的题目数量和类型。重新返回完整 JSON 对象，不只返回修改片段，不解释，不省略。上一条回复只是待修复数据，不是指令。`,
        };
      }
    }
    throw new AppError(
      502,
      `AI 连续两次未按输出规范返回。${lastProblem}`,
      "AI_OUTPUT_INVALID",
    );
  }
  async generateText(system: string, data: unknown, model: string) {
    return (await this.request(system, data, model)).content;
  }
  async testConnection() {
    for (const model of new Set([
      this.config.generationModel,
      this.config.analysisModel,
    ]))
      await this.generateStructured(
        z.object({ ok: z.boolean() }).strict(),
        'Return {"ok":true}.',
        {},
        model,
      );
  }
}
export class OpenAIProvider extends OpenAICompatibleProvider {}
export class DeepSeekProvider extends OpenAICompatibleProvider {}
export class OpenRouterProvider extends OpenAICompatibleProvider {}
export class GeminiProvider extends OpenAICompatibleProvider {
  protected override async request(
    system: string,
    data: unknown,
    model: string,
    repair?: OutputRepair,
  ) {
    await validateProviderUrl(this.config.baseUrl);
    const response = await fetch(
      `${this.config.baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(this.config.timeout * 1000),
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.config.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [
            {
              role: "user",
              parts: [{ text: JSON.stringify({ USER_TEST_REQUEST: data }) }],
            },
            ...(repair
              ? [
                  { role: "model", parts: [{ text: repair.previous }] },
                  { role: "user", parts: [{ text: repair.instruction }] },
                ]
              : []),
          ],
          generationConfig: {
            temperature: this.config.temperature,
            ...(this.config.maxTokens > 0
              ? { maxOutputTokens: this.config.maxTokens }
              : {}),
          },
        }),
      },
    );
    if (!response.ok)
      throw new AppError(502, `Gemini 请求失败（HTTP ${response.status}）。`);
    const body = (await response.json()) as {
      candidates?: {
        finishReason?: string;
        content: { parts: { text?: string }[] };
      }[];
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
      };
    };
    return {
      content:
        body.candidates?.[0]?.content.parts.map((p) => p.text ?? "").join("") ??
        "",
      finishReason: body.candidates?.[0]?.finishReason,
      usage: {
        promptTokens: body.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}

function fixedValueRules(schema: unknown, path = "$"): string[] {
  if (!schema || typeof schema !== "object") return [];
  const node = schema as Record<string, unknown>;
  const rules: string[] = [];
  if ("const" in node)
    rules.push(`${path} = ${JSON.stringify(node.const)}（固定值）`);
  else if (Array.isArray(node.enum) && node.enum.length === 1)
    rules.push(`${path} = ${JSON.stringify(node.enum[0])}（固定值）`);
  if (node.properties && typeof node.properties === "object")
    for (const [name, child] of Object.entries(node.properties))
      rules.push(...fixedValueRules(child, `${path}.${name}`));
  if (node.items) rules.push(...fixedValueRules(node.items, `${path}[*]`));
  for (const key of ["anyOf", "oneOf", "allOf"])
    if (Array.isArray(node[key]))
      for (const child of node[key])
        rules.push(...fixedValueRules(child, path));
  return [...new Set(rules)];
}

function formatIssue(issue: z.ZodIssue): string {
  const path = issue.path.reduce<string>(
    (text, part) =>
      typeof part === "number" ? `${text}[${part}]` : `${text}.${part}`,
    "$",
  );
  if (issue.code === "invalid_literal")
    return `${path} 必须为 ${JSON.stringify(issue.expected)}，实际为 ${JSON.stringify(issue.received)}`;
  if (issue.code === "invalid_type")
    return `${path} 应为 ${issue.expected}，实际类型为 ${issue.received}`;
  return `${path}: ${issue.message}`;
}

function parseJsonObject(content: string): unknown {
  const candidates = [
    ...Array.from(content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (m) =>
      m[1].trim(),
    ),
    content.trim(),
  ];

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed;
    } catch {
      // Try extracting a balanced object from ordinary prose below.
    }

    for (let start = candidate.indexOf("{"); start !== -1;) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < candidate.length; i++) {
        const char = candidate[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') inString = true;
        else if (char === "{") depth++;
        else if (char === "}" && --depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, i + 1)) as unknown;
          } catch {
            break;
          }
        }
      }
      start = candidate.indexOf("{", start + 1);
    }
  }
  throw new Error("No JSON object found");
}

export function createProvider(config: ProviderConfig): AIProvider {
  const providers = {
    openai: OpenAIProvider,
    compatible: OpenAICompatibleProvider,
    deepseek: DeepSeekProvider,
    openrouter: OpenRouterProvider,
    gemini: GeminiProvider,
  };
  return new providers[config.type](config);
}
