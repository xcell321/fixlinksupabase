# Project Rules & Coding Standards — FixLink Mobile

## 1. Architecture & Code Organization
- **Separation of Concerns:** Keep business logic, UI components, and API service calls decoupled. Backend follows thin `routes/` (registration order in `routes/requests.js` is load-bearing) delegating to `controllers/` handlers, `services/` business rules, `repositories/` database access, and `domain/` serializers and policy.
- **Mobile Navigation:** Follow role-based navigation flows defined in `mobile/src/navigation/AppNavigator.tsx`.
- **API Client:** Route all mobile backend requests through `mobile/src/services/api/` (split client: `client.tsx`, `authApi.tsx`, `requestsApi.tsx`, `messagesApi.tsx`, `aiApi.tsx`, and related modules).

## 2. Technology & Dependency Boundaries
- Mobile stack is strictly React Native / Expo SDK 57 with TypeScript (`.tsx`/`.ts`). Do not install unverified native modules without Expo config plugins.
- Backend runs Node.js / Express with Supabase PostgreSQL (service_role client). There is no Firebase or Firestore dependency; do not reintroduce Firebase references.
- Schema source of truth is `backend/src/db/schema.sql` (idempotent). Do not introduce breaking schema changes without updating `context/SCHEMA.md` and `context/Data_Dictionary.md`.

## 3. Quality & Safety
- Validate all user input on both client (form validation) and server before processing.
- Maintain absolute path references in agent workflows.
- No direct hardcoding of Supabase keys or secrets; use environment variables (`.env`). The mobile app never connects to the database directly; the backend always uses the service_role key (bypasses Row Level Security).

## 4. Workload & Capacity ( `backend/src/services/workloadService.js` )
- Active = `Accepted, Confirmed, Customer Ready, In Progress` only; never `Pending/Completed/Cancelled/No-Show`.
- Count live from DB via `getTechnicianActiveJobCount` / batch `getActiveJobCountsForTechnicians` (`count head:true`). Never trust client count.
- `0–2 available` eligible, `3–5 busy` still eligible with `-0.06` penalty (not overpowering skill/rating/distance), `6+ at_capacity` excluded from `GET /api/ai/recommend` (advisory) and blocked by authoritative `PUT /api/requests/:id/accept` → `409 TECHNICIAN_AT_CAPACITY`. Do not cancel existing jobs; auto-recover when ≤5. Do not duplicate job-status logic (reuse `OCCUPIED_STATUSES`); keep schedule (`techScheduleService.js` same-day) separate from workload.

## 5. Notifications ( `mobile/src/navigation/AppNavigator.tsx` + `backend/src/routes/requests.js` )
- Two-step: 1st tap → `detailCard` + optimistic `read=true` (badge –1, fire-and-forget `PUT /api/requests/notifications/:id/read`, 404 keep optimistic no warn, no spinner); 2nd tap same `id` → `GET /api/requests/job/:id` ownership check → exact destination (`chat`→ thread, `job` Completed→ `RequestProgressScreen` `focusedJobId`, otherwise `RequestDetailsScreen`/tech `highlightedJobId`). Never route by title. Deleted job → `detailError` keep notification, no crash. Badge `filter(!read).length` never negative, persisted via `GET /api/requests/notifications` (10s poll).

## 6. Preservation
- Do not rewrite AI matching, OmniRoute, skill/distance/rating, schedule visibility, GPS, chat, OTP, reviews, profile, auth, or `jobs` state machine unless required for workload/notification. Use existing theme tokens, API patterns (`/api/requests`, `/api/ai`), and `serializeJob`/`getEligibleCandidates` helpers.

