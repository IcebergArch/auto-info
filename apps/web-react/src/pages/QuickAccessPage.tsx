import { FormEvent, useMemo, useState } from "react";
import { copyUrlToClipboard, openExternalUrl } from "../lib/open-external-url";

const STORAGE_KEY = "quick-access-history";
const DEFAULT_NEO4J = "http://localhost:7474/browser/";

function prefersHttp(raw: string) {
  const host = raw.split("/")[0].split("?")[0];
  return (
    /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ||
    /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host) ||
    /^[\w.-]+:\d+$/.test(host)
  );
}

function normalizeUrl(input: string) {
  const raw = input.trim();
  if (!raw) throw new Error("请输入 URL");
  const withProtocol = /^https?:\/\//i.test(raw)
    ? raw
    : prefersHttp(raw)
      ? `http://${raw}`
      : `https://${raw}`;
  const url = new URL(withProtocol);
  if (!/^https?:$/i.test(url.protocol)) throw new Error("仅支持 http/https");
  return url.toString();
}

function linkLabel(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 32);
  }
}

export function QuickAccessPage() {
  const initialHistory = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed.slice(0, 40) : [];
      if (!list.length) return [DEFAULT_NEO4J];
      return list;
    } catch {
      return [DEFAULT_NEO4J];
    }
  }, []);

  const [history, setHistory] = useState<string[]>(initialHistory);
  const [current, setCurrent] = useState(initialHistory[0] || "");
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("");
  const [actionHint, setActionHint] = useState("");

  const persist = (next: string[]) => {
    setHistory(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 40)));
  };

  const openInNewWindow = (url: string, options?: { selectOnly?: boolean }) => {
    setCurrent(url);
    setMessage("");
    if (options?.selectOnly) {
      setActionHint("");
      return;
    }
    const ok = openExternalUrl(url);
    if (ok) {
      setActionHint("已尝试在新标签页打开；若被拦截，请使用下方按钮或复制链接。");
    } else {
      setActionHint("浏览器可能拦截了弹窗，请点击「在新窗口打开」或复制链接后粘贴到 Cursor / 系统浏览器。");
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const url = normalizeUrl(input);
      const nextHistory = [url, ...history.filter((item) => item !== url)].slice(0, 40);
      persist(nextHistory);
      openInNewWindow(url);
      setInput("");
    } catch (urlError) {
      setMessage((urlError as Error).message || "URL 无效");
    }
  };

  const removeUrl = (url: string) => {
    const nextHistory = history.filter((item) => item !== url);
    persist(nextHistory);
    if (current === url) {
      openInNewWindow(nextHistory[0] || "", { selectOnly: true });
    }
  };

  const onCopy = async () => {
    if (!current) return;
    const ok = await copyUrlToClipboard(current);
    setActionHint(ok ? "链接已复制到剪贴板。" : "复制失败，请手动选择地址栏复制。");
  };

  return (
    <section className="panel quick-access-panel">
      <h2>快捷访问</h2>
      <p className="result-text quick-access-intro">
        链接目录 + 新窗口打开。不在页内 iframe 预览（避免登录态丢失、X-Frame-Options 与代理改写导致体验不完整）。
      </p>
      <div className="quick-access-layout">
        <aside className="quick-access-sidebar">
          <form className="quick-access-form" onSubmit={submit}>
            <input
              className="input"
              type="text"
              placeholder="输入 URL，Enter 添加并打开"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              添加并打开
            </button>
          </form>
          {message ? <p className="error-text">{message}</p> : null}
          <h3 className="quick-access-dir-title">目录</h3>
          {history.length ? (
            <ul className="quick-access-dir">
              {history.map((url) => (
                <li key={url}>
                  <div className={`quick-access-dir-item${current === url ? " is-active" : ""}`}>
                    <button
                      type="button"
                      className="quick-access-dir-link"
                      onClick={() => openInNewWindow(url)}
                      title={`打开 ${url}`}
                    >
                      <span className="quick-access-dir-host">{linkLabel(url)}</span>
                      <span className="quick-access-dir-url">{url}</span>
                    </button>
                    <button
                      type="button"
                      className="quick-access-dir-open"
                      aria-label="在新窗口打开"
                      title="在新窗口打开"
                      onClick={() => openInNewWindow(url)}
                    >
                      ↗
                    </button>
                    <button
                      type="button"
                      className="quick-access-dir-remove"
                      aria-label="移除"
                      onClick={() => removeUrl(url)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="result-text">暂无链接，在上方输入 URL 后添加。</p>
          )}
        </aside>
        <div className="quick-access-launcher">
          {current ? (
            <>
              <header className="quick-access-launcher-head">
                <h3 className="quick-access-launcher-title">{linkLabel(current)}</h3>
                <p className="quick-access-launcher-url">{current}</p>
              </header>
              <div className="quick-access-launcher-actions">
                <button type="button" className="btn btn-primary" onClick={() => openInNewWindow(current)}>
                  在新窗口打开
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => void onCopy()}>
                  复制链接
                </button>
              </div>
              {actionHint ? <p className="result-text quick-access-hint">{actionHint}</p> : null}
              <div className="quick-access-launcher-note">
                <p className="result-text">
                  在 <strong>Cursor</strong> 中开发时：新标签通常由编辑器或系统浏览器承载，登录与 Cookie 与直接访问 URL 一致。若弹窗被拦截，请用上方按钮或复制链接后在 Cursor 地址栏 / 简单浏览器中打开。
                </p>
                <p className="result-text">
                  Neo4j Browser、需 SSO 的站点等<strong>不支持可靠 iframe 嵌入</strong>，故不提供页内预览。
                </p>
              </div>
            </>
          ) : (
            <div className="quick-access-empty">
              <p className="result-text">在左侧添加或选择链接，将自动在新窗口打开。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
