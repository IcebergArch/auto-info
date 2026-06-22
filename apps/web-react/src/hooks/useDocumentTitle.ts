import { useEffect } from "react";

const BASE_TITLE = "Auto Info · 猎户座";

export function useDocumentTitle(pageLabel?: string) {
  useEffect(() => {
    document.title = pageLabel ? `${pageLabel} · ${BASE_TITLE}` : BASE_TITLE;
  }, [pageLabel]);
}
