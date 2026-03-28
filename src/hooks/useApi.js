/* eslint-disable */
/**
 * useApi — Lightweight React Query-like hook
 * - Module-level cache (survives re-renders, cleared on page refresh)
 * - Stale-while-revalidate pattern
 * - Automatic refetch on window focus
 * - Manual refetch via returned function
 */
import { useState, useEffect, useCallback, useRef } from "react";

const cache = new Map(); // key → { data, ts }
const DEFAULT_STALE = 5 * 60 * 1000; // 5 minutes

function isStale(entry, staleTime) {
  return !entry || Date.now() - entry.ts > staleTime;
}

/**
 * @param {string|null} url  — null/undefined to skip fetch
 * @param {object} opts
 *   headers   — extra headers (e.g. authHeader())
 *   staleTime — ms before cache is considered stale (default 5 min)
 *   select    — transform function applied to raw response data
 *   onSuccess — callback(data) after successful fetch
 *   onError   — callback(error) after failed fetch
 *   enabled   — boolean, default true
 */
export function useApi(url, opts = {}) {
  const {
    headers    = {},
    staleTime  = DEFAULT_STALE,
    select     = d => d,
    onSuccess  = null,
    onError    = null,
    enabled    = true,
  } = opts;

  const [state, setState] = useState(() => {
    const cached = url ? cache.get(url) : null;
    if (cached && !isStale(cached, staleTime)) {
      return { data: select(cached.data), loading: false, error: null };
    }
    return { data: null, loading: !!url && enabled, error: null };
  });

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fetchData = useCallback(async (silent = false) => {
    if (!url || !enabled) return;
    if (!silent) setState(s => ({ ...s, loading: true, error: null }));

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      cache.set(url, { data: raw, ts: Date.now() });
      const transformed = select(raw);
      if (mounted.current) {
        setState({ data: transformed, loading: false, error: null });
        onSuccess?.(transformed);
      }
    } catch (err) {
      // Serve stale cache on error
      const cached = cache.get(url);
      if (mounted.current) {
        setState({
          data: cached ? select(cached.data) : null,
          loading: false,
          error: err.message,
          stale: !!cached,
        });
        onError?.(err);
      }
    }
  }, [url, enabled, staleTime]); // eslint-disable-line

  // Initial fetch
  useEffect(() => {
    if (!url || !enabled) return;
    const cached = cache.get(url);
    if (cached && !isStale(cached, staleTime)) {
      // Serve from cache, silently revalidate in background
      fetchData(true);
      return;
    }
    fetchData(false);
  }, [url, enabled]); // eslint-disable-line

  // Refetch on window focus (stale check)
  useEffect(() => {
    function onFocus() {
      if (!url || !enabled) return;
      const cached = cache.get(url);
      if (isStale(cached, staleTime)) fetchData(true);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [url, enabled, staleTime]); // eslint-disable-line

  const refetch = useCallback(() => fetchData(false), [fetchData]);
  const invalidate = useCallback(() => { if (url) cache.delete(url); }, [url]);

  return { ...state, refetch, invalidate };
}

/** Manually invalidate a cached URL from outside a component */
export function invalidateCache(url) {
  if (url) cache.delete(url);
  else cache.clear();
}

/** Prefetch a URL so it's ready before navigation */
export async function prefetch(url, headers = {}) {
  if (!url || cache.has(url)) return;
  try {
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      cache.set(url, { data, ts: Date.now() });
    }
  } catch { /* silent */ }
}
