// Available Jobs styles. Moved verbatim from AvailableJobsScreen.tsx.
// Includes some legacy entries (heroCard, dutyPill, search bar, category
// chips, workloadStrip) whose former UI sections were removed upstream;
// they are kept so no imported style key can go missing.
import { StyleSheet } from 'react-native';
import { colors, fonts, shadows } from '../../../theme';

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 },
  centerWrap: { width: '100%', maxWidth: 640,
alignSelf: 'center' },
  // Dark header matching Make file design
  protoHeader: { backgroundColor: colors.dark, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, marginHorizontal: -16, marginTop: -12, marginBottom: 16 },
  protoHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 },
  protoKicker: { color: colors.muted, fontSize: 13, fontFamily: fonts.regular },
  protoName: { color: colors.white, fontSize: 24, fontFamily: fonts.extraBold, letterSpacing: -0.4, marginTop: 2 },
  protoBell: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  protoIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  protoHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 },
  // Service area: label over value, both flush right so the column lines up
  // with the bell beside it.
  serviceAreaBlock: { alignItems: 'flex-end', maxWidth: 118, flexShrink: 1 },
  serviceAreaLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.regular },
  serviceAreaValue: { color: colors.white, fontSize: 14, fontFamily: fonts.bold, marginTop: 1 },
  protoAvatar: { width: 42, height: 42, borderRadius: 21 },
  protoAvatarFallback: { backgroundColor: colors.tech, alignItems: 'center', justifyContent: 'center' },
  protoAvatarText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold },
  // The two cards double as the Available/Assigned feed tabs.
  protoStatsRow: { flexDirection: 'row', gap: 12 },
  protoStat: { flex: 1, flexDirection: 'row', gap: 7, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  protoStatActive: { backgroundColor: colors.tech },
  protoStatValue: { color: colors.white, fontSize: 22, fontFamily: fonts.extraBold, fontVariant: ['tabular-nums'] },
  protoStatLabel: { color: colors.muted, fontSize: 13, fontFamily: fonts.semiBold },
  protoStatLabelActive: { color: colors.white, fontFamily: fonts.bold },
  // Count chip next to the label: readable, but still lighter than the label.
  protoStatBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  protoStatBadgeActive: { backgroundColor: colors.white },
  protoStatBadgeText: { color: '#D1D5DB', fontSize: 11, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  protoStatBadgeTextActive: { color: colors.tech },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  brandLeft: { flex: 1, minWidth: 0 },
  brandTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandSmall: {
    color: colors.ink,
    fontSize: 18,
    fontFamily: fonts.extraBold,
    letterSpacing: -0.4,
    lineHeight: 22
  },
  brandAccent: { color: colors.tech, fontFamily: fonts.extraBold },
  dispatchPill: {
    backgroundColor: colors.techSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.hudBorder
  },
  dispatchPillText: {
    color: colors.techDark,
    fontSize: 9,
    fontFamily: fonts.bold,
    letterSpacing: 0.8
  },
  roleSmall: {
    color: colors.muted,
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1.1,
    marginTop: 2
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  dutyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 18,
    borderWidth: 1
  },
  dutyPillOnline: { backgroundColor: colors.techSoft, borderColor: colors.hudBorder },
  dutyPillOffline: { backgroundColor: colors.white, borderColor: colors.line },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotOnline: { backgroundColor: colors.green },
  statusDotOffline: { backgroundColor: colors.muted },
  dutyPillText: { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.5 },
  dutyTextOnline: { color: colors.techDark },
  dutyTextOffline: { color: colors.muted },

  notificationQuiet: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.subtle
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.white
  },
  notifBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontFamily: fonts.extraBold,
    fontVariant: ['tabular-nums']
  },

  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
    ...shadows.subtle
  },
  heroLeft: { flex: 1, paddingRight: 10, minWidth: 0 },
  greeting: {
    color: colors.ink,
    fontSize: 20,
    fontFamily: fonts.extraBold,
    letterSpacing: -0.4,
    lineHeight: 24,
    marginBottom: 4
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.medium,
    lineHeight: 16,
    marginBottom: 10
  },
  heroMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  heroMetricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line
  },
  heroMetricText: {
    color: colors.ink,
    fontSize: 11,
    fontFamily: fonts.semiBold,
    fontVariant: ['tabular-nums']
  },
  avatarWrap: {
    position: 'relative',
    marginLeft: 8
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.techSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hudBorder
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hudBorder
  },
  avatarText: { color: colors.techDark, fontSize: 18, fontFamily: fonts.bold },
  avatarPresenceDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.white
  },
  presenceOnline: {
    backgroundColor: colors.green
  },
  presenceOffline: {
    backgroundColor: '#94A3B8'
  },

  workloadStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1
  },
  workloadStripBusy: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  workloadStripAtCapacity: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  workloadTitle: { fontSize: 13, fontFamily: fonts.bold, marginBottom: 2 },
  workloadSub: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, lineHeight: 16 },

  queueControlSection: { marginBottom: 12 },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    height: '100%',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.ink
  },

  categoryScroll: { gap: 8, paddingBottom: 6 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line
  },
  categoryChipSelected: {
    backgroundColor: colors.tech,
    borderColor: colors.tech
  },
  categoryChipText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.techDark
  },
  categoryChipTextSelected: { color: colors.white },

  queueMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginTop: 4
  },
  queueMetaText: { fontSize: 11, fontFamily: fonts.medium, color: colors.muted },
  queueMetaCount: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.techDark,
    fontVariant: ['tabular-nums']
  },

  feedListContainer: { gap: 12 },

  jobCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    ...shadows.card
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10
  },
  applianceAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.techSoft,
    borderWidth: 1,
    borderColor: colors.hudBorder,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  cardTitleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.2
  },
  customerNameText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.muted
  },

  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.techSoft,
    borderWidth: 1,
    borderColor: colors.hudBorder,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  distanceBadgeText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.techDark,
    fontVariant: ['tabular-nums']
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1
  },
  statusPillText: { fontSize: 10, fontFamily: fonts.bold },

  privacyShieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 10
  },
  privacyShieldText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.techDark,
    flex: 1
  },

  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap'
  },
  schedulePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.canvas,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  schedulePillText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.techDark,
    fontVariant: ['tabular-nums']
  },
  issueBox: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    marginBottom: 12
  },
  issueText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.ink,
    lineHeight: 17
  },

  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSunken,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12
  },
  stepItem: { alignItems: 'center', gap: 3 },
  stepCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepCircleDone: { backgroundColor: colors.tech },
  stepCirclePending: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line },
  stepLabel: { fontSize: 9, fontFamily: fonts.medium, color: colors.muted },
  stepLabelDone: { color: colors.techDark, fontFamily: fonts.bold },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.line,
    marginHorizontal: 4,
    marginTop: -10
  },
  stepLineDone: { backgroundColor: colors.tech },

  cardDetailsBox: {
    backgroundColor: colors.canvas,
    borderRadius: 12,
    padding: 10,
    gap: 6,
    marginBottom: 12
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { flex: 1, fontSize: 12, fontFamily: fonts.medium, color: colors.ink },
  detailTextSchedule: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.techDark,
    fontVariant: ['tabular-nums']
  },
  problemSnippetBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft
  },
  problemSnippetText: { flex: 1, fontSize: 11, fontFamily: fonts.regular, color: colors.muted, lineHeight: 16 },

  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  utilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft
  },
  utilityIcons: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  primaryBtn: {
    flex: 1,
    minWidth: 120,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.tech,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    ...shadows.card
  },
  primaryBtnText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.white
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 6,
    minHeight: 48
  },
  secondaryBtnText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.ink
  },
  dangerOutlineBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.danger + '40',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48
  },
  dangerOutlineText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.danger
  },
  completeBtn: {
    flex: 1,
    minWidth: 150,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.tech,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    ...shadows.card
  },
  iconCompanion: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.techSoft,
    borderWidth: 1,
    borderColor: colors.hudBorder,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48
  },

  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    ...shadows.subtle
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.techSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hudBorder
  },
  emptyTextContainer: { alignItems: 'center', gap: 4 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  emptyCopy: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18
  },
  emptyActionBtn: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.techSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyActionBtnText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.techDark
  },

  errorCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
    ...shadows.subtle
  },
  errorTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink, marginTop: 8 },
  errorText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12
  },
  offlineBannerText: { flex: 1, fontSize: 11, fontFamily: fonts.medium, color: colors.muted },
  offlineRetryText: { fontSize: 12, fontFamily: fonts.bold, color: colors.tech },
  acceptErrorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12 },
  acceptErrorText: { flex: 1, fontSize: 12, fontFamily: fonts.semiBold, color: '#B91C1C', lineHeight: 17 },
  confirmBackdrop: { flex: 1, backgroundColor: 'rgba(13,27,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmCard: { width: '100%', maxWidth: 360, backgroundColor: colors.white, borderRadius: 18, padding: 20 },
  confirmTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  confirmCopy: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.ink, marginTop: 8 },
  confirmSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.muted, marginTop: 4 },
  confirmNote: { fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 10, lineHeight: 17 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  confirmCancel: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  confirmCancelText: { fontSize: 14, fontFamily: fonts.bold, color: colors.muted },
  confirmAccept: { flex: 2, marginTop: 0 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 42, 67, 0.45)',
    justifyContent: 'flex-end'
  },
  detailsSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: '85%'
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: 12
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: 12
  },
  sheetKicker: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.techDark,
    letterSpacing: 1.2,
    marginBottom: 2
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.ink
  },
  sheetCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sheetSection: { marginBottom: 16 },
  sheetSectionLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.muted,
    letterSpacing: 1,
    marginBottom: 6
  },
  sheetInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  sheetInfoText: { fontSize: 13, fontFamily: fonts.medium, color: colors.ink },
  sheetBodyText: { fontSize: 13, fontFamily: fonts.regular, color: colors.ink, lineHeight: 19 },
  sheetActionRow: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },

  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    width: '100%',
    ...shadows.hud
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  modalKicker: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.techDark,
    letterSpacing: 1.2,
    marginBottom: 2
  },
  modalTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.ink },
  modalCloseTarget: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalDesc: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginBottom: 18,
    lineHeight: 18
  },
  pinBoxesContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16
  },
  pinBox: {
    width: 54,
    height: 58,
    borderRadius: 14,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pinBoxFilled: {
    borderColor: colors.tech,
    backgroundColor: colors.white
  },
  pinBoxActive: {
    borderColor: colors.techDark,
    borderWidth: 2
  },
  pinDigit: {
    fontSize: 24,
    fontFamily: fonts.extraBold,
    color: colors.ink,
    fontVariant: ['tabular-nums']
  },
  hiddenPinInput: {
    position: 'absolute',
    opacity: 0.01,
    width: 1,
    height: 1
  },
  otpVisibleInput: {
    borderWidth: 1.5,
    borderColor: colors.tech,
    borderRadius: 12,
    backgroundColor: colors.white,
    minHeight: 48,
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.ink,
    marginBottom: 8,
    paddingHorizontal: 12,
  },

  pressedSoft: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.96 }
});
