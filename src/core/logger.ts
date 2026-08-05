import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getAppPaths } from './paths.js';
import { errorMessage } from '../shared/errors.js';

export async function log(level: 'INFO' | 'WARN' | 'ERROR', message: string): Promise<void> {
  const { logFile } = getAppPaths();
  try {
    await mkdir(path.dirname(logFile), { recursive: true });
    await appendFile(logFile, `${new Date().toISOString()} ${level} ${message}\n`);
  } catch {
    // Logging must never take down the daemon.
  }
}

export function logError(context: string, error: unknown): void {
  void log('ERROR', `${context}: ${errorMessage(error)}`);
}
