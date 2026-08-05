import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatEta,
  formatPercent,
  sparkline,
  truncateMiddle,
} from '../src/ui/format.js';

describe('terminal formatting', () => {
  it('formats byte quantities using binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KiB');
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MiB');
  });

  it('formats progress and ETA defensively', () => {
    expect(formatPercent(0.425)).toBe('42.5%');
    expect(formatPercent(2)).toBe('100.0%');
    expect(formatEta(null)).toBe('∞');
    expect(formatEta(65_000)).toBe('1m 5s');
    expect(formatEta(3_665_000)).toBe('1h 1m');
  });

  it('keeps fixed-width output stable', () => {
    expect(truncateMiddle('abcdefghij', 7)).toBe('abc…hij');
    expect(truncateMiddle('abc', 5)).toBe('abc  ');
    expect(sparkline([0, 5, 10], 5)).toHaveLength(5);
  });
});
