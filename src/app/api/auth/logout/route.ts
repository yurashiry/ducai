import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sha256 } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  return Response.json({ ok: true });
}
