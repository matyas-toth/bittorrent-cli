import { extendTheme, defaultTheme } from '@inkjs/ui';

export const appTheme = extendTheme(defaultTheme, {
  components: {
    Badge: {
      styles: {
        container: () => ({ backgroundColor: 'blue' }),
      },
    },
  },
});

export const colors = {
  accent: '#67e8f9',
  accentStrong: '#22d3ee',
  muted: '#94a3b8',
  subtle: '#475569',
  surface: '#111827',
  downloading: '#4ade80',
  seeding: '#60a5fa',
  paused: '#fb923c',
  error: '#f87171',
  complete: '#a78bfa',
} as const;
