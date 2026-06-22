import { create } from "zustand";

export type PageKey = "home" | "topics" | "analysis" | "reading" | "techRadar" | "quick" | "config";

export type ThemeKey = "morning" | "command" | "brief" | "terminal";

export const THEMES: { key: ThemeKey; label: string; hint: string }[] = [
  { key: "morning", label: "晨曦", hint: "明亮清爽 · 默认" },
  { key: "command", label: "指挥中心", hint: "深色科幻 · 青光 HUD" },
  { key: "brief", label: "社讯干报", hint: "冷静 editorial · 重阅读" },
  { key: "terminal", label: "终端档案库", hint: "磷光等宽 · 极客" }
];

const THEME_KEYS: ThemeKey[] = THEMES.map((t) => t.key);
const THEME_STORAGE_KEY = "auto-info.theme";

function readStoredTheme(): ThemeKey {
  if (typeof window === "undefined") return "morning";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw && (THEME_KEYS as string[]).includes(raw)) return raw as ThemeKey;
  } catch {
    /* localStorage 不可用时回退默认 */
  }
  return "command";
}

export function applyThemeToDocument(theme: ThemeKey) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

type AppState = {
  page: PageKey;
  theme: ThemeKey;
  pendingReadingSessionId: string | null;
  setPage: (page: PageKey) => void;
  setTheme: (theme: ThemeKey) => void;
  openReadingSession: (sessionId: string) => void;
  consumePendingReadingSession: () => string | null;
};

export const useAppStore = create<AppState>((set, get) => ({
  page: "topics",
  theme: readStoredTheme(),
  pendingReadingSessionId: null,
  setPage: (page) => set({ page }),
  setTheme: (theme) => {
    applyThemeToDocument(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* 忽略持久化失败 */
    }
    set({ theme });
  },
  openReadingSession: (sessionId) =>
    set({ page: "reading", pendingReadingSessionId: sessionId }),
  consumePendingReadingSession: () => {
    const id = get().pendingReadingSessionId;
    if (id) set({ pendingReadingSessionId: null });
    return id;
  }
}));
