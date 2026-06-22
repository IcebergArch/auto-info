import { readSystemConfigRaw } from "../use-cases/uc-004-system-config/service.mjs";

export const DEFAULT_REFRESH_INTERVAL_HOURS = 1;
const MIN_REFRESH_INTERVAL_HOURS = 1;
const MAX_REFRESH_INTERVAL_HOURS = 168;

export function clampRefreshIntervalHours(value) {
  const hours = Math.floor(Number(value));
  if (!Number.isFinite(hours)) return DEFAULT_REFRESH_INTERVAL_HOURS;
  return Math.min(MAX_REFRESH_INTERVAL_HOURS, Math.max(MIN_REFRESH_INTERVAL_HOURS, hours));
}

export async function getRefreshIntervalHours() {
  const config = await readSystemConfigRaw();
  return clampRefreshIntervalHours(config.product?.refreshIntervalHours);
}

export function refreshIntervalMs(hours) {
  return clampRefreshIntervalHours(hours) * 60 * 60 * 1000;
}
