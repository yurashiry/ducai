import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { chats, messages, usage } from "@/db/schema";
import { err, getAuthUser, getUsage, today } from "@/lib/auth";
import {
  CLAUDE_MODEL,
  FREE_CHATS_PER_DAY,
  FREE_IMAGES_PER_DAY,
} from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

type ClaudeBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

const MAX_IMAGES_PER_MESSAGE = 5;
const MAX_IMAGE_LEN = 4_000_000; // длина data URL

function toBlocks(text: string, images: string[]): ClaudeBlock[] {
  const blocks: ClaudeBlock[] = [];
  for (const img of images) {
    const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/.exec(img);
    if (m)
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: m[1], data: m[2] },
      });
  }
  blocks.push({ type: "text", text: text || "(см. изображение)" });
  return blocks;
}

export async function POST(req: Request, ctx: Ctx) {
  const u = await getAuthUser(req);
  if (!u) return err("Не авторизован", 401);

  const { id } = await ctx.params;
  const chatId = Number(id);
  if (!Number.isInteger(chatId)) return err("Чат не найден", 404);
  const chatRows = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, u.id)))
    .limit(1);
  const chat = chatRows[0];
  if (!chat) return err("Чат не найден", 404);

  let body: { text?: string; images?: string[] };
  try {
    body = await req.json();
  } catch {
    return err("Неверный запрос");
  }
  const text = String(body.text ?? "").trim().slice(0, 20000);
  const images = Array.isArray(body.images)
    ? body.images.filter((x): x is string => typeof x === "string")
    : [];
  if (!text && images.length === 0) return err("Пустое сообщение");
  if (images.length > MAX_IMAGES_PER_MESSAGE)
    return err(`Не более ${MAX_IMAGES_PER_MESSAGE} фото в одном сообщении`);
  for (const img of images) {
    if (
      img.length > MAX_IMAGE_LEN ||
      !/^data:image\/(jpeg|png|gif|webp);base64,/.test(img)
    )
      return err("Недопустимое или слишком большое изображение");
  }

  if (!u.verified && images.length > 0) {
    const used = await getUsage(u.id);
    if (used.images + images.length > FREE_IMAGES_PER_DAY) {
      const left = Math.max(0, FREE_IMAGES_PER_DAY - used.images);
      return err(
        `Лимит: ${FREE_IMAGES_PER_DAY} фото в день. Осталось сегодня: ${left}. Получите синюю галочку для безлимита.`,
        403
      );
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return err(
      "На сервере не задан ANTHROPIC_API_KEY. Добавьте ключ Claude в переменные окружения бэкенда.",
      503
    );

  // История (последние 30 сообщений) + новое сообщение
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.id));
  const recent = history.slice(-30);
  while (recent.length && recent[0].role !== "user") recent.shift();

  const claudeMessages = [
    ...recent.map((m) => ({
      role: m.role as "user" | "assistant",
      content:
        m.role === "user"
          ? toBlocks(m.content, m.images ? (JSON.parse(m.images) as string[]) : [])
          : m.content,
    })),
    { role: "user" as const, content: toBlocks(text, images) },
  ];

  let reply = "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system:
          "Ты DucAI — дружелюбный и полезный ИИ-ассистент. Отвечай на языке пользователя, чётко и по делу. Код оформляй в блоках ```.",
        messages: claudeMessages,
      }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = data?.error?.message || `Ошибка Claude API (${r.status})`;
      return err(`Claude API: ${msg}`, 502);
    }
    reply = (data?.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();
    if (!reply) reply = "(пустой ответ)";
  } catch {
    return err("Не удалось связаться с Claude API", 502);
  }

  const [userMsg] = await db
    .insert(messages)
    .values({
      chatId,
      role: "user",
      content: text,
      images: images.length ? JSON.stringify(images) : null,
    })
    .returning({ id: messages.id });
  const [aiMsg] = await db
    .insert(messages)
    .values({ chatId, role: "assistant", content: reply })
    .returning({ id: messages.id });

  const title =
    history.length === 0
      ? (text || "Фото").replace(/\s+/g, " ").slice(0, 40)
      : chat.title;
  await db
    .update(chats)
    .set({ title, updatedAt: new Date() })
    .where(eq(chats.id, chatId));

  if (images.length) {
    await db
      .insert(usage)
      .values({ userId: u.id, day: today(), chats: 0, images: images.length })
      .onConflictDoUpdate({
        target: [usage.userId, usage.day],
        set: { images: sql`${usage.images} + ${images.length}` },
      });
  }

  const used = await getUsage(u.id);
  return Response.json({
    userMessageId: userMsg.id,
    message: { id: aiMsg.id, role: "assistant", content: reply, images: [] },
    title,
    limits: {
      chatsUsed: used.chats,
      chatsLimit: u.verified ? null : FREE_CHATS_PER_DAY,
      imagesUsed: used.images,
      imagesLimit: u.verified ? null : FREE_IMAGES_PER_DAY,
    },
  });
}
