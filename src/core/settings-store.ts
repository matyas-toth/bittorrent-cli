import type { ClientSettings } from '../shared/types.js';
import { clientSettingsSchema } from '../shared/schemas.js';
import { defaultDownloadPath, getAppPaths } from './paths.js';
import { readValidatedJson, writeJsonAtomic } from './json-store.js';

export const defaultSettings: ClientSettings = {
  downloadPath: defaultDownloadPath(),
  maxConnections: 100,
  downloadLimit: -1,
  uploadLimit: -1,
  dht: true,
  pex: true,
  lsd: true,
  upnp: true,
  natPmp: true,
  utp: true,
  autoStart: true,
  seedRatioLimit: 0,
  seedTimeLimitMinutes: 0,
  theme: 'dark',
  refreshIntervalMs: 750,
};

export async function loadSettings(): Promise<ClientSettings> {
  return readValidatedJson(getAppPaths().settingsFile, clientSettingsSchema, defaultSettings);
}

export async function saveSettings(settings: ClientSettings): Promise<void> {
  await writeJsonAtomic(getAppPaths().settingsFile, clientSettingsSchema.parse(settings));
}
