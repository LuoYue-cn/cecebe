import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { settings } from "@/lib/settings";
import { db } from "@/lib/db";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const test = await db.test.findUnique({ where: { slug } });
  if (
    !test ||
    test.deletedAt ||
    test.status !== "published" ||
    test.visibility !== "public"
  )
    return new Response(null, { status: 404 });
  const config = await settings();
  const font = await readFile("public/fonts/cecebe-cjk.ttf");
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "#faf7ef",
        color: "#342d42",
        fontFamily: "CecebeCJK",
      }}
    >
      <div
        style={{ fontSize: 32, color: config.primaryColor, marginBottom: 40 }}
      >
        {config.siteName}
      </div>
      <div style={{ fontSize: 60, lineHeight: 1.3 }}>{test.title}</div>
      <div style={{ fontSize: 25, marginTop: 30 }}>
        探索你的好奇 · 扫码或打开链接开始测试
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "CecebeCJK",
          data: font.buffer.slice(
            font.byteOffset,
            font.byteOffset + font.byteLength,
          ) as ArrayBuffer,
          weight: 400,
          style: "normal",
        },
      ],
    },
  );
}
