// Shared Home stylesheet. Moved verbatim from app/(tabs)/index.tsx (I0 Home split) so
// the extracted components render byte-identically — no keys renamed, split, or dropped.
import { StyleSheet } from 'react-native';

import { colors, dark as D } from '@/ui/theme';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: D.bg,
  },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { fontSize: 14, color: D.muted, marginTop: 12 },

  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
    zIndex: 0,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 4,
  },
  dateLabel: {
    fontSize: 12,
    letterSpacing: 1.6,
    color: D.label,
    fontWeight: '600',
  },
  syncOk: {
    fontSize: 10,
    color: D.green,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  syncPending: {
    fontSize: 10,
    color: D.muted,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  greeting: {
    fontSize: 27,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
    marginTop: 3,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,170,70,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,170,70,0.25)',
    marginTop: 4,
  },
  streakDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ffb454',
  },
  streakNum: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffd08a',
  },
  streakTxt: {
    fontSize: 12,
    color: 'rgba(255,208,138,0.75)',
  },

  // Cards
  card: {
    backgroundColor: D.card,
    borderWidth: 1,
    borderColor: D.border,
    borderRadius: 28,
    marginBottom: 16,
    alignItems: 'center',
    padding: 22,
  },
  sectionInCard: {
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: D.label,
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginBottom: 16,
  },

  // Cal ring
  ringWrap: {
    position: 'relative',
    width: 232,
    height: 232,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringEyebrow: {
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: D.label,
    fontWeight: '600',
  },
  ringKcal: {
    fontSize: 54,
    fontWeight: '600',
    color: '#ffffff',
    lineHeight: 58,
    letterSpacing: -1,
    marginTop: 2,
  },
  ringTarget: {
    fontSize: 14,
    color: D.muted,
  },
  goalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: 14,
  },
  goalPillOk: {
    backgroundColor: 'rgba(255,170,70,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,170,70,0.20)',
  },
  goalPillPending: {
    backgroundColor: `${D.accent}18`,
    borderWidth: 1,
    borderColor: `${D.accent}30`,
  },
  goalText: {
    fontSize: 13.5,
    color: '#ffd9a8',
    fontWeight: '500',
  },
  goalTextPending: {
    fontSize: 13.5,
    color: D.accent2,
    fontWeight: '500',
  },

  // Macros
  macrosCard: {
    alignItems: 'stretch',
    paddingBottom: 8,
  },
  macroRow: {},
  macroRowGap: { marginBottom: 17 },
  macroHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  macroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  macroLabelTxt: {
    fontSize: 15,
    color: D.ink,
    fontWeight: '600',
  },
  overBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  overBadgeTxt: {
    fontSize: 11,
    fontWeight: '600',
  },
  macroVal: {
    fontSize: 14.5,
    color: D.ink,
    fontWeight: '600',
  },
  macroTargetTxt: {
    fontSize: 13,
    color: D.muted,
    fontWeight: '400',
  },
  macroTrack: {
    height: 8,
    borderRadius: 5,
    backgroundColor: D.trackBg,
    overflow: 'hidden',
  },
  macroFill: {
    height: '100%',
    borderRadius: 5,
    minWidth: 4,
  },

  // Section headings
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: D.label,
    fontWeight: '600',
    marginBottom: 12,
    paddingLeft: 2,
  },
  sectionLabelNoGap: {
    marginBottom: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: '600',
    color: D.amber,
  },

  // Month bars
  monthBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  monthBarCol: {
    flex: 1,
    alignItems: 'center',
  },
  monthBarTrack: {
    justifyContent: 'flex-end',
    width: '100%',
  },
  monthBar: {
    width: '100%',
    borderRadius: 3,
  },

  // Chips
  chipsRow: {
    flexDirection: 'row',
    gap: 9,
    paddingBottom: 4,
  },
  chipPrimary: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: `${D.accent}28`,
    borderWidth: 1,
    borderColor: `${D.accent}70`,
  },
  chipPrimaryText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#ffffff',
  },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: D.border,
  },
  chipText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#e9e9ee',
  },
  chipMuted: {
    color: D.muted,
  },

  // Trends
  trendsGrid: {
    flexDirection: 'row',
    gap: 13,
  },
  trendCard: {
    flex: 1,
    backgroundColor: D.card,
    borderWidth: 1,
    borderColor: D.border,
    borderRadius: 24,
    padding: 16,
    gap: 8,
  },
  trendLabel: {
    fontSize: 13,
    color: D.muted,
    fontWeight: '500',
  },
  trendValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  trendVal: {
    fontSize: 29,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  trendUnit: {
    fontSize: 13,
    color: D.muted,
  },

  // Week bars
  weekCard: {
    alignItems: 'stretch',
  },
  weekHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  weekStat: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  weekSub: {
    marginTop: 16,
    fontSize: 13,
    color: D.muted,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  barCol: {
    alignItems: 'center',
    gap: 8,
  },
  barTrack: {
    justifyContent: 'flex-end',
    width: 24,
  },
  bar: {
    width: 24,
  },
  barEmpty: {
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  barOver: {
    backgroundColor: colors.rose,
    borderRadius: 8,
  },
  barDayLabel: {
    fontSize: 11,
    color: D.label,
  },

  // Meals
  mealsCard: {
    alignItems: 'stretch',
    padding: 0,
    overflow: 'hidden',
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 15,
    paddingHorizontal: 18,
  },
  mealRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: D.divider,
  },
  mealDot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    fontSize: 15,
    fontWeight: '600',
    color: D.ink,
  },
  mealSub: {
    fontSize: 12,
    color: D.muted,
    marginTop: 1,
  },
  mealKcal: {
    fontSize: 15,
    fontWeight: '600',
    color: D.ink,
  },
  mealKcalUnit: {
    fontSize: 11,
    color: D.muted,
  },
  mealChevron: {
    fontSize: 18,
    color: 'rgba(235,235,245,0.3)',
    marginLeft: 2,
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: 14,
    paddingTop: 8,
  },
  footerLink: {
    fontSize: 15,
    fontWeight: '600',
    color: D.accent2,
  },
  footerMuted: {
    fontSize: 14,
    color: D.muted,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 62,
    height: 62,
    borderRadius: 31,
    overflow: 'hidden',
  },
  fabInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 31,
  },
  fabPlus: {
    fontSize: 28,
    color: '#ffffff',
    lineHeight: 30,
  },

  // Bottom sheet
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: 'rgba(22,22,27,0.97)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  sheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseX: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickTile: {
    width: '47.5%',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 11,
  },
  quickTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTileIconTxt: {
    fontSize: 20,
    lineHeight: 24,
  },
  quickTileLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  quickTileSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
  },
});
