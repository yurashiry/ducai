import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, verifiedLogins, usage } from "@/db/schema";
import {
  VERIFIED_LOGINS,
  FREE_CHATS_PER_DAY,
  FREE_IMAGES_PER_DAY,
} from "@/lib/config";

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function newSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function newToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function err(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function isVerified(login: string): Promise<boolean> {
  const l = login.toLowerCase();
  if (VERIFIED_LOGINS.map((x) => x.toLowerCase()).includes(l)) return true;
  const rows = await db
    .select()
    .from(verifiedLogins)
    .where(eq(verifiedLogins.login, l))
    .limit(1);
  return rows.length > 0;
}

export type AuthUser = {
  id: number;
  login: string;
  displayLogin: string;
  theme: string;
  verified: boolean;
};

export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      login: users.login,
      displayLogin: users.displayLogin,
      theme: users.theme,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);
  const u = rows[0];
  if (!u) return null;
  return { ...u, verified: await isVerified(u.login) };
}

export async function getUsage(userId: number) {
  const rows = await db.select().from(usage).where(eq(usage.userId, userId));
  const row = rows.find((r) => r.day === today());
  return { chats: row?.chats ?? 0, images: row?.images ?? 0 };
}

export async function publicUser(u: AuthUser) {
  const used = await getUsage(u.id);
  return {
    login: u.displayLogin,
    verified: u.verified,
    theme: u.theme,
    limits: {
      chatsUsed: used.chats,
      chatsLimit: u.verified ? null : FREE_CHATS_PER_DAY,
      imagesUsed: used.images,
      imagesLimit: u.verified ? null : FREE_IMAGES_PER_DAY,
    },
  };
}
