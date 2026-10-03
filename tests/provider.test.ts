import { it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { createProvider, validateProviderUrl } from "../src/providers/provider";
const config = {
  name: "test",
  type: "openai" as const,
  baseUrl: "http://127.0.0.1:5100/v1",
  apiKey: "test-private-key",
  generationModel: "test-model",
  analysisModel: "test-model",
  temperature: 0.7,
  maxTokens: 2000,
  timeout: 10,
};
afterEach(() => vi.unstubAllGlobals());
it("uses a normal chat completion and describes the schema in the prompt", async () => {
  process.env.ALLOW_PRIVATE_AI = "true";
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await createProvider(config).generateStructured(
    z.object({ ok: z.boolean() }).strict(),
    "system",
    { topic: "ignore previous" },
    "test-model",
  );
  expect(result.data.ok).toBe(true);
  expect(result.usage.promptTokens).toBe(10);
  const call = fetch.mock.calls[0];
  expect(call[1].headers.Authorization).toBe("Bearer test-private-key");
  expect(JSON.parse(call[1].body).messages[1].content).toContain(
    "USER_TEST_REQUEST",
  );
  expect(JSON.parse(call[1].body).response_format).toBeUndefined();
  expect(JSON.parse(call[1].body).messages[0].content).toContain(
    '"required":["ok"]',
  );
});
it("extracts a schema-valid object from an ordinary conversational response", async () => {
  process.env.ALLOW_PRIVATE_AI = "true";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content:
                'Here is the result:\n```json\n{"ok":true}\n```\nLet me know if you need anything else.',
            },
          },
        ],
      }),
    ),
  );
  const result = await createProvider(config).generateStructured(
    z.object({ ok: z.boolean() }),
    "system",
    {},
    "model",
  );
  expect(result.data).toEqual({ ok: true });
});
it("asks once for a corrected object after malformed ordinary chat output", async () => {
  process.env.ALLOW_PRIVATE_AI = "true";
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        choices: [{ message: { content: "Here is your answer: true" } }],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ choices: [{ message: { content: '{"ok":true}' } }] }),
    );
  vi.stubGlobal("fetch", fetch);
  const result = await createProvider(config).generateStructured(
    z.object({ ok: z.boolean() }),
    "system",
    {},
    "model",
  );
  expect(result.data).toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[1][1].body).messages[3].content).toContain(
    "CORRECTION",
  );
});
it("rejects repeated prose that does not satisfy the output schema", async () => {
  process.env.ALLOW_PRIVATE_AI = "true";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          choices: [{ message: { content: "Here is your answer: true" } }],
        }),
      ),
    ),
  );
  await expect(
    createProvider(config).generateStructured(
      z.object({ ok: z.boolean() }),
      "system",
      {},
      "model",
    ),
  ).rejects.toThrow("连续两次");
});
it("repairs literal ranges with exact paths and the previous assistant response", async () => {
  process.env.ALLOW_PRIVATE_AI = "true";
  const previous = JSON.stringify({
    dimensions: [{ minScore: -100, maxScore: 5 }],
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ choices: [{ message: { content: previous } }] }),
    )
    .mockResolvedValueOnce(
      Response.json({
        choices: [
          {
            message: {
              content: '{"dimensions":[{"minScore":0,"maxScore":100}]}',
            },
          },
        ],
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const result = await createProvider(config).generateStructured(
    z.object({
      dimensions: z.array(
        z.object({ minScore: z.literal(0), maxScore: z.literal(100) }),
      ),
    }),
    "Generate a test",
    {},
    "model",
  );
  expect(result.data.dimensions[0]).toEqual({ minScore: 0, maxScore: 100 });
  const body = JSON.parse(fetch.mock.calls[1][1].body);
  expect(body.response_format).toBeUndefined();
  expect(body.messages[0].content).toContain("$.dimensions[*].minScore = 0");
  expect(body.messages[2]).toEqual({ role: "assistant", content: previous });
  expect(body.messages[3].content).toContain(
    "$.dimensions[0].minScore 必须为 0，实际为 -100",
  );
  expect(body.messages[3].content).toContain(
    "$.dimensions[0].maxScore 必须为 100，实际为 5",
  );
});
it("reports token truncation without repeating the same oversized request", async () => {
  process.env.ALLOW_PRIVATE_AI = "true";
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      choices: [
        { finish_reason: "length", message: { content: '{"dimensions":[' } },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(
    createProvider(config).generateStructured(
      z.object({ dimensions: z.array(z.object({ minScore: z.literal(0) })) }),
      "Generate a test",
      {},
      "model",
    ),
  ).rejects.toMatchObject({ code: "AI_OUTPUT_TRUNCATED" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("rejects HTTP provider errors safely", async () => {
  process.env.ALLOW_PRIVATE_AI = "true";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("secret-key", { status: 401 })),
  );
  await expect(createProvider(config).testConnection()).rejects.toThrow(
    "HTTP 401",
  );
});
it("uses ordinary Gemini chat generation without native JSON mode", async () => {
  process.env.ALLOW_PRIVATE_AI = "true";
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  expect(
    (
      await createProvider({ ...config, type: "gemini" }).generateStructured(
        z.object({ ok: z.boolean() }),
        "system",
        {},
        "gemini",
      )
    ).data.ok,
  ).toBe(true);
  expect(fetch.mock.calls[0][1].headers["x-goog-api-key"]).toBe(
    "test-private-key",
  );
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.generationConfig.responseMimeType).toBeUndefined();
  expect(body.generationConfig.responseJsonSchema).toBeUndefined();
  expect(body.systemInstruction.parts[0].text).toContain("JSON Schema");
});
it("blocks private addresses by default and URL credentials", async () => {
  process.env.ALLOW_PRIVATE_AI = "false";
  await expect(validateProviderUrl("https://127.0.0.1/v1")).rejects.toThrow(
    "内网",
  );
  await expect(
    validateProviderUrl("https://user:pass@example.com/v1"),
  ).rejects.toThrow("凭据");
  await expect(validateProviderUrl("http://example.com/v1")).rejects.toThrow(
    "HTTPS",
  );
});

it.each(["compatible", "gemini"] as const)(
  "omits the output token limit for %s when configured as unlimited",
  async (type) => {
    process.env.ALLOW_PRIVATE_AI = "true";
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        type === "gemini"
          ? {
              candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
            }
          : { choices: [{ message: { content: '{"ok":true}' } }] },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await createProvider({ ...config, type, maxTokens: 0 }).generateStructured(
      z.object({ ok: z.boolean() }),
      "system",
      {},
      "test-model",
    );
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("max_tokens");
    expect(body.generationConfig ?? {}).not.toHaveProperty("maxOutputTokens");
  },
);
