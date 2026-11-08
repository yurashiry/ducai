import crypto from "node:crypto";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { err, hashPassword, newToken, sha256 } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { login?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return err("Неверный запрос");
  }
  const login = String(body.login ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!login || !password) return err("Введите логин и пароль");

  const rows = await db.select().from(users).where(eq(users.login, login)).limit(1);
  const u = rows[0];
  if (!u) return err("Неверный логин или пароль", 401);

  const a = Buffer.from(hashPassword(password, u.salt), "hex");
  const b = Buffer.from(u.passwordHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return err("Неверный логин или пароль", 401);

  const token = newToken();
  await db.insert(sessions).values({ tokenHash: sha256(token), userId: u.id });
  return Response.json({ token });
}
