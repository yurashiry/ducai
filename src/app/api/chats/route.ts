import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { chats, usage } from "@/db/schema";
import { err, getAuthUser, getUsage, today } from "@/lib/auth";
import { FREE_CHATS_PER_DAY } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getAuthUser(req);
  if (!u) return err("Не авторизован", 401);
  const rows = await db
    .select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt })
    .from(chats)
    .where(eq(chats.userId, u.id))
    .orderBy(desc(chats.updatedAt));
  return Response.json({ chats: rows });
}

// Создание нового чата (учитывается в дневном лимите)
export async function POST(req: Request) {
  const u = await getAuthUser(req);
  if (!u) return err("Не авторизован", 401);

  if (!u.verified) {
    const used = await getUsage(u.id);
    if (used.chats >= FREE_CHATS_PER_DAY)
      return err(
        `Лимит: ${FREE_CHATS_PER_DAY} новых чата в день. Получите синюю галочку для безлимита.`,
        403
      );
  }

  const [chat] = await db
    .insert(chats)
    .values({ userId: u.id })
    .returning({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt });

  await db
    .insert(usage)
    .values({ userId: u.id, day: today(), chats: 1, images: 0 })
    .onConflictDoUpdate({
      target: [usage.userId, usage.day],
      set: { chats: sql`${usage.chats} + 1` },
    });

  return Response.json({ chat });
}
