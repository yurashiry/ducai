import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { err, hashPassword, newSalt, newToken, sha256 } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { login?: string; password?: string; password2?: string };
  try {
    body = await req.json();
  } catch {
    return err("Неверный запрос");
  }
  const login = String(body.login ?? "").trim();
  const password = String(body.password ?? "");
  const password2 = String(body.password2 ?? "");

  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(login))
    return err("Логин: 3–32 символа, только латиница, цифры, _ . -");
  if (password.length < 6) return err("Пароль должен быть не короче 6 символов");
  if (password.length > 200) return err("Слишком длинный пароль");
  if (password !== password2) return err("Пароли не совпадают");

  const lower = login.toLowerCase();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.login, lower))
    .limit(1);
  if (existing.length) return err("Такой логин уже занят", 409);

  const salt = newSalt();
  const [user] = await db
    .insert(users)
    .values({
      login: lower,
      displayLogin: login,
      salt,
      passwordHash: hashPassword(password, salt),
    })
    .returning({ id: users.id });

  const token = newToken();
  await db.insert(sessions).values({ tokenHash: sha256(token), userId: user.id });
  return Response.json({ token });
}
