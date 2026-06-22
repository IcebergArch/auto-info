/**
 * 在系统/编辑器默认浏览器新标签打开 URL（完整 Cookie、登录态与直接访问一致）。
 * 不使用 iframe：多数站点禁止嵌入或代理后会丢失会话。
 */
export function openExternalUrl(url: string): boolean {
  if (!url) return false;
  try {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      opened.opener = null;
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

export async function copyUrlToClipboard(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
