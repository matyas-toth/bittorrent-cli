import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { getAppPaths } from '../core/paths.js';
import { UserError } from '../shared/errors.js';
import type {
  AddTorrentRequest,
  ClientSettings,
  ClientSnapshot,
  SeedRequest,
  TorrentAction,
  TorrentSnapshot,
} from '../shared/types.js';
import type { ConnectionInfo, RpcMethod, RpcResponse } from './protocol.js';

const CONNECT_TIMEOUT_MS = 10_000;
const START_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 250;
const RETRYABLE_METHODS = new Set<RpcMethod>(['ping', 'snapshot']);

class DaemonConnectionError extends Error {
  override name = 'DaemonConnectionError';
}

export class DaemonClient {
  constructor(private readonly connection: ConnectionInfo) {}

  ping(): Promise<{ pid: number; startedAt: string }> {
    return this.call('ping');
  }

  snapshot(): Promise<ClientSnapshot> {
    return this.call('snapshot');
  }

  add(request: AddTorrentRequest): Promise<TorrentSnapshot> {
    return this.call('add', request);
  }

  seed(request: SeedRequest): Promise<TorrentSnapshot> {
    return this.call('seed', request);
  }

  action(id: string, action: TorrentAction): Promise<TorrentSnapshot> {
    return this.call('action', { id, action });
  }

  remove(id: string, deleteData = false): Promise<void> {
    return this.call('remove', { id, deleteData });
  }

  selectFiles(id: string, indices: number[]): Promise<TorrentSnapshot> {
    return this.call('selectFiles', { id, indices });
  }

  updateMetadata(
    id: string,
    update: { category?: string; tags?: string[] },
  ): Promise<TorrentSnapshot> {
    return this.call('updateMetadata', { id, ...update });
  }

  updateSettings(update: Partial<ClientSettings>): Promise<ClientSettings> {
    return this.call('updateSettings', update);
  }

  dismissAlert(id: string): Promise<void> {
    return this.call('dismissAlert', { id });
  }

  shutdown(): Promise<void> {
    return this.call('shutdown');
  }

  private async call<T>(method: RpcMethod, params?: unknown): Promise<T> {
    try {
      return await this.callOnce<T>(method, params);
    } catch (error) {
      if (!(error instanceof DaemonConnectionError) || !RETRYABLE_METHODS.has(method)) throw error;
      await delay(RETRY_DELAY_MS);
      return this.callOnce<T>(method, params);
    }
  }

  private callOnce<T>(method: RpcMethod, params?: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const socket = net.createConnection({
        host: this.connection.host,
        port: this.connection.port,
      });
      socket.setEncoding('utf8');
      socket.setTimeout(CONNECT_TIMEOUT_MS, () =>
        socket.destroy(new DaemonConnectionError('Daemon timed out.')),
      );
      let buffer = '';
      socket.once('connect', () => {
        socket.write(
          `${JSON.stringify({ id: randomUUID(), token: this.connection.token, method, params })}\n`,
        );
      });
      socket.on('data', (chunk) => (buffer += String(chunk)));
      socket.once('error', (error) =>
        reject(
          error instanceof DaemonConnectionError ? error : new DaemonConnectionError(error.message),
        ),
      );
      socket.once('end', () => {
        if (!buffer.trim()) {
          reject(new DaemonConnectionError('Daemon closed the connection without a response.'));
          return;
        }
        try {
          const response = JSON.parse(buffer.trim()) as RpcResponse;
          if (!response.ok) {
            const error = new UserError(response.error?.message ?? 'Daemon request failed.');
            error.name = response.error?.name ?? 'DaemonError';
            reject(error);
            return;
          }
          resolve(response.result as T);
        } catch (error) {
          reject(
            new DaemonConnectionError(
              error instanceof Error ? error.message : 'Daemon returned an invalid response.',
            ),
          );
        }
      });
    });
  }
}

export async function connectToDaemon(options: { start?: boolean } = {}): Promise<DaemonClient> {
  const existing = await readConnection();
  if (existing) {
    const client = new DaemonClient(existing);
    try {
      await client.ping();
      return client;
    } catch {
      // Preserve discovery information while the owning process is still alive. A busy daemon
      // can recover; deleting its connection file would prevent every client from reconnecting.
      if (!processIsRunning(existing.pid)) {
        await rm(getAppPaths().connectionFile, { force: true });
      }
    }
  }
  if (options.start === false) throw new UserError('The bittorrent-cli daemon is not running.');

  if (!(await daemonIsStarting())) await startDetachedDaemon();
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const connection = await readConnection();
    if (!connection) continue;
    const client = new DaemonClient(connection);
    try {
      await client.ping();
      return client;
    } catch {
      // The daemon may still be binding its socket.
    }
  }
  throw new UserError(`The daemon did not start within ${START_TIMEOUT_MS / 1000} seconds.`);
}

async function readConnection(): Promise<ConnectionInfo | undefined> {
  try {
    return JSON.parse(await readFile(getAppPaths().connectionFile, 'utf8')) as ConnectionInfo;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return undefined;
  }
}

async function daemonIsStarting(): Promise<boolean> {
  const { lockFile } = getAppPaths();
  try {
    const lock = JSON.parse(await readFile(lockFile, 'utf8')) as { pid?: number };
    if (!lock.pid) {
      await rm(lockFile, { force: true });
      return false;
    }
    if (processIsRunning(lock.pid)) return true;
    await rm(lockFile, { force: true });
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') await rm(lockFile, { force: true });
    return false;
  }
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

async function startDetachedDaemon(): Promise<void> {
  const compiledEntry = fileURLToPath(new URL('../cli.js', import.meta.url));
  const sourceEntry = fileURLToPath(new URL('../cli.tsx', import.meta.url));
  const runningFromSource = import.meta.url.endsWith('.ts');
  const entry = runningFromSource ? sourceEntry : compiledEntry;
  const { reports } = getAppPaths();
  await mkdir(reports, { recursive: true });
  const reportArgs = [
    '--report-on-fatalerror',
    '--report-uncaught-exception',
    `--report-directory=${reports}`,
  ];
  const args = runningFromSource
    ? [...reportArgs, '--import', 'tsx', entry, 'daemon', '--foreground']
    : [...reportArgs, entry, 'daemon', '--foreground'];
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, BITTORRENT_CLI_DAEMON: '1' },
  });
  child.unref();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
