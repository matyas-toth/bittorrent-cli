export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 100 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatPercent(value: number): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

export function formatEta(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds < 0) return '∞';
  if (milliseconds === 0) return 'done';
  const seconds = Math.ceil(milliseconds / 1000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

export function formatDuration(milliseconds: number): string {
  return formatEta(milliseconds);
}

export function sparkline(values: number[], width: number): string {
  const bars = '▁▂▃▄▅▆▇█';
  const visible = values.slice(-Math.max(1, width));
  const max = Math.max(...visible, 1);
  const prefix = ' '.repeat(Math.max(0, width - visible.length));
  return `${prefix}${visible
    .map((value) => bars[Math.min(bars.length - 1, Math.floor((value / max) * bars.length))])
    .join('')}`;
}

export function truncateMiddle(value: string, width: number): string {
  if (width <= 0) return '';
  if (value.length <= width) return value.padEnd(width);
  if (width < 4) return value.slice(0, width);
  const left = Math.ceil((width - 1) / 2);
  const right = Math.floor((width - 1) / 2);
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}
