import { useEffect, useState } from "react";
import { ConfigDetailModal, type ConfigData, type ConfigSectionKey } from "../components/ConfigDetailModal";
import { fetchJson } from "../lib/api";

type StatusItem = {
  name?: string;
  status?: string;
  message?: string;
};

type ConfigStatus = {
  storage?: { status?: string; message?: string };
  graph?: { status?: string; message?: string };
  llm?: { status?: string; message?: string; provider?: string };
  sources?: StatusItem[];
};

type SyncResult = {
  ok?: boolean;
  mysql?: { status?: string; message?: string };
  neo4j?: { status?: string; message?: string };
};

const SOURCE_LABELS: Record<string, string> = {
  googleSearch: "Google Search",
  braveSearch: "Brave Search",
  jinaReader: "Jina Reader",
  twitterSearch: "Twitter / X"
};

function statusPillClass(status?: string) {
  const value = (status || "unknown").toLowerCase();
  if (["connected", "configured", "free"].includes(value)) return "status-pill status-pill-ok";
  if (value === "degraded") return "status-pill status-pill-warn";
  if (value === "missing") return "status-pill status-pill-missing";
  return "status-pill status-pill-neutral";
}

function formatStatusLabel(status?: string) {
  const key = (status || "unknown").toLowerCase();
  const labels: Record<string, string> = {
    connected: "已连接",
    configured: "已配置",
    free: "免费通道",
    degraded: "降级",
    missing: "未配置",
    unknown: "未知"
  };
  return labels[key] || status || "未知";
}

function sourceTitle(name?: string) {
  if (!name) return "信源";
  return SOURCE_LABELS[name] || name;
}

type ConfigCard = {
  key: ConfigSectionKey;
  title: string;
  status?: string;
  message?: string;
};

export function ConfigPage() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [config, setConfig] = useState<ConfigData>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [modalSection, setModalSection] = useState<ConfigSectionKey | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [statusPayload, configPayload] = await Promise.all([
        fetchJson<ConfigStatus>("/api/v1/config/status"),
        fetchJson<ConfigData>("/api/v1/config")
      ]);
      setStatus(statusPayload);
      setConfig(configPayload);
      setMessage("链路状态已刷新");
    } catch (refreshError) {
      setMessage("");
      setError((refreshError as Error).message || "状态读取失败");
    } finally {
      setLoading(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setError("");
    try {
      const payload = await fetchJson<SyncResult>("/api/v1/config/sync", { method: "POST" });
      const mysql = payload.mysql?.status || "unknown";
      const neo4j = payload.neo4j?.status || "unknown";
      setMessage(`同步完成 · MySQL ${formatStatusLabel(mysql)} · Neo4j ${formatStatusLabel(neo4j)}`);
      await refresh();
    } catch (syncError) {
      setMessage("");
      setError((syncError as Error).message || "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const refreshHours = config?.product?.refreshIntervalHours ?? 1;

  const cards: ConfigCard[] = [
    {
      key: "product",
      title: "产品与界面",
      status: "configured",
      message: `今日日报 / 科技雷达自动刷新：每 ${refreshHours} 小时`
    },
    { key: "mysql", title: "MySQL", status: status?.storage?.status, message: status?.storage?.message },
    { key: "neo4j", title: "Neo4j", status: status?.graph?.status, message: status?.graph?.message },
    {
      key: "llm",
      title: status?.llm?.provider ? `LLM · ${status.llm.provider}` : "LLM",
      status: status?.llm?.status,
      message: status?.llm?.message
    },
    ...((status?.sources || []).map((item) => ({
      key: item.name || "source",
      title: sourceTitle(item.name),
      status: item.status,
      message: item.message
    })))
  ];

  return (
    <section className="panel config-layout">
      <h2>配置</h2>
      <p className="result-text">查看链路状态；点击「查看/编辑」在弹窗中修改各项配置（敏感字段掩码存储）。</p>

      <div className="config-block">
        <div className="panel-header">
          <h3 className="reading-block-title">链路状态</h3>
          <div className="panel-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void refresh()} disabled={loading || syncing}>
              {loading ? "刷新中…" : "刷新状态"}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void runSync()} disabled={loading || syncing}>
              {syncing ? "同步中…" : "同步数据"}
            </button>
          </div>
        </div>

        {loading && !status ? <p className="result-text">加载中…</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!error && message ? <p className="result-text">{message}</p> : null}

        <ul className="config-status-list">
          {cards.map((card) => (
            <li className="config-status-item" key={card.key}>
              <div className="config-status-head">
                <span className="config-status-name">{card.title}</span>
                <span className={statusPillClass(card.status)}>{formatStatusLabel(card.status)}</span>
              </div>
              <p className="config-status-message">{card.message || "暂无说明"}</p>
              <button type="button" className="btn btn-secondary config-detail-btn" onClick={() => setModalSection(card.key)}>
                查看 / 编辑
              </button>
            </li>
          ))}
        </ul>
      </div>

      <ConfigDetailModal
        section={modalSection}
        config={config}
        onClose={() => setModalSection(null)}
        onSaved={() => void refresh()}
      />
    </section>
  );
}
