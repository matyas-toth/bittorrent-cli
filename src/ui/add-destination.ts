import path from 'node:path';

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function suggestDestinationPath(defaultPath: string, source: string): string {
  const name = torrentDisplayName(source);
  return name ? path.join(defaultPath, name) : defaultPath;
}

function torrentDisplayName(source: string): string | undefined {
  const trimmed = source.trim();
  if (!trimmed || /^[a-f\d]{40}$/i.test(trimmed)) return undefined;

  let candidate: string | undefined;
  if (/^magnet:/i.test(trimmed)) {
    try {
      candidate = new URL(trimmed).searchParams.get('dn') ?? undefined;
    } catch {
      return undefined;
    }
  } else if (/^https?:\/\//i.test(trimmed)) {
    try {
      candidate = basenameForEitherPlatform(new URL(trimmed).pathname);
    } catch {
      return undefined;
    }
  } else {
    candidate = basenameForEitherPlatform(trimmed);
  }

  if (!candidate) return undefined;
  const decoded = safeDecode(candidate).replace(/\.torrent$/i, '');
  const printable = Array.from(decoded)
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('');
  const safe = printable
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[ .]+$/g, '')
    .trim();
  if (!safe) return undefined;
  return WINDOWS_RESERVED_NAME.test(safe) ? `_${safe}` : safe;
}

function basenameForEitherPlatform(value: string): string {
  return path.win32.basename(path.posix.basename(value));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
