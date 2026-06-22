import { handleEmbedProxy } from "../use-cases/uc-005-quick-access/embed-proxy.mjs";

/** 开发态本地工具同源代理（Neo4j Browser 等） */
export function handleLocalDevProxy(req, res, pathname, searchParams) {
  if (!pathname.startsWith("/neo4j")) return false;
  const subPath = pathname.slice("/neo4j".length) || "/";
  const embedPath = `/api/v1/quick-access/embed/127.0.0.1:7474${subPath}`;
  return handleEmbedProxy(req, res, embedPath, searchParams);
}
