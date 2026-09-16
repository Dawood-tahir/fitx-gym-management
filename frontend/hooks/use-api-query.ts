"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useApiQuery<T>(loader: () => Promise<T>, dependencies: readonly unknown[] = []) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loaderRef.current()
      .then((value) => { if (active) setData(value); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught : new Error("Request failed")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, nonce]);

  return { data, error, loading, reload, setData };
}
