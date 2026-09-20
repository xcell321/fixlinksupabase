# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Balanced two-sided marketplace plus governance — no single side wins alone.

- **Customer (household / small-office owner):** In distress with a broken appliance (refrigerator not cooling, washer leaking, PC won't boot, water heater fault). Job: get a qualified technician to their home fast, know arrival time, coordinate entry, confirm the fix, without hauling bulky equipment to a shop.
- **Technician (independent / part-time / TESDA-certified):** Skilled tradesperson or vocational graduate without marketing budget. Job: receive filtered local leads matching tools and verified skills, triage by proximity, navigate to homes, complete OTP handshake, build rating and proof-of-work portfolio.
- **Administrator (platform manager):** Maintains quality bar. Job: verify Government ID + TESDA/vocational certificates, toggle technician status to `active`/`verified`, manage category catalog, broadcast announcements, suspend delinquent accounts.

## Product Purpose

FixLink is an all-around technician service platform for repair request management and home-based technician dispatch.

It exists because sourcing repair help via word-of-mouth, classified ads, and informal SMS/calls is slow, unverified, and loses requests — and hauling refrigerators, washers, and system units to workshops is impractical.

Success means: a customer submits a categorized request with photo + pinpointed address in under a minute and gets a verified, nearby match; a technician gets steady eligible leads without advertising; every job moves transparently `Pending` → `Accepted` → `In Progress` → `Completed` with live tracking and a tamper-evident OTP closeout.

## Positioning

Verified skill + proximity home dispatch — not a listings board.

A neighboring product could copy a job feed, but could not truthfully copy this combination: mandatory Government ID + TESDA/vocational verification before job access, automated skill-category matching against an admin-managed catalog, Haversine distance sorting within 20 km with exact address masked until acceptance, mutual live Leaflet/LocationIQ routing unlocked only after accept, and a 4-digit OTP completion handshake with 1–5 star reviews feeding future ranking. Cash-on-Service settlement (no payment gateway) keeps the transaction direct and offline.

## Operating Context

- **Place and situation:** Home service across Cebu / Bogo City catchment; technicians operate outdoors, on the move, often one-handed; customers coordinate from home (gate passes, landmarks, schedules).
- **Core workflow:** Submit request (category → device → description → photo → address + `Locate Me` → date/time) → skill/proximity-matched feed → atomic accept + OTP generation → mutual tracking + chat/call → `In Progress` → OTP verify → review + portfolio upload.
- **Tools and integrations:** Expo SDK 57 mobile client (single binary, customer + technician stacks via role routing); Node.js + Express REST API (`/api/auth`, `/api/requests`, `/api/users`, `/api/admin`, `/api/ai/recommend`); Supabase PostgreSQL (`users`, `jobs`, `messages` + `message_reads`, `reviews`, `notifications` with `read`/`read_at`, `announcements`, `categories`); Supabase Auth + JWT + Storage bucket `fixlink`; LocationIQ forward/reverse geocoding + driving polyline; Leaflet.js in WebView for maps.
- **Documents and materials:** Technician Government ID + TESDA/vocational certificate (mandatory upload); customer damage photo; completed-repair portfolio photo + description.
- **Rituals:** Admin credential inspection before activation; customer furnishes OTP only upon physical completion; ratings close every completed job.

## Capabilities and Constraints

Confirmed functionality (Chapter 1 compliant):

- Independent Customer / Technician sign-up; technician skill multi-tag + document upload; `pending_verification` gate until admin approval.
- Repair submission: admin-managed category → device drill-down (`GET /api/users/platform/categories`), description, photo, LocationIQ geocode + GPS fallback, preferred date/time → `Pending` in `jobs`.
- Matching: verified/active gate, normalized category match (exact/substring, Computer umbrella, `General Repair` wildcard, `Others` bespoke), Haversine `distanceKm`, 20 km radius, privacy shield (town/city + approximate distance only until accept), decline hides only for that technician.
- Dispatch: atomic `accept_job()` RPC sets `technicianUid` + 4-digit OTP; workload gating — `0–2 available`, `3–5 busy` (−0.06 rank dip, confirm-accept), `6+ at_capacity` (excluded from recommend, `409 TECHNICIAN_AT_CAPACITY` on accept, auto-recovers at ≤5).
- Tracking: mutual live GPS only after accept; LocationIQ route + km + ETA; external Google/Apple Maps fallback; streaming ceases on `Completed`/`Cancelled`.
- Communication: per-job chat thread + timestamps, direct dialer, `Accepted` → `In Progress` on arrival.
- Completion: customer-side OTP display, technician entry, server validation → `Completed`; 1–5 star + text review to `reviews` recalculating cumulative rating; portfolio photo upload.
- Admin: credential verification, status toggles, category list, announcements; notification two-step deep-link with optimistic `read=true` + fire-and-forget `PUT`, 10 s poll, 100-item feed.

Hard constraints / out of scope:

- No in-app payment gateway (Stripe/GCash/PayPal); all fees settled Cash-on-Service.
- No automated hardware diagnostics; platform is dispatch + matching, not board-level testing.
- Categories strictly admin-defined (Home Appliances, Mobile Devices, Networking, Computer & Laptop, Other Electronics); dynamically loaded, not hardcoded.
- Active internet + GPS required on both devices; no offline dispatch.
- Terminology: `Pending`, `Accepted`, `Confirmed`, `Customer Ready`, `In Progress`, `Completed`, `Cancelled`, `No-Show`; `activeJobs`, `workloadStatus` (`available`/`busy`/`at_capacity`); `verification_code` OTP.

Open decisions: production deploy target and staging distribution method; whether `fixlinkweb admin/backend` gains a web UI or remains API-only; final launch category set beyond the five families above.

## Brand Commitments

- Name: **FixLink** — wordmark `FIXLINK`, tagline family `HOME SERVICES`.
- Full title: `FIXLINK: AN ALL-AROUND TECHNICIAN SERVICE PLATFORM FOR REPAIR REQUEST MANAGEMENT AND HOME-BASED TECHNICIAN DISPATCH`.
- Academic owner: Cebu Roosevelt Memorial Colleges, College of Computer Studies, BSIT Capstone January 2026; researchers Jonard Masong, James Robert Rojas, Edsiel Ursal; advisers Carl Joshua Cosep, Marjorie Reso MIT, Dr. Jonel D. Gelig.
- Voice: calm, reassuring, accountability-first — verification, arrival transparency, and proof-of-work over hype. No invented claims permitted.
- No binding visual direction volunteered in init; incumbent mobile theme noted but not recorded here.

## Evidence on Hand

- `Fixlinkmobile/context/PRD.md` — five SOP problems, five objectives, FR-AUTH/REQ/MATCH/WORKLOAD/MAP/COMM/VERIF.
- `Fixlinkmobile/context/ARCHITECTURE.md` — three-tier diagram, matching/OTP/privacy/workload/notification algorithms, end-to-end sequence.
- `Fixlinkmobile/context/UI_WORKFLOW.md` — screen-by-screen wireflow and interaction guide.
- `Fixlinkmobile/context/SCHEMA.md`, `Data_Dictionary.md`, `FixLink_System_Workflow_Plan.md`, `implementation_plan.md` — relational model and workflow plans.
- Implemented truth: `Fixlinkmobile/mobile/src/` (AppNavigator role routing, 11+ screens, `LocationIQMap`, chat, OTP, reviews), `Fixlinkmobile/mobile/app.json` (location/camera/photo permission rationales), `fixlinkweb admin/backend/src/` (Express + Supabase routes, `accept_job` RPC, workload utils).
- Absences future work must not fabricate: no real testimonials, case studies, press, benchmarks, pricing/licensing, or production deployment proof; no Figma URL — the Expo app is the prototype (`cd Fixlinkmobile/mobile && npx expo start`).

## Product Principles

1. **Verification before dispatch.** No unverified technician sees or accepts jobs; trust cues (ID, TESDA, ratings, OTP) are reassurance, not decoration.
2. **Proximity without exposure.** Rank by real distance but mask exact home coordinates until mutual commitment; privacy is a dispatch rule.
3. **Status transparency over configuration.** Both sides mostly read state; one consistent `Pending → Accepted → In Progress → Completed` language everywhere beats settings.
4. **Livelihood compounds.** Every completed job should grow the technician's reputation and portfolio, turning gigs into a business hub.
5. **Keep money and diagnosis out of the app.** Cash-on-Service and manual troubleshooting are deliberate boundaries; the platform wins on matching, routing, and proof.

## Accessibility & Inclusion

- Field-first legibility: high-contrast text, 44–48 px touch targets, `hitSlop 6–10`, tabular numerals for distance/ETA/codes for outdoor glare and one-handed use.
- Never color-alone: status and workload (`Available`/`Busy`/`At Capacity`, `Completed`, errors) always pair color with icon + text label; body text targets WCAG AA.
- Low-bandwidth tolerance: skeleton loading on Dashboard, Progress, Jobs, Chat; inline validation and thumbnail + remove affordances so a wrong photo/document pick is recoverable without restarting.
- Haptic confirmation (`60 ms` on banners/OTP) supplements visual feedback; motion uses transform/opacity only to stay smooth on lower-end Android devices common in the catchment.
