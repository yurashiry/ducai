// ============================================================
//  НАСТРОЙКИ DucAI
// ============================================================

// Логины с синей галочкой, "зашитые" в код. Хотите добавить ещё один —
// впишите его сюда (маленькими буквами) и перезапустите/передеплойте бэкенд.
// Можно также выдавать галочки без правки кода: через /admin.html
// или SQL (см. README в ответе).
export const VERIFIED_LOGINS: string[] = ["yurskk"];

// Лимиты для пользователей без галочки (в сутки, по UTC)
export const FREE_CHATS_PER_DAY = 3;
export const FREE_IMAGES_PER_DAY = 3;

// Темы
export const FREE_THEMES = ["default"];
export const PREMIUM_THEMES = [
  "green",
  "blue",
  "cyan",
  "red",
  "red-code",
  "blue-code",
  "green-code",
];
export const ALL_THEMES = [...FREE_THEMES, ...PREMIUM_THEMES];

// Модель Claude (можно переопределить переменной ANTHROPIC_MODEL)
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
