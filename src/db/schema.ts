import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  login: text("login").notNull().unique(), // хранится в нижнем регистре
  displayLogin: text("display_login").notNull(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  theme: text("theme").notNull().default("default"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

export const chats = pgTable(
  "chats",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Новый чат"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("chats_user_idx").on(t.userId)]
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    // JSON-массив data:URL картинок (только у сообщений пользователя)
    images: text("images"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_chat_idx").on(t.chatId)]
);

// Дневные счётчики лимитов (день по UTC, формат YYYY-MM-DD)
export const usage = pgTable(
  "usage",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    chats: integer("chats").notNull().default(0),
    images: integer("images").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })]
);

// Логины с синей галочкой, добавленные через БД / админ-страницу
export const verifiedLogins = pgTable("verified_logins", {
  login: text("login").primaryKey(), // нижний регистр
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
