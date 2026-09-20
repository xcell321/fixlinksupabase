---
name: FixLink
description: Verified home-service dispatch for Cebu / Bogo City — calm accountability, proximity without exposure.
colors:
  harbor-ink: "#102A43"
  harbor-teal: "#0F766E"
  teal-deep: "#075E59"
  teal-mist: "#E6F6F3"
  canvas: "#F5F8FA"
  white: "#FFFFFF"
  slate-muted: "#5A7A91"
  harbor-line: "#D9E2EC"
  line-soft: "#E3ECF2"
  sunken: "#FBFDFE"
  hud-border: "#CBE7E1"
  amber-gold: "#D97706"
  signal-green: "#059669"
  signal-blue: "#2563EB"
  signal-violet: "#7C3AED"
  signal-red: "#DC2626"
  error-red: "#E53935"
  tip-cream: "#FFF8E7"
  tip-border: "#FDE68A"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.7px"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.3px"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.2px"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "1.5px"
rounded:
  xs: "10px"
  sm: "12px"
  md: "14px"
  lg: "16px"
  xl: "20px"
  2xl: "22px"
  3xl: "24px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "28px"
  2xl: "36px"
components:
  button-primary:
    backgroundColor: "{colors.harbor-teal}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "48px"
  input-field:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.harbor-ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "52px"
  card-default:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.xl}"
    padding: "16px"
  nav-active:
    backgroundColor: "{colors.teal-mist}"
    textColor: "{colors.harbor-teal}"
    rounded: "{rounded.sm}"
  chip-status:
    rounded: "{rounded.pill}"
    padding: "4px 8px"
---

# Design System: FixLink

## Overview

**Creative North Star: "The Trusted Harbor"**

FixLink is the calm harbor in a distress moment: a broken refrigerator, a leaking washer, a dead PC. The interface holds steady while the household is not — deep harbor ink for truth, one confident teal for committed action, and airy canvas so distance, status, and next steps scan at arm's length in outdoor glare. Every screen reads as a ledger of accountability: who is verified, how far they are, what happens next, and what proves it was done.

Density is operational, not decorative. Two-column action pairs, three-up stat summaries, and single-column job cards carry the real workflow (submit → match → accept → track → OTP closeout) without settings or ornament. Telemetry details — kilometers, ETAs, OTP codes, counts — set in tabular numerals with icon + text, never color alone. The industrial HUD accent (thin hud borders, sunken fields, pill distances) stays underneath the calm; it sharpens dispatch without hardening the welcome.

**Key Characteristics:**
- Calm accountability over hype: verification, arrival transparency, and proof-of-work are the decoration.
- Tactile and reassuring: chunky radii, 48px targets, high-contrast labels for one-handed field use.
- Tonal layered surfaces: canvas / white / sunken + thin lines carry hierarchy; shadows only answer state.
- Native restraint: no glassmorphism, no gradients, no web-ported controls; iOS HIG and Material 3 govern structure.

## Colors

One confident harbor accent on a cool ink-and-canvas field; functional status hues are tools, not brand.

### Primary
- **Harbor Teal** (#0F766E): The single commitment color. Primary buttons, active tab icons + labels, eyebrows/kickers, accept/arrival/start actions, and focused OTP border. Used where the user commits or the platform vouches.
- **Deep Harbor** (#075E59): Teal pressed deeper for text on mist (avatar initials, distance numerals, schedule lines) and icon-tile borders (#CBE7E1) that need more contrast than the base teal.
- **Mist Teal** (#E6F6F3): Tonal wash for active nav pills, icon tiles (42–46px), job-count badges, and empty-state art. The calm behind the accent.

### Neutral
- **Harbor Ink** (#102A43): Truth text — greetings, titles, card headings, OTP digits. Also the message-banner ground and modal scrims (rgba(16,42,67,0.5)).
- **Harbor Canvas** (#F5F8FA): App ground for every ScrollView screen and auth container; thumbnail and close-button wells.
- **White** (#FFFFFF): Card, sheet, input-panel, and bottom-nav surfaces layered over canvas.
- **Sunken Field** (#FBFDFE): Inset input fill that reads as writable against white cards.
- **Slate Muted** (#5A7A91): Secondary copy, meta lines, inactive tab labels, and placeholder icons. Body text targets WCAG AA on white/canvas.
- **Harbor Line** (#D9E2EC): The 1px structural border for cards, inputs, nav top-rule, and dividers.
- **Soft Line** (#E3ECF2): Recessed dividers and skeleton-adjacent thumbnail grounds.
- **HUD Border** (#CBE7E1): Teal-tinted edge for accepted/highlighted cards, distance pills, and avatar rings.
- **Tip Cream** (#FFF8E7) / **Tip Border** (#FDE68A): The single warm aside — the dashboard quick-tip card only. Cream ground, gold-brown copy.

Functional status (always paired with icon + text, never color alone):
- **Signal Amber** (#D97706): Pending / busy workload. Stats, pills, tip accents.
- **Signal Green** (#059669): Completed / OTP complete actions.
- **Signal Blue** (#2563EB): In Progress tracking and routing emphasis.
- **Signal Violet** (#7C3AED): Customer Ready hand-off.
- **Signal Red** (#DC2626) / **Error Red** (#E53935): No-show, cancelled, destructive, and validation errors (input error border #FC8181, error text #C53030 / #B91C1C in context).

### Named Rules
**The One Harbor Rule.** Harbor Teal marks commitment or vouching only — primary actions, active states, verified accents. If it does not mean "commit / verified / live," use ink, muted, or tonal fill instead.
**The Status-Never-Alone Rule.** Status and workload always pair color with icon + text label (Available / Busy / At Capacity, Pending → Completed). A color dot alone never carries meaning.

## Typography

**Display Font:** Inter ExtraBold (with system-ui, sans-serif fallback)
**Body Font:** Inter Regular / Medium (with system-ui, sans-serif fallback)
**Label/Mono Font:** Inter Bold for eyebrows + labels; monospace stack + tabular numerals for telemetry (distances, ETAs, OTP, counts)

**Character:** Trade-counter clarity — tight, confident headings with negative tracking over calm, slightly loose body. Eyebrows do the shouting in 10px uppercase so headings never have to. Numbers hold still (tabular-nums) so live distances and codes do not jitter.

### Hierarchy
- **Display** (800, 26–27px, 1.15 line-height, -0.7px tracking): Greetings only — "Good day, {name}" and "Jobs for your skills." One per screen, never stacked.
- **Headline** (700, 20–23px, 1.25 line-height, -0.3px tracking): Section titles — "What do you need today?", "My active jobs," panel titles.
- **Title** (700, 18px, 1.3 line-height, -0.2px tracking): Card headings — job titles, FIXLINK wordmark (18px, -0.3px tracking), notification titles.
- **Body** (400/500, 14–15px, 1.43 line-height): Descriptions, problem statements, chat messages (14px, 20px line-height), tip copy (12px, 17px line-height in context).
- **Label** (700, 10–11px, 1.5px tracking, uppercase): Eyebrows/kickers (CUSTOMER SPACE, TECHNICIAN HUB, DISPATCH QUEUE), pill text (10px, 0.2px tracking, sentence case in pills), nav labels (10px, semibold, non-uppercase), timestamps (10px, tabular-nums).

### Named Rules
**The Eyebrow-Does-Shouting Rule.** Kickers carry the uppercase + wide tracking (10px, 1.4–1.6px tracking, teal); headings stay tight and calm. Never uppercase a headline to create hierarchy.
**The Numbers-Hold-Still Rule.** Distances, ETAs, OTP digits, badges, and counts always set tabular-nums (fontVariant tabular-nums / font-feature tnum). Live values must not reflow as they update.

## Layout

A single-column dispatch ledger on a 20px canvas gutter, widening only for paired actions and stat trios. Screens scroll (ScrollView, 20–22px padding, 32–36px bottom pad) over canvas; cards layer white at 20–22px radius; bottom tab bar pins 4 destinations with a 1px harbor-line top rule. Content caps at narrow widths where focus matters: banners max 420px centered, notification panels max 390px, OTP sheets max 360px, photo sheets dock bottom at 28px top radius and 82% max height.

Rhythm follows the token scale (6 / 10 / 14 / 20 / 28 / 36px): 8–12px gaps inside cards, 10–14px between cards, 20–28px between sections. Hero rows split copy + 46–48px badge (avatar, job count, notification bell) with 8–16px gutters. Job cards stack icon (42–46px) + copy + chevron/action, divided by 1px rules with 11–14px meta padding. Bottom nav gives each item 65px min-width and 52px min-height; icon wells (42×30px, 12px radius) light mist only when active.

## Elevation & Depth

Tonal layering carries depth; shadows only answer state. Rest surfaces separate by ground (canvas → white → sunken) plus 1px harbor/hud borders, staying flat and low-bandwidth friendly. Shadows arrive on commitment: button lift, card hover/press, banner arrival, sheet and modal focus. Motion stays on the GPU path (transform / opacity only) with 60ms haptic confirmation on banners and OTP.

### Shadow Vocabulary
- **Button lift** (`box-shadow: 0 4px 10px rgba(15,118,110,0.18), elevation: 3`): Primary teal actions (AppButton, Accept, Mark Arrival, Start Repair) at rest.
- **Card rest** (`box-shadow: 0 6px 14px rgba(16,42,67,0.06), elevation: 3`): Default job / request / stat cards on canvas.
- **Card strong** (`box-shadow: 0 8px 16px rgba(16,42,67,0.08), elevation: 4`): Highlighted / selected cards (deep-linked job, pressed primary actions tile).
- **HUD float** (`box-shadow: 0 12px 32px rgba(16,42,67,0.08), elevation: 6`): Accepted work cards and telemetry surfaces that must sit above the feed.
- **Banner / sheet focus** (`box-shadow: 0 8px 16px rgba(16,42,67,0.25), elevation: 8` + modal scrims `rgba(16,42,67,0.4–0.5)`): Message banners, notification panels (0 12px 24px rgba(16,42,67,0.2), elevation 12), and OTP sheets.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest and separate by tone + 1px line. Shadows appear only as a response to state (press, selection, arrival, focus) — never as static decoration.

## Shapes

Gently engineered curves — approachable enough for a distressed household, squared enough for a trade tool. Buttons and inputs hold the tactile middle (13–14px radius, 48–54px height); cards go broader (18–22px, 24px for OTP modals); icon tiles sit between (11–18px for 32–54px tiles); status and distance collapse to pills (999px). Photo sheets break the pattern once: 28px top radius only, docked bottom, so viewing a repair photo feels like the rest of the app rather than a fullscreen gallery. Borders are hairline structural (1px harbor-line / hud-border / tip-border); skeleton blocks use quiet 8–15px fills (#E5E7EB) with no border.

## Components

Tactile and reassuring: every control looks pressable at 44–48px, answers with scale 0.97 + slight fade, and labels in high-contrast bold.

### Buttons
- **Shape:** Gently curved (14px radius), 48–54px min-height, 12–18px horizontal padding.
- **Primary:** Harbor Teal ground (#0F766E) + white 15px bold label (0.1px tracking) with 8px icon gap; rests with teal lift shadow (0 4px 10px rgba(15,118,110,0.18), elevation 3).
- **Hover / Focus:** Native press only — opacity 0.92–0.96 + scale 0.97 (transform/opacity GPU path). No web hover fills. Focus-visible shows teal outline; OTP submit uses signal green ground with identical press.
- **Secondary / Ghost:** White ground + 1px harbor-line border + muted/slate 12–13px semibold label (Decline, No-Show, Cancel, Close). Destructive text goes signal red on white. Icon-only companions (map/chat) are 44px teal squares at 14px radius with white glyphs.

### Chips
- **Style:** Pill (999px radius), 4–8px vertical + 8–10px horizontal padding, 1px tinted border (status color at 40% alpha) over status color at 8–15% alpha wash; 10px bold label + 10–11px status glyph.
- **State:** Color + icon + text always move together (Pending amber/time, Accepted/Confirmed teal/hand, Customer Ready violet/flag, In Progress blue/sync, Completed green/check, No-show/Cancelled red/alert). Distance pills use the same silhouette in mist teal + hud border with tabular numerals (12px bold, deep harbor).

### Cards / Containers
- **Corner Style:** Broadly curved (20px radius; 22px for auth cards, 24px for OTP modals, 18px for status/tip asides).
- **Background:** White over canvas; sunken (#FBFDFE) only for writable wells; tip aside alone uses tip cream; selected notification detail uses mist wash (#F0FDFA + #B2E2D8 border).
- **Shadow Strategy:** Card rest at ease; strong/HUD only when highlighted or accepted (see Elevation & Depth). No static drop decoration.
- **Border:** 1px harbor-line default; hud-border for accepted/highlighted work; tip-border for the warm aside.
- **Internal Padding:** 14–18px (cards), 20px (auth/panel), 24px (OTP modal); meta blocks divided by 1px rules with 11px vertical rhythm.

### Inputs / Fields
- **Style:** Sunken ground (#FBFDFE), 1px harbor-line stroke, 13–14px radius, 52–56px height, 14px horizontal padding; 19px muted leading icon + 15px medium ink text; placeholder #9FB3C8.
- **Focus:** 2px harbor-teal ring on the OTP field (56px height, 26px bold centered digits, 10px letter-spacing); standard fields hold the 1px line with soft teal intent. Honor Reduce Motion with instant cut.
- **Error / Disabled:** Error stroke #FC8181 + 12px medium danger text (#C53030 / #B91C1C in detail) beneath the field; disabled buttons hold teal ground at reduced opacity with spinner, never a color shift.

### Navigation
- **Style:** White bar + 1px harbor-line top rule; 4 destinations (Home/Requests/Messages/Profile; Jobs/Map/Messages/Profile for technicians). Each item 65px min-width, 52px min-height, 10px semibold label; icon well 42×30px at 12px radius, mist-filled only when active. Active glyph filled + teal label; inactive outline + muted label.
- **Mobile treatment:** Safe-area insets honored; edge-swipe back alive; top-level screens use large collapsed-to-inline titles; sheets rise from bottom and dismiss in reverse. Badges (notification dot, unread pill, job count) are 16–18px red/teal pills with white 9–11px extra-bold tabular numerals and 2px white ring.

### Signature Component
**OTP handshake field + status pill pair.** The 4-digit completion code is the product's proof moment: customer-side display, technician-side entry, server validation. Set as a single 56px sunken field with 2px teal focus, 26px bold centered tabular digits at 10px letter-spacing — never split into four boxes. It always appears beside the status pill (color + icon + text) so verification state and dispatch state read as one ledger line.

## Do's and Don'ts

Concrete guardrails grounded in the Expo implementation (`Fixlinkmobile/mobile/src/theme.tsx`, AppButton, Dashboard, AvailableJobs, AppNavigator, Chat, Photo components).

### Do:
- **Do** keep one teal for commitment — primary actions, active nav, eyebrows, accept/arrival/start, OTP focus (#0F766E). Its rarity is the point.
- **Do** pair every status/workload color with icon + text (The Status-Never-Alone Rule); use tabular-nums for all live values (The Numbers-Hold-Still Rule).
- **Do** hold 44–48px touch targets with 6–10px hitSlop and scale 0.97 + opacity press feedback on transform/opacity only.
- **Do** separate surfaces by tone (canvas #F5F8FA → white → sunken #FBFDFE) + 1px harbor/hud line before reaching for shadow (The Flat-By-Default Rule).
- **Do** use FIXLINK wordmark as ink + teal split (18px extra-bold, -0.3px tracking) with HOME SERVICES eyebrow (9–10px bold, 1.5px tracking, muted) — never a logo image.
- **Do** show skeleton blocks (#E5E7EB, 8–15px radius) on Dashboard, Jobs, Chat loads; validate inline with recoverable thumbnail + remove affordances.

### Don't:
- **Don't** ship glassmorphism, gradients, arbitrary drop shadows, or custom global nav — native HIG / Material 3 govern structure; brand lives in tint, type, and telemetry details.
- **Don't** invent a second brand accent or pastel status palette — amber/blue/violet/green/red are functional tools with fixed dispatch meanings, not decoration.
- **Don't** uppercase headlines or body to create hierarchy — eyebrows carry uppercase + wide tracking; headings stay tight and calm.
- **Don't** split the OTP into four boxes, open a fullscreen black gallery, or port iOS controls to Android (and vice versa) — use the bottom photo sheet (28px top radius), single OTP field, and platform controls (switch, sheet, snackbar/dialog, SF Symbols / Material icons).
- **Don't** expose exact home coordinates before accept — town/city + approximate distance only; mask phone as `0912•••3456` pattern until mutual commitment.
- **Don't** redefine a frontmatter token in prose with a different value — the YAML frontmatter is normative; prose describes role and context only.
