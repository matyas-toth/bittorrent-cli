import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TorrentEngine } from './core/torrent-engine.js';
import { log, logError } from './core/logger.js';
import { getAppPaths } from './core/paths.js';
import { RpcServer } from './rpc/server.js';
import { DaemonHeartbeat } from './core/daemon-heartbeat.js';

export async function runDaemon(): Promise<void> {
  const { lockFile, reports } = getAppPaths();
  await mkdir(path.dirname(lockFile), { recursive: true });
  await mkdir(reports, { recursive: true });
  process.report.directory = reports;
  process.report.reportOnFatalError = true;
  process.report.reportOnUncaughtException = true;
  await writeFile(
    lockFile,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    {
      flag: 'wx',
      mode: 0o600,
    },
  );
  const engine = new TorrentEngine();
  const heartbeat = new DaemonHeartbeat();
  try {
    await heartbeat.start(engine.startedAt);
    await engine.start();
  } catch (error) {
    await heartbeat.stop();
    await rm(lockFile, { force: true });
    throw error;
  }
  let stopping = false;

  const stop = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await log('INFO', `Stopping after ${signal}`);
    try {
      await server.close();
      await engine.close();
      process.exitCode = 0;
    } catch (error) {
      logError('Daemon shutdown', error);
      process.exitCode = 1;
    } finally {
      await heartbeat.stop();
      await rm(lockFile, { force: true });
    }
  };

  const server = new RpcServer(engine, () => void stop('RPC request'));
  try {
    await server.listen();
  } catch (error) {
    try {
      await engine.close();
    } finally {
      await heartbeat.stop();
      await rm(lockFile, { force: true });
    }
    throw error;
  }
  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('uncaughtException', (error) => {
    logError('Uncaught exception', error);
    void stop('uncaught exception');
  });
  process.once('unhandledRejection', (error) => {
    logError('Unhandled rejection', error);
    void stop('unhandled rejection');
  });
}
