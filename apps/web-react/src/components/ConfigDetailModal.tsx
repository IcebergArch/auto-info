import { FormEvent, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

export type ConfigData = {
  storage?: {
    primary?: string;
    fallback?: string;
    mysql?: {
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      passwordMasked?: string;
      cliPath?: string;
    };
  };
  graph?: {
    provider?: string;
    neo4j?: {
      host?: string;
      boltPort?: number;
      httpPort?: number;
      database?: string;
      user?: string;
      passwordMasked?: string;
      httpUrl?: string;
    };
  };
  sources?: Record<
    string,
    {
      enabled?: boolean;
      endpoint?: string;
      apiKeyMasked?: string;
      cx?: string;
    }
  >;
  llm?: {
    provider?: string;
    model?: string;
    apiKeyMasked?: string;
  };
  product?: {
    refreshIntervalHours?: number;
  };
};

export type ConfigSectionKey = "mysql" | "neo4j" | "llm" | string;

const SECTION_TITLES: Record<string, string> = {
  mysql: "MySQL",
  neo4j: "Neo4j",
  llm: "LLM",
  product: "产品与界面",
  googleSearch: "Google Search",
  braveSearch: "Brave Search",
  jinaReader: "Jina Reader",
  twitterSearch: "Twitter / X"
};

export function ConfigDetailModal({
  section,
  config,
  onClose,
  onSaved
}: {
  section: ConfigSectionKey | null;
  config: ConfigData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!section || !config) {
      setDraft({});
      return;
    }
    if (section === "product") {
      setDraft({
        refreshIntervalHours: String(config.product?.refreshIntervalHours ?? 3)
      });
      return;
    }
    if (section === "mysql") {
      const mysql = config.storage?.mysql || {};
      setDraft({
        host: mysql.host || "",
        port: String(mysql.port ?? 3306),
        database: mysql.database || "",
        user: mysql.user || "",
        password: "",
        cliPath: mysql.cliPath || "mysql"
      });
      return;
    }
    if (section === "neo4j") {
      const neo4j = config.graph?.neo4j || {};
      setDraft({
        host: neo4j.host || "",
        boltPort: String(neo4j.boltPort ?? 7687),
        httpPort: String(neo4j.httpPort ?? 7474),
        database: neo4j.database || "",
        user: neo4j.user || "",
        password: "",
        httpUrl: neo4j.httpUrl || ""
      });
      return;
    }
    if (section === "llm") {
      const llm = config.llm || {};
      setDraft({
        provider: llm.provider || "openrouter",
        model: llm.model || "",
        apiKey: ""
      });
      return;
    }
    const source = config.sources?.[section] || {};
    setDraft({
      enabled: Boolean(source.enabled),
      endpoint: source.endpoint || "",
      apiKey: "",
      cx: source.cx || ""
    });
  }, [section, config]);

  if (!section) return null;

  const title = SECTION_TITLES[section] || section;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      let body: ConfigData = {};
      if (section === "mysql") {
        body = {
          storage: {
            mysql: {
              host: String(draft.host || ""),
              port: Number(draft.port) || 3306,
              database: String(draft.database || ""),
              user: String(draft.user || ""),
              password: String(draft.password || ""),
              cliPath: String(draft.cliPath || "mysql")
            }
          }
        };
      } else if (section === "neo4j") {
        body = {
          graph: {
            neo4j: {
              host: String(draft.host || ""),
              boltPort: Number(draft.boltPort) || 7687,
              httpPort: Number(draft.httpPort) || 7474,
              database: String(draft.database || ""),
              user: String(draft.user || ""),
              password: String(draft.password || ""),
              httpUrl: String(draft.httpUrl || "")
            }
          }
        };
      } else if (section === "llm") {
        body = {
          llm: {
            provider: String(draft.provider || "openrouter"),
            model: String(draft.model || ""),
            apiKey: String(draft.apiKey || "")
          }
        };
      } else if (section === "product") {
        body = {
          product: {
            refreshIntervalHours: Math.min(
              168,
              Math.max(1, Math.floor(Number(draft.refreshIntervalHours) || 3))
            )
          }
        };
      } else {
        body = {
          sources: {
            [section]: {
              enabled: Boolean(draft.enabled),
              endpoint: String(draft.endpoint || ""),
              apiKey: String(draft.apiKey || ""),
              cx: String(draft.cx || "")
            }
          }
        };
      }
      await fetchJson("/api/v1/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      onSaved();
      onClose();
    } catch (saveError) {
      setError((saveError as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const maskedHint =
    section === "mysql"
      ? config?.storage?.mysql?.passwordMasked
      : section === "neo4j"
        ? config?.graph?.neo4j?.passwordMasked
        : section === "llm"
          ? config?.llm?.apiKeyMasked
          : config?.sources?.[section]?.apiKeyMasked;

  return (
    <div className="config-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="config-modal" role="dialog" aria-labelledby="config-modal-title" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h3 id="config-modal-title" className="reading-block-title">
            {title} 配置
          </h3>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
        <form className="config-modal-form stack" onSubmit={(event) => void onSubmit(event)}>
          {section === "mysql" || section === "neo4j" ? (
            <>
              <label className="field-label">
                主机
                <input className="input" value={String(draft.host || "")} onChange={(e) => setDraft({ ...draft, host: e.target.value })} />
              </label>
              {section === "mysql" ? (
                <>
                  <label className="field-label">
                    端口
                    <input className="input" value={String(draft.port || "")} onChange={(e) => setDraft({ ...draft, port: e.target.value })} />
                  </label>
                  <label className="field-label">
                    数据库
                    <input className="input" value={String(draft.database || "")} onChange={(e) => setDraft({ ...draft, database: e.target.value })} />
                  </label>
                  <label className="field-label">
                    用户
                    <input className="input" value={String(draft.user || "")} onChange={(e) => setDraft({ ...draft, user: e.target.value })} />
                  </label>
                  <label className="field-label">
                    CLI 路径
                    <input className="input" value={String(draft.cliPath || "")} onChange={(e) => setDraft({ ...draft, cliPath: e.target.value })} />
                  </label>
                </>
              ) : (
                <>
                  <label className="field-label">
                    Bolt 端口
                    <input className="input" value={String(draft.boltPort || "")} onChange={(e) => setDraft({ ...draft, boltPort: e.target.value })} />
                  </label>
                  <label className="field-label">
                    HTTP 端口
                    <input className="input" value={String(draft.httpPort || "")} onChange={(e) => setDraft({ ...draft, httpPort: e.target.value })} />
                  </label>
                  <label className="field-label">
                    数据库
                    <input className="input" value={String(draft.database || "")} onChange={(e) => setDraft({ ...draft, database: e.target.value })} />
                  </label>
                  <label className="field-label">
                    用户
                    <input className="input" value={String(draft.user || "")} onChange={(e) => setDraft({ ...draft, user: e.target.value })} />
                  </label>
                  <label className="field-label">
                    HTTP URL
                    <input className="input" value={String(draft.httpUrl || "")} onChange={(e) => setDraft({ ...draft, httpUrl: e.target.value })} />
                  </label>
                </>
              )}
              <label className="field-label">
                密码（留空则不修改）
                <input className="input" type="password" value={String(draft.password || "")} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder={maskedHint ? `当前 ${maskedHint}` : ""} />
              </label>
            </>
          ) : null}

          {section === "product" ? (
            <label className="field-label">
              自动刷新周期（小时）
              <input
                className="input"
                type="number"
                min={1}
                max={168}
                value={String(draft.refreshIntervalHours || "3")}
                onChange={(e) => setDraft({ ...draft, refreshIntervalHours: e.target.value })}
              />
              <span className="result-text">作用于今日日报与科技雷达（1～168）</span>
            </label>
          ) : null}

          {section === "llm" ? (
            <>
              <label className="field-label">
                Provider
                <input className="input" value={String(draft.provider || "")} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} />
              </label>
              <label className="field-label">
                Model
                <input className="input" value={String(draft.model || "")} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
              </label>
              <label className="field-label">
                API Key（留空则不修改）
                <input className="input" type="password" value={String(draft.apiKey || "")} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} placeholder={maskedHint ? `当前 ${maskedHint}` : ""} />
              </label>
            </>
          ) : null}

          {section !== "mysql" && section !== "neo4j" && section !== "llm" && section !== "product" ? (
            <>
              <label className="field-label config-checkbox">
                <input type="checkbox" checked={Boolean(draft.enabled)} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                启用
              </label>
              <label className="field-label">
                Endpoint
                <input className="input" value={String(draft.endpoint || "")} onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })} />
              </label>
              {section === "googleSearch" ? (
                <label className="field-label">
                  CX
                  <input className="input" value={String(draft.cx || "")} onChange={(e) => setDraft({ ...draft, cx: e.target.value })} />
                </label>
              ) : null}
              <label className="field-label">
                API Key（留空则不修改）
                <input className="input" type="password" value={String(draft.apiKey || "")} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} placeholder={maskedHint ? `当前 ${maskedHint}` : ""} />
              </label>
            </>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}
          <div className="panel-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
