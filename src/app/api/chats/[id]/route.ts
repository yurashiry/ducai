import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { chats, messages, usage } from "@/db/schema";
import { err, getAuthUser, today } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function ownChat(req: Request, ctx: Ctx) {
  const u = await getAuthUser(req);
  if (!u) return { error: err("Не авторизован", 401) };
  const { id } = await ctx.params;
  const chatId = Number(id);
  if (!Number.isInteger(chatId)) return { error: err("Чат не найден", 404) };
  const rows = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, u.id)))
    .limit(1);
  if (!rows[0]) return { error: err("Чат не найден", 404) };
  return { user: u, chat: rows[0] };
}

export async function GET(req: Request, ctx: Ctx) {
  const r = await ownChat(req, ctx);
  if (r.error) return r.error;
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, r.chat!.id))
    .orderBy(asc(messages.id));
  return Response.json({
    chat: { id: r.chat!.id, title: r.chat!.title },
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      images: m.images ? (JSON.parse(m.images) as string[]) : [],
    })),
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const r = await ownChat(req, ctx);
  if (r.error) return r.error;
  let body: { title?: string };
  try {
    body = await req.json();
  } catch {
    return err("Неверный запрос");
  }
  const title = String(body.title ?? "").trim().slice(0, 80);
  if (!title) return err("Пустое название");
  await db.update(chats).set({ title }).where(eq(chats.id, r.chat!.id));
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const r = await ownChat(req, ctx);
  if (r.error) return r.error;
  // Если чат пустой (например, сообщение не отправилось) и создан сегодня —
  // возвращаем потраченную попытку из дневного лимита.
  const msgs = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.chatId, r.chat!.id))
    .limit(1);
  const createdDay = r.chat!.createdAt.toISOString().slice(0, 10);
  if (msgs.length === 0 && createdDay === today()) {
    await db
      .update(usage)
      .set({ chats: sql`greatest(${usage.chats} - 1, 0)` })
      .where(and(eq(usage.userId, r.user!.id), eq(usage.day, today())));
  }
  await db.delete(chats).where(eq(chats.id, r.chat!.id));
  return Response.json({ ok: true });
}
