import path from 'node:path';
import os from 'node:os';
import envPaths from 'env-paths';

const resolved = envPaths('bittorrent-cli', { suffix: '' });

export interface AppPaths {
  data: string;
  config: string;
  cache: string;
  logs: string;
  settingsFile: string;
  sessionFile: string;
  connectionFile: string;
  lockFile: string;
  heartbeatFile: string;
  logFile: string;
  reports: string;
}

export function getAppPaths(): AppPaths {
  const dataOverride = process.env.BITTORRENT_CLI_DATA_DIR;
  const configOverride = process.env.BITTORRENT_CLI_CONFIG_DIR;
  const data = dataOverride ? path.resolve(dataOverride) : resolved.data;
  const config = configOverride ? path.resolve(configOverride) : resolved.config;
  const logs = dataOverride ? path.join(data, 'logs') : resolved.log;

  return {
    data,
    config,
    cache: dataOverride ? path.join(data, 'cache') : resolved.cache,
    logs,
    settingsFile: path.join(config, 'settings.json'),
    sessionFile: path.join(data, 'session.json'),
    connectionFile: path.join(data, 'daemon.json'),
    lockFile: path.join(data, 'daemon.lock'),
    heartbeatFile: path.join(data, 'daemon-heartbeat.json'),
    logFile: path.join(logs, 'daemon.log'),
    reports: path.join(logs, 'reports'),
  };
}

export function defaultDownloadPath(): string {
  return path.join(os.homedir(), 'Downloads');
}
