import { z } from "zod";
import { db } from "@/lib/db";
import { csrf } from "@/security/auth";
import { rateLimit } from "@/security/rate-limit";
export async function POST(req: Request) {
  try {
    const actor = await csrf(req);
    const { code } = z
      .object({ code: z.string().min(20).max(100) })
      .parse(await req.json());
    await rateLimit(`ref:${actor.id}:${code}`, 1, 60);
    await db.share.updateMany({
      where: { shareCode: code, revokedAt: null },
      data: { clickCount: { increment: 1 } },
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
}
