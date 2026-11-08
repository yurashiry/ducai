import { eq } from "drizzle-orm";
import { db } from "@/db";
import { verifiedLogins } from "@/db/schema";
import { err } from "@/lib/auth";
import { VERIFIED_LOGINS } from "@/lib/config";

export const dynamic = "force-dynamic";

// Админ-доступ по секрету ADMIN_TOKEN (переменная окружения бэкенда)
function checkAdmin(req: Request): Response | null {
  const secret = process.env.ADMIN_TOKEN;
  if (!secret)
    return err("На сервере не задан ADMIN_TOKEN (переменная окружения).", 503);
  if (req.headers.get("x-admin-token") !== secret)
    return err("Неверный админ-токен", 401);
  return null;
}

function cleanLogin(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

export async function GET(req: Request) {
  const bad = checkAdmin(req);
  if (bad) return bad;
  const rows = await db.select().from(verifiedLogins);
  return Response.json({
    builtin: VERIFIED_LOGINS,
    logins: rows.map((r) => r.login),
  });
}

export async function POST(req: Request) {
  const bad = checkAdmin(req);
  if (bad) return bad;
  const body = await req.json().catch(() => ({}));
  const login = cleanLogin(body.login);
  if (!/^[a-z0-9_.-]{3,32}$/.test(login)) return err("Неверный логин");
  await db.insert(verifiedLogins).values({ login }).onConflictDoNothing();
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const bad = checkAdmin(req);
  if (bad) return bad;
  const body = await req.json().catch(() => ({}));
  const login = cleanLogin(body.login);
  await db.delete(verifiedLogins).where(eq(verifiedLogins.login, login));
  return Response.json({ ok: true });
}
