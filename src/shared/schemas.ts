import { z } from 'zod';

export const clientSettingsSchema = z.object({
  downloadPath: z.string().min(1),
  maxConnections: z.number().int().min(1).max(10_000),
  downloadLimit: z.number().int().min(-1),
  uploadLimit: z.number().int().min(-1),
  dht: z.boolean(),
  pex: z.boolean(),
  lsd: z.boolean(),
  upnp: z.boolean(),
  natPmp: z.boolean(),
  utp: z.boolean(),
  autoStart: z.boolean(),
  seedRatioLimit: z.number().min(0),
  seedTimeLimitMinutes: z.number().int().min(0),
  theme: z.enum(['dark', 'light']),
  refreshIntervalMs: z.number().int().min(250).max(5_000),
});

export const persistedTorrentSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['download', 'seed']).default('download'),
  source: z.string().min(1),
  magnetUri: z.string().optional(),
  torrentFileBase64: z.string().optional(),
  path: z.string().min(1),
  paused: z.boolean(),
  sequential: z.boolean(),
  category: z.string(),
  tags: z.array(z.string()),
  selectedFiles: z.array(z.number().int().min(0)).optional(),
  addedAt: z.string(),
  completedAt: z.string().optional(),
});

export const sessionDataSchema = z.object({
  version: z.literal(1),
  torrents: z.array(persistedTorrentSchema),
});
