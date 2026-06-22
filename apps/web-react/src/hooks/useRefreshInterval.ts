import { useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

const DEFAULT_HOURS = 1;

export function useRefreshIntervalMs() {
  const [refreshMs, setRefreshMs] = useState(DEFAULT_HOURS * 60 * 60 * 1000);
  const [refreshHours, setRefreshHours] = useState(DEFAULT_HOURS);

  useEffect(() => {
    void (async () => {
      try {
        const config = await fetchJson<{ product?: { refreshIntervalHours?: number } }>("/api/v1/config");
        const hours = Math.min(
          168,
          Math.max(1, Math.floor(Number(config.product?.refreshIntervalHours) || DEFAULT_HOURS))
        );
        setRefreshHours(hours);
        setRefreshMs(hours * 60 * 60 * 1000);
      } catch {
        setRefreshHours(DEFAULT_HOURS);
        setRefreshMs(DEFAULT_HOURS * 60 * 60 * 1000);
      }
    })();
  }, []);

  return { refreshMs, refreshHours };
}
