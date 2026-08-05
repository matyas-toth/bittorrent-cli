import { useCallback, useEffect, useRef, useState } from 'react';
import type { DaemonClient } from '../../rpc/client.js';
import type { ClientSnapshot } from '../../shared/types.js';
import { errorMessage } from '../../shared/errors.js';

export function useSnapshot(client: DaemonClient, intervalMs = 750) {
  const [snapshot, setSnapshot] = useState<ClientSnapshot>();
  const [error, setError] = useState<string>();
  const [downloadHistory, setDownloadHistory] = useState<number[]>([]);
  const [uploadHistory, setUploadHistory] = useState<number[]>([]);
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const activeRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await client.snapshot();
      if (activeRef.current) {
        setSnapshot(next);
        setDownloadHistory((history) => [...history.slice(-59), next.global.downloadSpeed]);
        setUploadHistory((history) => [...history.slice(-59), next.global.uploadSpeed]);
        setError(undefined);
      }
    } catch (caught) {
      if (activeRef.current) setError(errorMessage(caught));
    }
  }, [client]);

  useEffect(() => {
    activeRef.current = true;
    const poll = async () => {
      await refresh();
      if (activeRef.current) timerRef.current = setTimeout(poll, intervalMs);
    };
    void poll();
    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [intervalMs, refresh]);

  return { snapshot, error, refresh, downloadHistory, uploadHistory };
}
