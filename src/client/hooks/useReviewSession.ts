import { useCallback, useEffect, useRef, useState } from 'react';

import type { SessionInfo } from '../../types/ladder';

interface ReviewSessionHook {
  session: SessionInfo | null;
  // Resolves with the fresh session, so callers can act on it before React re-renders.
  refreshSession: () => Promise<SessionInfo | null>;
}

export function useReviewSession(): ReviewSessionHook {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const requestIdRef = useRef(0);

  const refreshSession = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const response = await fetch('/api/session');
      if (!response.ok) return null;
      const next = (await response.json()) as SessionInfo;
      if (requestId === requestIdRef.current) setSession(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  return { session, refreshSession };
}
