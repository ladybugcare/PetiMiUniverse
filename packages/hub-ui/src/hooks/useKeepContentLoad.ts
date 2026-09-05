import { useCallback, useRef, useState } from 'react';

/**
 * Separa primeira carga de refresh para não desmontar a UI já visível.
 * `begin()` no início do fetch; `succeed()` após dados ok; `finish()` no finally.
 */
export function useKeepContentLoad(resourceKey: string | null | undefined, initialLoading = true) {
  const [loading, setLoading] = useState(initialLoading);
  const [refreshing, setRefreshing] = useState(false);
  const loadedKeyRef = useRef<string | null>(null);

  const begin = useCallback(() => {
    if (resourceKey && loadedKeyRef.current === resourceKey) {
      setRefreshing(true);
      return true;
    }
    setLoading(true);
    return false;
  }, [resourceKey]);

  const succeed = useCallback(() => {
    if (resourceKey) loadedKeyRef.current = resourceKey;
  }, [resourceKey]);

  const finish = useCallback(() => {
    setLoading(false);
    setRefreshing(false);
  }, []);

  return { loading, refreshing, begin, succeed, finish };
}
