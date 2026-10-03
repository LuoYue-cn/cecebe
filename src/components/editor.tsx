"use client";
import { useState } from "react";
import type { TestSchema } from "@/schemas/test";
import { api } from "./context";
import { Field, Feedback } from "./forms";
export function Editor({
  slug,
  initial,
  cover = "",
  visibility = "private",
}: {
  slug: string;
  initial: TestSchema;
  cover?: string;
  visibility?: string;
}) {
  const [schema, setSchema] = useState(initial);
  const [image, setImage] = useState(cover);
  const [publicState, setPublicState] = useState(visibility);
  const [raw, setRaw] = useState(JSON.stringify(initial, null, 2));
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`tests/${slug}/edit`, {
        schema: advanced ? JSON.parse(raw) : schema,
        cover: image,
        visibility: publicState,
      });
      location.href = `/t/${slug}`;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container narrow">
      <div className="page-title">
        <h1>编辑测试</h1>
        <p>每次保存创建新版本，已经完成的结果始终关联原版本。</p>
      </div>
      <form className="card" onSubmit={save}>
        <Field
          name="title"
          label="测试名称"
          value={schema.title}
          onChange={(v) => setSchema({ ...schema, title: v })}
          required
        />
        <div className="field">
          <label htmlFor="description">描述</label>
          <textarea
            id="description"
            value={schema.description}
            onChange={(e) =>
              setSchema({ ...schema, description: e.target.value })
            }
            required
          />
        </div>
        <Field
          name="cover"
          label="封面地址（可选）"
          value={image}
          onChange={setImage}
        />
        <div className="field">
          <label htmlFor="visibility">公开状态</label>
          <select
            id="visibility"
            value={publicState}
            onChange={(e) => setPublicState(e.target.value)}
          >
            <option value="private">私密</option>
            <option value="public">公开（发布后生效）</option>
          </select>
        </div>
        <div className="row between">
          <h2>题目与选项</h2>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setAdvanced(!advanced);
              setRaw(JSON.stringify(schema, null, 2));
            }}
          >
            切换{advanced ? "表单" : "完整 Schema"}编辑
          </button>
        </div>
        {advanced ? (
          <div className="field">
            <label htmlFor="schema-json">
              评分规则 / 维度 / 一致性关系 JSON
            </label>
            <textarea
              id="schema-json"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              style={{ minHeight: 500, fontFamily: "monospace", fontSize: 14 }}
              spellCheck={false}
            />
          </div>
        ) : (
          schema.questions.map((q, index) => (
            <section className="editor-question" key={q.id}>
              <Field
                name={`q-${q.id}`}
                label={`${index + 1}. ${q.type}`}
                value={q.text}
                onChange={(v) =>
                  setSchema({
                    ...schema,
                    questions: schema.questions.map((item, i) =>
                      i === index ? { ...item, text: v } : item,
                    ),
                  })
                }
              />
              {q.options.map((o, oi) => (
                <Field
                  key={o.id}
                  name={`${q.id}-${o.id}`}
                  label={`选项 ${o.id}`}
                  value={o.text}
                  onChange={(v) =>
                    setSchema({
                      ...schema,
                      questions: schema.questions.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              options: item.options.map((option, j) =>
                                j === oi ? { ...option, text: v } : option,
                              ),
                            }
                          : item,
                      ),
                    })
                  }
                />
              ))}
            </section>
          ))
        )}
        <Feedback error={error} />
        <button className="button" disabled={busy}>
          {busy ? "正在保存新版本…" : "保存新版本"}
        </button>
      </form>
    </div>
  );
}
