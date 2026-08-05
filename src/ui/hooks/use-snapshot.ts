import { useCallback, useEffect, useRef, useState } from 'react';
import { connectToDaemon, type DaemonClient } from '../../rpc/client.js';
import type { ClientSnapshot } from '../../shared/types.js';
import { errorMessage } from '../../shared/errors.js';

export function useSnapshot(initialClient: DaemonClient, intervalMs = 750) {
  const [client, setClient] = useState(initialClient);
  const [snapshot, setSnapshot] = useState<ClientSnapshot>();
  const [error, setError] = useState<string>();
  const [downloadHistory, setDownloadHistory] = useState<number[]>([]);
  const [uploadHistory, setUploadHistory] = useState<number[]>([]);
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const activeRef = useRef(true);
  const clientRef = useRef(initialClient);
  const reconnectRef = useRef<Promise<DaemonClient> | undefined>(undefined);

  const applySnapshot = useCallback((next: ClientSnapshot) => {
    if (!activeRef.current) return;
    setSnapshot(next);
    setDownloadHistory((history) => [...history.slice(-59), next.global.downloadSpeed]);
    setUploadHistory((history) => [...history.slice(-59), next.global.uploadSpeed]);
    setError(undefined);
  }, []);

  const reconnect = useCallback(async (): Promise<DaemonClient> => {
    if (reconnectRef.current) return reconnectRef.current;
    const pending = connectToDaemon().then((nextClient) => {
      clientRef.current = nextClient;
      if (activeRef.current) setClient(nextClient);
      return nextClient;
    });
    reconnectRef.current = pending;
    try {
      return await pending;
    } finally {
      reconnectRef.current = undefined;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      applySnapshot(await clientRef.current.snapshot());
    } catch (caught) {
      if (activeRef.current) setError(`Connection lost; reconnecting… ${errorMessage(caught)}`);
      try {
        const nextClient = await reconnect();
        applySnapshot(await nextClient.snapshot());
      } catch (reconnectError) {
        if (activeRef.current) setError(`Reconnect failed: ${errorMessage(reconnectError)}`);
      }
    }
  }, [applySnapshot, reconnect]);

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

  return { client, snapshot, error, refresh, downloadHistory, uploadHistory };
}
