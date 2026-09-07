/**
 * App color palette — light and dark variants.
 *
 * All colors live here. To restyle the whole app, change values in this file.
 * Access via useTheme() hook: const { colors } = useTheme();
 *
 * Palette matches real-asset-app-concept-design: warm cream surfaces,
 * deep petrol-blue primary, amber accent, red reserved for destructive.
 */

export const lightColors = {
  // ── Backgrounds ──────────────────────────────────────────────────────────
  background: '#eeeae5',
  surface: '#ffffff',
  surfaceSecondary: '#e2dbd0',

  // ── Brand / Primary (deep navy, matches demo.html --navy) ─────────────────
  primary: '#12425c',
  primaryLight: '#c1d7ea',
  /** BENi gold — brand accent (e.g. the dashboard subheading) */
  gold: '#BE9B57',

  // ── Text ─────────────────────────────────────────────────────────────────
  textPrimary: '#12425c',
  textSecondary: '#26323a',
  textMuted: '#5d6b75',
  textDisabled: '#afa39d',
  textInverse: '#eeeae5',

  // ── Borders & Dividers ────────────────────────────────────────────────────
  border: '#e2dbd0',
  borderLight: '#eeeae5',

  // ── Action / Status Colors ────────────────────────────────────────────────
  /** Green — add, save, confirm */
  success: '#2e9e5b',
  successLight: '#e2f0e8',
  /** Red — delete, destructive */
  danger: '#cf5a4e',
  dangerDisabled: '#f2c4bd',
  /** Navy-soft — upload, info, links */
  info: '#1c5575',
  infoLight: '#c1d7ea',
  /** Amber — warnings, highlights */
  warning: '#d99a2b',

  // ── Task Urgency Indicators ───────────────────────────────────────────────
  urgencyPast: '#cf5a4e',    // overdue
  urgencyMonth: '#d99a2b',   // due within 30 days
  urgencyFuture: '#2e9e5b',  // more than 30 days away
  urgencyNone: '#d9ccb8',    // no due date

  // ── Severity Badges (maintenance-plan task cards) ─────────────────────────
  severityCriticalBg: '#f8e0dc',
  severityCriticalText: '#b5392c',
  severityModerateBg: '#f7ecd6',
  severityModerateText: '#8a6a1e',
  severityMinorBg: '#e7edf2',
  severityMinorText: '#3f5a6d',

  // ── Header / Sidebar (navy gradient, matches demo.html dashboard sidebar) ─
  headerBg: '#12425c',
  headerBorder: '#1c5575',
  headerText: '#eeeae5',
  headerTextMuted: '#a9c2d1',
  headerActiveBg: '#1c5575',
  /** Cream/blue accent for the active nav item + logo tagline */
  headerAccent: '#c1d7ea',

  // ── Scrollbar ────────────────────────────────────────────────────────────
  scrollTrack: '#e2dbd0',
  scrollThumb: '#9a8459',

  // ── Property Card ────────────────────────────────────────────────────────
  propertyBackdrop: '#12425c',

  // ── Inputs ────────────────────────────────────────────────────────────────
  inputBorder: '#e2dbd0',
  inputBackground: '#ffffff',
  inputPlaceholder: '#afa39d',

  // ── Overlay ───────────────────────────────────────────────────────────────
  overlay: 'rgba(13, 49, 68, 0.45)',
};

export const darkColors: typeof lightColors = {
  // ── Backgrounds ──────────────────────────────────────────────────────────
  background: '#131c20',
  surface: '#192429',
  surfaceSecondary: '#253137',

  // ── Brand / Primary ───────────────────────────────────────────────────────
  primary: '#59a6c0',
  primaryLight: '#1b2e37',
  /** BENi gold — brand accent (e.g. the dashboard subheading) */
  gold: '#BE9B57',

  // ── Text ─────────────────────────────────────────────────────────────────
  textPrimary: '#efebe7',
  textSecondary: '#e7e0da',
  textMuted: '#988c81',
  textDisabled: '#6e665e',
  textInverse: '#131c20',

  // ── Borders & Dividers ────────────────────────────────────────────────────
  border: '#29363d',
  borderLight: '#192429',

  // ── Action / Status Colors ────────────────────────────────────────────────
  success: '#498d76',
  successLight: '#1f332c',
  danger: '#a5453a',
  dangerDisabled: '#5c1f1f',
  info: '#3d7a8f',
  infoLight: '#1e3238',
  warning: '#c98a2e',

  // ── Task Urgency Indicators ───────────────────────────────────────────────
  urgencyPast: '#dc2828',
  urgencyMonth: '#f59e0b',
  urgencyFuture: '#59a68c',
  urgencyNone: '#49545a',

  // ── Severity Badges (maintenance-plan task cards) ─────────────────────────
  severityCriticalBg: '#3a2320',
  severityCriticalText: '#e8938a',
  severityModerateBg: '#362d1c',
  severityModerateText: '#e0c07f',
  severityMinorBg: '#212d33',
  severityMinorText: '#a9c2d1',

  // ── Header / Sidebar (dark petrol nav, like the concept sidebar) ─────────
  headerBg: '#0e161b',
  headerBorder: '#223239',
  headerText: '#efebe7',
  headerTextMuted: '#8f9ca3',
  headerActiveBg: '#1d2930',
  headerAccent: '#59a6c0',

  // ── Scrollbar ────────────────────────────────────────────────────────────
  scrollTrack: '#29363d',
  scrollThumb: '#988c81',

  // ── Property Card ────────────────────────────────────────────────────────
  propertyBackdrop: '#173945',

  // ── Inputs ────────────────────────────────────────────────────────────────
  inputBorder: '#29363d',
  inputBackground: '#253137',
  inputPlaceholder: '#6e665e',

  // ── Overlay ───────────────────────────────────────────────────────────────
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export type Colors = typeof lightColors;
