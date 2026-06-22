import { useEffect, useRef, useState } from "react";
import { THEMES, useAppStore, type ThemeKey } from "../stores/useAppStore";

const THEME_GLYPH: Record<ThemeKey, string> = {
  morning: "☀",
  command: "◎",
  brief: "❡",
  terminal: "▢"
};

export function ThemeSwitcher() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = THEMES.find((t) => t.key === theme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="theme-switcher" ref={rootRef}>
      <button
        type="button"
        className="theme-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`氛围主题：${current.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="theme-switcher-glyph" aria-hidden="true">
          {THEME_GLYPH[current.key]}
        </span>
        <span className="theme-switcher-label">{current.label}</span>
      </button>
      {open ? (
        <ul className="theme-switcher-menu" role="listbox" aria-label="选择氛围主题">
          {THEMES.map((item) => (
            <li key={item.key} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={item.key === theme}
                className={`theme-switcher-option${item.key === theme ? " is-active" : ""}`}
                data-theme-preview={item.key}
                onClick={() => {
                  setTheme(item.key);
                  setOpen(false);
                }}
              >
                <span className="theme-switcher-swatch" aria-hidden="true" data-theme={item.key}>
                  <i />
                  <i />
                  <i />
                </span>
                <span className="theme-switcher-option-copy">
                  <span className="theme-switcher-option-name">{item.label}</span>
                  <span className="theme-switcher-option-hint">{item.hint}</span>
                </span>
                {item.key === theme ? (
                  <span className="theme-switcher-check" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
