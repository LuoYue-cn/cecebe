import { readFile } from "node:fs/promises";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (!/^[\w-]+\.(png|jpg|webp)$/.test(file))
    return new Response(null, { status: 404 });
  try {
    const bytes = await readFile(`public/uploads/${file}`);
    return new Response(bytes, {
      headers: {
        "Content-Type": file.endsWith(".png")
          ? "image/png"
          : file.endsWith(".jpg")
            ? "image/jpeg"
            : "image/webp",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public,max-age=86400",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
