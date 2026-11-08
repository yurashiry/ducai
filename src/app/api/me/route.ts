import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { err, getAuthUser, publicUser } from "@/lib/auth";
import { ALL_THEMES, FREE_THEMES } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getAuthUser(req);
  if (!u) return err("Не авторизован", 401);
  return Response.json(await publicUser(u));
}

export async function PATCH(req: Request) {
  const u = await getAuthUser(req);
  if (!u) return err("Не авторизован", 401);
  let body: { theme?: string };
  try {
    body = await req.json();
  } catch {
    return err("Неверный запрос");
  }
  const theme = String(body.theme ?? "");
  if (!ALL_THEMES.includes(theme)) return err("Неизвестная тема");
  if (!u.verified && !FREE_THEMES.includes(theme))
    return err("Эта тема доступна только с синей галочкой", 403);
  await db.update(users).set({ theme }).where(eq(users.id, u.id));
  return Response.json(await publicUser({ ...u, theme }));
}
