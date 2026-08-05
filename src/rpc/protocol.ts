import type {
  AddTorrentRequest,
  ClientSettings,
  SeedRequest,
  TorrentAction,
} from '../shared/types.js';

export interface RpcRequest {
  id: string;
  token: string;
  method: RpcMethod;
  params?: unknown;
}

export interface RpcResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { name: string; message: string };
}

export interface ConnectionInfo {
  version: 1;
  host: '127.0.0.1';
  port: number;
  token: string;
  pid: number;
  startedAt: string;
}

export type RpcMethod =
  | 'ping'
  | 'snapshot'
  | 'add'
  | 'seed'
  | 'action'
  | 'remove'
  | 'selectFiles'
  | 'updateMetadata'
  | 'updateSettings'
  | 'dismissAlert'
  | 'shutdown';

export interface RpcParams {
  add: AddTorrentRequest;
  seed: SeedRequest;
  action: { id: string; action: TorrentAction };
  remove: { id: string; deleteData: boolean };
  selectFiles: { id: string; indices: number[] };
  updateMetadata: { id: string; category?: string; tags?: string[] };
  updateSettings: Partial<ClientSettings>;
  dismissAlert: { id: string };
}
