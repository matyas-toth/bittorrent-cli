import { readFile, rm } from 'node:fs/promises';
import { writeJsonAtomic } from './json-store.js';
import { log, logError } from './logger.js';
import { getAppPaths } from './paths.js';
import { VERSION } from '../shared/constants.js';

const HEARTBEAT_INTERVAL_MS = 5_000;

interface HeartbeatRecord {
  pid: number;
  startedAt: string;
  timestamp: string;
  version: string;
}

export class DaemonHeartbeat {
  private timer?: NodeJS.Timeout;
  private writeQueue: Promise<void> = Promise.resolve();
  private record?: HeartbeatRecord;

  async start(startedAt: string): Promise<void> {
    const previous = await readPreviousHeartbeat();
    if (previous) {
      await log(
        'WARN',
        `Previous daemon pid ${previous.pid} stopped without a clean shutdown; last heartbeat ${previous.timestamp}`,
      );
    }

    this.record = {
      pid: process.pid,
      startedAt,
      timestamp: new Date().toISOString(),
      version: VERSION,
    };
    try {
      await this.write();
    } catch (error) {
      logError('Daemon heartbeat', error);
    }
    this.timer = setInterval(() => this.enqueueWrite(), HEARTBEAT_INTERVAL_MS);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    try {
      await this.writeQueue;
      await rm(getAppPaths().heartbeatFile, { force: true });
    } catch (error) {
      logError('Remove daemon heartbeat', error);
    }
  }

  private enqueueWrite(): void {
    this.writeQueue = this.writeQueue
      .then(() => this.write())
      .catch((error: unknown) => {
        logError('Daemon heartbeat', error);
      });
  }

  private async write(): Promise<void> {
    if (!this.record) return;
    this.record.timestamp = new Date().toISOString();
    await writeJsonAtomic(getAppPaths().heartbeatFile, this.record);
  }
}

async function readPreviousHeartbeat(): Promise<HeartbeatRecord | undefined> {
  try {
    const value = JSON.parse(
      await readFile(getAppPaths().heartbeatFile, 'utf8'),
    ) as Partial<HeartbeatRecord>;
    if (
      typeof value.pid !== 'number' ||
      typeof value.startedAt !== 'string' ||
      typeof value.timestamp !== 'string' ||
      typeof value.version !== 'string'
    ) {
      return undefined;
    }
    return value as HeartbeatRecord;
  } catch {
    return undefined;
  }
}
