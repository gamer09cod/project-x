/**
 * Visual tokens for the lobby shell. Money amounts still come from the server.
 */
export const colors = {
  bg: '#000000',
  bgAlt: '#0A0A0C',
  surface: '#141416',
  surfaceElevated: '#1C1C1E',
  border: 'rgba(255, 255, 255, 0.08)',
  cta: '#FF4500',
  cash: '#00E676',
  cashDim: '#064e3b',
  cashDeep: '#022c22',
  streak: '#FF9500',
  fail: '#FF3B30',
  badge: '#FF3B30',
  textPrimary: '#FFFFFF',
  textMuted: '#8E8E93',
  textTertiary: '#636366',
  prizeFill: '#22D3EE',
  overlay: 'rgba(0, 0, 0, 0.72)',
} as const;

export const radii = {
  card: 16,
  cardLg: 24,
  thumb: 12,
  pill: 999,
} as const;

export const type = {
  hero: {fontSize: 44, fontWeight: '800' as const, color: colors.textPrimary},
  title: {fontSize: 22, fontWeight: '700' as const, color: colors.textPrimary},
  body: {fontSize: 14, fontWeight: '400' as const, color: colors.textMuted},
  label: {fontSize: 12, fontWeight: '600' as const, color: colors.textMuted},
} as const;

export const space = {
  screen: 16,
  gap: 12,
} as const;
