# FixLink Mobile Design System — fixlink_Mobile_design.md
**Cebu Roosevelt Memorial Colleges — College of Computer Studies**  
*BSIT Capstone 2026 — FIXLINK: AN ALL-AROUND TECHNICIAN SERVICE PLATFORM*  
**Researchers:** Jonard Masong, James Robert Rojas, Edsiel Ursal — **Advisers:** Marjorie Reso, MIT | Dr. Jonel D. Gelig  
**Source of truth:** `mobile/src/theme.tsx` + `mobile/src/components/*` + `mobile/src/screens/*` + `mobile/src/navigation/AppNavigator.tsx` + `context/UI_WORKFLOW.md`

---

## 1. Design Philosophy
FixLink mobile is a **role-driven, high-contrast, outdoor-legible** service dispatch app. Customer and Technician share one Expo binary but diverge at `AppNavigator.tsx` into two navigation stacks. Aesthetic is *clean medical + industrial brutalist HUD*: soft `canvas` ground, white cards, teal brand, ink text, with telemetry accents (`hudGrid`, `hudBorder`, `surfaceSunken`) for maps/trackers. No payment UI (Cash-on-Service), no diagnostics — focus is matching, dispatch, live tracking, OTP handshake, and proof-of-work portfolio.

**Principles:**
- One codebase, two personas (customer vs technician) via `user.role`.
- Centralized Axios client `mobile/src/screens/services/api.tsx` (`API_BASE_URL http://${devHost}:5050/api`).
- Optimistic UI for notifications (badge `filter(!read).length` instant) + fire-and-forget `PUT` ; authoritative backend for workload/capacity.
- Reuse `serializeJob`/`getEligibleCandidates`/`techSchedule` helpers, never duplicate status logic.

---

## 2. Color System — Exact Hex (`mobile/src/theme.tsx:9-30`)

| Token | Hex | Usage |
|---|---|---|
| `ink` | `#102A43` | Primary text, titles, nav ink, hero ink |
| `teal` | `#0F766E` | Brand primary, CTA, active tab, `teal` buttons, `Available` workload, map polyline |
| `tealDark` | `#075E59` | Pressed teal, `workloadText` available variant |
| `tealLight` | `#E6F6F3` | Active tab bg, selected chip, `detailCard` bg, `checkmark` row |
| `canvas` | `#F5F8FA` | App ground across all screens (`screenContainer`) |
| `white` | `#FFFFFF` | Card, modal, header `white` surfaces |
| `muted` | `#3F5A6E` | Secondary text, placeholder, inactive tab, `techMetaText` |
| `line` | `#D9E2EC` | Card border, `borderTopColor`, divider |
| `lineSoft` | `#E3ECF2` | `rail` border |
| `error` | `#E53935` | Error text, `errorCard` icon |
| `danger` | `#DC2626` | `Decline`, `No-Show`, `danger` badge |
| `gold` | `#D97706` | Rating stars, `Busy` workload, `availBusyText` |
| `green` | `#059669` | `Completed` chip, `availOkText`, `donePill`, success |
| `orange` | `#F59E0B` | `star` filled (rating) |
| `hudGrid` | `rgba(15, 118, 110, 0.06)` | Map HUD grid overlay |
| `hudBorder` | `#CBE7E1` | Card `highlightedCard`, `acceptedCard` border |
| `accentAmber` | `#D97706` | Same as gold, alert accent |
| `accentBlue` | `#2563EB` | `Active Jobs` header, `progress` blue |
| `surfaceSunken` | `#FBFDFE` | Sunken input bg, `otpInput` |

**Derived tints** used as `color + '15'` (15% opacity bg) and `color + '40'` (border), e.g. `teal 15` for `statusBadge` bg.

---

## 3. Typography — Inter (`mobile/src/theme.tsx:1-7,32-38`)

Loaded via `expo-google-fonts/inter`:
- `Inter_400Regular` → `fonts.regular`
- `Inter_500Medium` → `fonts.medium`
- `Inter_600SemiBold` → `fonts.semiBold`
- `Inter_700Bold` → `fonts.bold`
- `Inter_800ExtraBold` → `fonts.extraBold`
- Mono for HUD numbers: `monoStack = 'monospace'`

**Scale (from `UI_WORKFLOW.md 2.2` + actual `styles`):**
- Brand wordmark `fixlink`: `18px extraBold, letterSpacing -0.3, ink + teal accent` (`DashboardScreen`)
- Display: `25–28px extraBold, -1.2px`
- Screen title: `22–24px bold, ink` (`sectionTitle`)
- Kicker/Overline: `10–11px bold/semiBold, letterSpacing 1.5px, teal, uppercase` (`kicker`, `panelKicker`)
- Card headline: `15–17px bold/semiBold, ink` (`applianceTitle`)
- Body: `13–14px regular/medium, lineHeight 19–20, ink/muted`
- Micro/Meta: `10–11px medium/semiBold, muted` (`metaText`, `noticeTime`, `pillText`)
- Tabular numbers: `fontVariant: ['tabular-nums']` for `distance`, `jobCode`, `ratings`

---

## 4. Spacing / Radii / Shadows (`mobile/src/theme.tsx:49-82`)

**Spacing:** `xs 6`, `sm 10`, `md 14`, `lg 20`, `xl 28`, `2xl 36`  
**Radii:** `xs 10`, `sm 12`, `md 14`, `lg 16`, `xl 20`, `2xl 22`, `3xl 24`, `pill 999`  
**Shadows:**
- `card: { boxShadow: '0 6px 14px rgba(16,42,67,0.06)', elevation: 3 }`
- `cardStrong: { boxShadow: '0 8px 16px rgba(16,42,67,0.08)', elevation: 4 }` (focused)
- `hud: { boxShadow: '0 12px 32px rgba(16,42,67,0.08)', elevation: 6 }`

Anti-slop press tokens: `pressed {scale 0.97, opacity 0.96}`, `pressedSoft {scale 0.97, opacity 0.94}`, `pressedCard {scale 0.98, opacity 0.97}` — transform+opacity only (GPU).

---

## 5. Iconography & Assets
- **Ionicons** (`@expo/vector-icons`) throughout: `home`, `receipt`, `chatbubble-ellipses`, `person`, `briefcase`, `map`, `construct`, `star`, `call`, `location-outline`, `calendar-outline`, `time-outline`, `checkmark`, `alert-circle-outline`, `key`, `navigate`, etc.
- **Appliance icons** via `mobile/src/utils/applianceIcons.tsx:getApplianceIcon(type)` → `refrigerator→snow`, `washing-machine→water`, `laptop→laptop`, `tv→tv`, `general→construct`, color via `getStatusColor(status)` + `getStatusIcon`.
- Portfolio images, Gov ID, TESDA cert, repair photo → `expo-image-picker` → `FormData` → `POST /api/auth/register` / `/api/users/:id/portfolio` → Supabase Storage bucket `fixlink`.

---

## 6. Component Library (`mobile/src/components/`)

| Component | File | Props / API | Visual |
|---|---|---|---|
| `AppButton` | `AppButton.tsx` | `title, onPress, variant teal/white/danger` | `minHeight 48, radius 14, teal bg white text, pressed 0.97` |
| `Skeleton` | `Skeleton.tsx` | `style {width,height,borderRadius}` | `canvas shimmer` for `Dashboard`, `RequestProgress`, `AvailableJobs`, `Chat` loading |
| `MessageBanner` | `MessageBanner.tsx` | `banner:{id,senderName,text}`, `onDismiss`, `onPress` | Top overlay, `ink` bg, teal icon, auto-dismiss 4.5s, `Vibration.vibrate(60)`, slide `translateY` |
| `LocationIQMap` | `LocationIQMap.tsx` | `customer {lat,lon}, technician {lat,lon}, status` | `WebView` Leaflet + LocationIQ tiles, `teal` polyline, house/wrench pins, HUD `3.4 km / 12 mins` |
| `DateTimePicker` / `.web` | `DateTimePicker.tsx` | `value, mode date/time, onChange` | Platform-adaptive, `teal` accent, `canvas` bg |
| `ApplianceIcons` | `utils/applianceIcons.tsx` | `getApplianceIcon, getStatusColor, getStatusIcon, getStatusGuidance, STEPS, PROGRESS_STEPS` | Centralizes color/icon per status |
| `AssistantSheet` | `components/AssistantSheet.tsx` | `visible, context, onClose` | AI chatbot bottom sheet. Per-user history key. Shared instance owned by `AppNavigator` |
| `ConversationInfoSheet` | `components/ConversationInfoSheet.tsx` | `visible, onClose` | Chat safety sheet with role accent and OTP reminder. Opened from `ChatScreen` |
| `PortfolioPhotoSheet` | `components/PortfolioPhotoSheet.tsx` | `visible, onClose, onSubmit` | Single photo plus required `repairType` and `model`. Auto `uploadedAt`. Used by `TechnicianProfileScreen` |
| `RecommendedTechSheet` | `components/RecommendedTechSheet.tsx` | `jobId, applianceType, visible` | AI match sheet backed by `GET /api/ai/recommend`. Shows rank, match percent, reason, workload, and skills. View Profile only |

**Shared molecule:** `StatusPill` (`backgroundColor color15, borderColor color40, gap 4, radius 999`), `MetaItem` (icon 14 muted + text 12 medium), `ProgressRail` (4 steps `Accepted/Confirmed/Ready/In Progress`, dots + lines).

---

## 7. Layout & Navigation

**Root:** `App.tsx` → `SafeAreaProvider` → `AppNavigator.tsx` (state-driven).

**Unauth stack:** `LoginScreen` ↔ `RegisterScreen` ↔ `ForgotPasswordScreen` ↔ `PasswordResetScreen` (deep link `fixlink://recovery`).

**Customer tabs (bottomNav):** `Home (dashboard)` | `Requests (progress + submit/details/map/techProfile)` | `Messages (chat)` | `Profile`.  
**Technician tabs:** `Jobs (jobs/map)` | `Map` | `Messages` | `Profile`.

**Patterns:**
- Screen container `flex:1, canvas` → `ScrollView contentContainer padding 20, paddingBottom 32, gap 14`, `RefreshControl tintColor teal`.
- Header `topBar` `flex row space-between`: brand + `HOME SERVICES` kicker + `notification` `width 44 radius 14 white border line` + badge `dot minWidth 18 teal/error, white text 9 extraBold`.
- BottomNav `height 52, white, borderTop line, navItem 65, navIcon 42x30 radius 12, navIconActive E6F6F3, label 10 semiBold`.
- Modals: `notificationPanel maxWidth 390 maxHeight 560 white radius 22 padding 20 hud shadow`, `detailCard F0FDFA border B2E2D8 radius 16`, `otpModalCard white radius 24`.

---

## 8. Screen Designs Prototype (Interactive Flow)

> Prototype traverses `AppNavigator.tsx` state: `customerTab` / `technicianTab` / `selectedRequest` / `selectedChatTarget` / `notificationsOpen` / `focusedJobId` / `highlightedJobId`. No external Figma link — implemented directly in Expo.

### 8.1 Login / Register / Forgot
- **Login:** `FIXLINK` ink + `LINK` teal `18 extraBold`, `HOME SERVICES` muted 9 `1.5`, email+password inputs (envelope icon), `Sign In` teal `48 radius14`, `Forgot Password?` teal link, `Don't have an account? Sign Up`.
- **Register:** Segment `[Customer|Technician]`, common fields, conditional `Skill Chips` (teal selected), `Gov ID` + `TESDA Cert` upload cards (`pickImage`), info banner `credentials will be verified`, CTA `Create Account` / `Submit Registration`.
- **Forgot/Reset:** Email input → `POST /api/auth/forgot-password` → email link `fixlink://recovery?token` → `PasswordResetScreen`.

### 8.2 Customer Dashboard (`DashboardScreen.tsx`)
- Hero `Good day, {firstName}` `26 extraBold ink` + `Let’s get your home back in shape.` `13.5 muted`, avatar `48 radius16 tealLight`, stats `Active/Pending/Completed` `22 extraBold tabular`, actions `New request` `teal` `172h 22 radius + add icon` + `Track a job` `white` `pulse icon`, `Recent requests` 2 cards `46 radius14 + pill status`, tip `FFF8E7 sparkles`.

### 8.3 Submit Request (`SubmitRequestScreen.tsx`)
- Drill-down `Category — Device` (`GET /api/users/platform/categories`), description textarea, photo picker (thumbnail + X), `Locate Me` (LocationIQ reverse) + address, `preferredDate/Time/scheduledDate`, submit `POST /api/requests` `multipart photo` → `Pending`.

### 8.4 Request Progress (`RequestProgressScreen.tsx`) + AI Recommended (5b) + Workload
- Filter pills `All/Pending/Active/Completed` `44h radius12` counts, `segmentActive teal`. `Pending` → `aiPanel canvas` `sparkles` + `techRank/match% · rating/reviews/yrs/km · confidence` → **workloadRow** `Available — 2 active jobs` teal or `Busy — 4 active jobs` gold (`time-outline`) + `availRow` `Has a scheduled job that day` gold / `Available for this schedule` green + `upcomingSchedule` calendar/time. `Active` → `rail` + `readyBadge` + `completionBadge code` + `Track/Confirm/Ready` teal. `Completed` → `donePill` + `reviewToggle` → `reviewContainer` stars + input + `Submit Review` `POST /api/requests/:id/review`. Focused `cardFocused teal 2 + cardStrong`.

### 8.5 Request Details (`RequestDetailsScreen.tsx`)
- Nav `Back` + `REQUEST DETAILS` muted `11 1.5` + `navPill` status. `heroCard white 24 radius` icon `76 radius24`, stepper `STEPS` dots/lines, `guidanceBanner`, `activityCard`, `APPLIANCE` + `PROBLEM DESCRIPTION`, `SCHEDULE & LOCATION` rows + `Avatar Verified Technician` + `ratingBlock` bars + `codeCard F0FDF4` + `Confirm/Ready` + `Track` + `Message`.

### 8.6 Available Jobs (`AvailableJobsScreen.tsx`)
- Hero `Jobs for your skills` `27 bold ink` + `nearby` tealLight `46 radius15` + bell badge `danger 16`. `Availability is ON` white `18 radius`. `My active jobs` (`acceptedCount` teal) `acceptedCard white 20 radius hudBorder` → `acceptedTopRow` + `statusBadge` + `scheduleInline` + `iconButton teal 44` (map/chat) → `arrivalRow/noShow/start/complete OTP`. `highlightedCard teal 2 + cardStrong` when `highlightedJobId` (from job notification). `Dispatch Queue` `jobCard` proximity `distancePill tealLight` + `actionRow Decline / Accept Job`. Workload gating: `3–5 Busy Cancel/Accept Anyway`, `6+ At Capacity OK` (`409`).

### 8.7 Map Trackers (`MapTrackerScreen.tsx` / `TechnicianTrackerScreen.tsx`)
- `LocationIQMap` WebView Leaflet, customer/teal polyline, Top HUD `3.4 km / 12 mins`, Bottom card contact + `Open External Google Maps`.

### 8.8 Chat (`ChatScreen.tsx`)
- Inbox `FlatList` `ConversationRow` `48 radius16 teal` + `unreadPill error` + `badgePill color15/40` + `jobCode 10 extraBold tealLight` + `phone masked`. Filters `All/Active/Completed/Unread` + `StatCard Total/Active/Unread`. Thread `navBar` + `chatHeaderCard white` + `call/copy` teal `44` + `msgBubble 78% radius18` `myMsg teal` / `otherMsg white border line` + `inputContainer canvas 24`.
- Chat supports text plus optional photo. Text-only sends JSON. Photo sends multipart `photo` to the `chat-images` bucket. Image-only messages store empty `text`. Bubbles render `imageUrl` with `PhotoLightbox`. Header info button opens `ConversationInfoSheet` with safety and OTP notes.

### 8.9 Profiles
- **TechnicianProfileScreen:** header avatar `verified badge`, `★ 4.9 · 38 · 100%`, skill chips teal, `Portfolio Gallery` grid + `+ Add Project` opens `PortfolioPhotoSheet`. Single photo per request requires `repairType` and `model`. Availability toggle.
- **CustomerProfileScreen:** name/email/phone/address + `Service History` + logout. Help entry opens `HelpSheet` with assistant handoff.

### 8.10 Notifications (7b) — Two-Step
- `Modal` `notificationPanel`: `panelHeader FIXLINK UPDATES + close 34 canvas`, `detailCard F0FDFA` (icon + `sender · request update` / `New message from` + `Read/Unread · Just now · #CODE` + text + `Tap again…` + `detailError` red + `Open request/conversation →` teal / `Close` white), list `notice` (icon `38 radius13 E6F6F3 / FFF8E7` → `noticeRead 0.72` → `noticeSelected F0FDFA 2` + `tapHint teal pill` + `unreadDot 8 teal`) + static `You’re all set` / `Need something fixed?`. Badge `dot 18 error` hides at 0, poll `GET /api/requests/notifications` 10s `limit100 sorted desc`.

---

## 9. Prototype Interaction Map

```
Login → (role customer) → Dashboard → +Request → Submit → Progress (Pending → AI 5b → Available/Busy chip) → Details → Track → Map ↔ Chat
                     → Progress Active rail → Details Confirm/Ready → Map → In Progress OTP → Completed → Review → Portfolio
       → (role technician) → Jobs (nearby 3.2km + Busy/At Capacity) → Accept (Busy warning / At Capacity block) → Active Card → Map → Start → Complete OTP → Portfolio
       → Notifications Panel: 1st tap detail + badge -1 (fire-and-forget PUT) → 2nd tap same → chat thread / progress focused completed + review / details / highlighted job
       → Profile → Settings/History → Logout
```

Expo prototype runs `npx expo start` (SDK 57) on `Fixlinkmobile/mobile`, API `http://${hostUri}:5050/api`. Haptics `Vibration.vibrate(60)` on banner, `RefreshControl` pull, `Pressable 0.97` throughout.

---

## 10. Accessibility & Quality
- `accessibilityRole button/label/hint/state selected/expanded`, `hitSlop 6-10`, `minHeight 44-48` touch targets, `press` GPU only (scale+opacity), `shadows.elevation` 3-6, `placeholderTextColor muted`, `selectable` phone, `fontScaling` via `Inter`.

---

## 11. File Map
```
mobile/src/theme.tsx (colors, fonts, radii, spacing, shadows, monoStack)
mobile/src/components/AppButton.tsx, Skeleton.tsx, MessageBanner.tsx, LocationIQMap.tsx, DateTimePicker(.web).tsx
mobile/src/utils/applianceIcons.tsx (getApplianceIcon, getStatusColor/Icon/Guidance)
mobile/src/screens/{auth, customer, technician, shared}/[11 screens + 5b/7b]
mobile/src/navigation/AppNavigator.tsx (tabs, modals, deep-links focused/highlighted)
mobile/src/screens/services/api.tsx (Axios baseUrl, auth)
context/UI_WORKFLOW.md (screen specs), context/ARCHITECTURE.md (5.4 workload, 5.5 notifications)
```

*No Figma URL — prototype is the Expo app itself. To preview: `cd Fixlinkmobile/mobile && npm install && npx expo start` → scan QR.*

