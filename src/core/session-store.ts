import type { SessionData } from '../shared/types.js';
import { sessionDataSchema } from '../shared/schemas.js';
import { getAppPaths } from './paths.js';
import { readValidatedJson, writeJsonAtomic } from './json-store.js';

const emptySession: SessionData = { version: 1, torrents: [] };

export function loadSession(): Promise<SessionData> {
  return readValidatedJson(getAppPaths().sessionFile, sessionDataSchema, emptySession);
}

export function saveSession(session: SessionData): Promise<void> {
  return writeJsonAtomic(getAppPaths().sessionFile, session);
}
