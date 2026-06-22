import { useCallback, useEffect, useRef } from "react";

/**
 * 忽略过期异步结果，避免 StrictMode 双挂载或连续刷新时的竞态覆盖。
 */
export function useLatestAsync() {
  const seqRef = useRef(0);

  useEffect(() => {
    const seqAtMount = seqRef.current;
    return () => {
      seqRef.current = seqAtMount + 1;
    };
  }, []);

  const nextSeq = useCallback(() => {
    seqRef.current += 1;
    return seqRef.current;
  }, []);

  const isLatest = useCallback((seq: number) => seq === seqRef.current, []);

  return { nextSeq, isLatest };
}
