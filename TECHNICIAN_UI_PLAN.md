# Technician UI/UX Implementation Plan

Following Make file design specifications strictly. No system crashes.

## Design System (from DESIGN.md)

### Core Colors (Technician)
- **Tech Blue**: #2563EB (primary actions, active states)
- **Tech Blue Dark**: #1D4ED8 (emphasis text)
- **Tech Soft**: #EFF6FF (light background)
- **Harbor Teal**: #0F766E (commitment/acceptance only)
- **Dark Header**: #0D1B2A (professional context)
- **Harbor Ink**: #102A43 (truth text)
- **Harbor Canvas**: #F5F8FA (app background)

### Design Rules
1. **One Harbor Rule**: Teal marks commitment/verified only
2. **Status-Never-Alone Rule**: Status colors pair with icon + text
3. **Numbers-Hold-Still Rule**: Tabular-nums for all data
4. **Flat-By-Default Rule**: Tone + 1px line before shadow

### Touch Targets & Spacing
- Min height: 44-48px
- Card padding: 14-18px
- Gap between cards: 10-14px
- Gap between sections: 20-28px
- Radius: 12px (sm), 14px (md), 20px (xl), 22px (2xl)

## Screens to Update

### 1. AvailableJobsScreen
- Dark header (#0D1B2A) with greeting + stats
- Segmented tabs (Available/Assigned) with tech blue active
- Job cards with proper spacing and shadows
- Action buttons: primary (Tech Blue), secondary (outline)
- OTP modal with single field (not 4 boxes)

### 2. TechJobDetailScreen
- Back header with proper spacing
- Job card with appliance icon, title, description
- Customer card with verified badge
- Location/schedule details in proper format
- Map section with proper placeholder
- Action buttons matching design system
- Card shadows only on state (no static decoration)

### 3. TechnicianProfileScreen
- Dark header card (#0D1B2A) with avatar, name, rating
- Stats card (jobs done, rating, experience) - 3-up telemetry
- Tab navigation (Info/Skills/Reviews/Portfolio)
- Edit form with proper inputs and spacing
- Portfolio section with proper grid
- Skill chips with proper styling

### 4. TechMapScreen
- Minimal updates for consistency
- Proper button styling
- Location accuracy feedback

### 5. Shared Sheets
- `PortfolioPhotoSheet` for single photo plus `repairType` and `model`
- `RecommendedTechSheet` for AI matches with workload and skills
- `AssistantSheet` for AI help with per-user history
- `ConversationInfoSheet` for chat safety and OTP notes

## Implementation Approach

1. Update styles incrementally
2. Test each screen after changes
3. Preserve all state management and logic
4. Use existing components where possible
5. Match typography, spacing, shadows exactly
6. Zero hardcoded colors outside theme

## Safety Checks

- [ ] Build runs without errors
- [ ] All screens render correctly
- [ ] No console errors or warnings
- [ ] Touch targets are 44-48px minimum
- [ ] Shadows only appear on state, not static
- [ ] Tabular-nums used for all data values
- [ ] Colors match design system exactly
