# FixLink — UAT Features #2–#11

Implementation, configuration and testing guide for the UAT requirements (#2–#11).

> **Design rule:** nothing is hardcoded. Every tunable is read from
> `process.env` on each call, with a documented fallback so an empty `.env`
> still works. Fallbacks are the `DEFAULT_*` / `DEFAULTS.*` constants inside the
> policy modules — they are not inline magic values.

### How that rule is enforced

The claim above is checked, not asserted. Two audits fail the build when it
stops being true:

| Guard | Where | What it rejects |
|---|---|---|
| Env inventory | `backend/scripts/e2e-uat.js` | A `process.env.X` read that is not listed in `backend/scripts/check-uat-env.js` (76 variables today), and a computed-key reader (`process.env[envKey]`) that is not pinned in the audit's `DYNAMIC_ENV_READERS` map |
| Named defaults | `backend/scripts/e2e-uat.js` | An inline literal fallback such as `asInt(process.env.X, 60)`. Only `''` is allowed inline; the `, 10` in `parseInt(process.env.X, 10)` is a radix and is ignored |
| Static env reads | `mobile/scripts/checkImports.js` | A dynamic `process.env[…]` read — Expo can only inline `process.env.EXPO_PUBLIC_X` at build time, so the dynamic form silently returns the fallback in a production bundle |
| Documented cover | `mobile/scripts/checkImports.js` | An `EXPO_PUBLIC_*` read missing from `mobile/.env.example` (21 variables today) |

Run them with `node scripts/e2e-uat.js` and `cd ../mobile && npm run verify`.

---

## Feature summary

| # | Requirement | Behaviour |
|---|---|---|
| **2** | Auto-suspend | A customer who cancels **after the technician has already arrived** is auto-suspended (`CUSTOMER_LATE_CANCEL_LIMIT`, default 1). A customer who is not at the service location when the technician shows up is auto-suspended too — but only after the technician has recorded an arrival **and** waited `CUSTOMER_NOSHOW_WAIT_MINUTES` (30–60, default 60); an earlier report is refused with `409 CUSTOMER_NO_SHOW_WAIT` and the remaining minutes. |
| **4** | Terms modal before the location step | Tapping **Continue** on step 3 (appointment) opens a strict regulations modal (1-day rule, 5-hour rule, same-day charge). The confirmation box starts unticked and **Agree and continue** stays disabled until it is ticked. Agreeing unlocks step 4 and the map appears; declining leaves the customer on step 3 and the booking does not proceed. The server refuses a submission that never accepted the terms. |
| **5** | Fake / spam threat | Fake or gibberish addresses are refused. A booking far from the customer's own location is flagged for the technician (optionally blocked). Repeated near-identical bookings by the same customer are refused; many bookings aimed at one address in a day are flagged. |
| **6** | 3 requests/day limit + fake-photo detection | Max `MAX_REQUESTS_PER_DAY` job requests per customer per day. Repair photos are screened for AI/edited/screenshot content and the technician sees a warning chip. |
| **7** | 1 active job per technician | Accepting a job is refused with `409 TECHNICIAN_AT_CAPACITY` once the technician holds `TECHNICIAN_MAX_ACTIVE_JOBS` active jobs. |
| **8** | Repeat scammer | Either party can report the other once work has started/finished. `CUSTOMER_SCAM_LIMIT` upheld reports auto-suspend the customer. |
| **9** | Credential verification | Government ID / certificate screening: local forensics + AI vision + ID-number/name matching. Advisory only. |
| **10** | Facial verification at signup | Face photo (selfie) + government ID required for **both** roles; face-match and liveness risk are judged and stored. |
| **11** | Two-way ratings | Technician rates the customer (verified badge + portfolio shown), customer rates the technician, AI assistant knows both. `CUSTOMER_NEGATIVE_RATING_LIMIT` negative ratings auto-suspend the customer. |

---

## File map

```
backend/src/
  domain/
    autoSuspendPolicy.js        #2  no-show wait window + customer suspend policy
    submitTerms.js              #4  regulation gate + version stamp
    requestSafety.js            #5  address sanity, similarity, spam policy
    dailyRequestLimit.js        #6  env-driven daily cap
    photoScreening.js           #6  device-photo policy + prompts
    verificationRequirements.js #10 required signup docs per role
    ratingRules.js              #11 rating range + negative-rating policy
    scamPolicy.js               #8  scam-strike policy
    credentialScreening.js      #9/#10 flags, thresholds, scoring, face/identity judging
    jobWorkflow.js              #2/#8 arrival + scam-reportable status gates
    jobSerializer.js            #6  photo risk fields on the job payload
    userSerializer.js           #8/#9/#10 scam, credential and face fields
  services/
    credential/documentForensics.js      #9  zero-dependency local forensics
    credential/credentialScreeningService.js #9/#10 orchestrator
    credential/photoScreeningService.js  #6  repair-photo orchestrator
    jobs/accountSuspension.js            #2/#8/#11 the single suspend write
    jobs/requestSafetyService.js         #5  fake address / spam / harassment
    jobs/scamReportService.js            #8  report + auto-suspend
    jobs/customerRatingService.js        #11 technician -> customer
    jobs/jobCompletionService.js         #2  no-show wait gate + auto-suspend
    jobs/jobLifecycleService.js          #2  late-cancellation suspend
    jobs/jobSubmitService.js             #4/#5/#6 terms gate + daily cap + photo screening + safety
    jobs/jobFeedService.js               #11 customer badge/portfolio enrichment
    workloadService.js                   #7  capacity thresholds
    aiClient.js                          #9/#10 visionComplete() fallback chain
  routes/requests.js                     # POST /:id/rate-customer, POST /:id/report-scam,
                                         # PUT /:id/cancel, POST /:id/report-no-show
```

```
mobile/src/
  utils/submitTerms.ts                   #4  regulation copy + thresholds (EXPO_PUBLIC_*)
  utils/noShowPolicy.ts                  #2  wait window + cancel warning copy (EXPO_PUBLIC_*)
  components/SubmitTermsModal.tsx        #4  strict acknowledgement modal
  features/customer/SubmitRequestScreen.tsx  #4  gates step 3 -> step 4
  features/customer/RequestProgressScreen.tsx #2 warns before a late cancellation
  features/technician/availableJobsHelpers.ts            #2 noShowState() wait countdown
  features/technician/availableJobs/ActiveJobCard.tsx   #2 gates the No-Show tile
  features/technician/availableJobs/useJobActions.ts    #2 gates the report dialog
  features/technician/TechJobDetailScreen.tsx           #2 No-Show countdown
```

---

## Environment variables

Backend variables live in `Fixlinkmobile/backend/.env`; the modal copy lives in
`Fixlinkmobile/mobile/.env`. See the matching `.env.example` files for
copy-paste templates.

### AI provider (required for the AI parts of #6/#9/#10)

One OpenAI-compatible client serves any provider, so switching between the
self-hosted gateway and a hosted API is configuration, not code.

There are **two independent axes**:

| Axis | Used by | Variable prefix |
|---|---|---|
| **text** | the assistant (chatbot), the repair analyzer, technician ranking | `AI_*` |
| **vision** | #6/#9/#10 screening — device photos, IDs, selfies | `AI_VISION_*` |

Leave `AI_VISION_PROVIDER` unset and vision follows the text provider. Set it to
split them — the recommended setup keeps the chatbot on the local gateway and
sends image screening to Gemini, which reads real photos far better.

| Variable | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | inferred | Text provider: `gemini`, `omniroute`, or `custom` |
| `AI_VISION_PROVIDER` | follows `AI_PROVIDER` | Vision provider, same values |
| `AI_BASE_URL` / `AI_VISION_BASE_URL` | the provider preset | Endpoint base — no `/chat/completions` suffix |
| `AI_API_KEY` / `AI_API_KEYS` | — | Keys, when you would rather not use the provider's own variable. The list form is comma-separated |
| `AI_VISION_API_KEY` / `AI_VISION_API_KEYS` | — | Same, for the vision axis |
| `GEMINI_API_KEY` + `GEMINI_API_KEY_BACKUP` | — | Read in that order when the provider is `gemini` |
| `OMNIROUTE_API_KEY` | — | Read when the provider is `omniroute` |
| `AI_MODEL` | `gemini-3.8-flash` / `auto` | **Text** model: assistant, repair analyzer, ranking |
| `AI_VISION_MODEL` | the vision preset, else `AI_MODEL` | **Vision** model for screening — must be multimodal |
| `AI_VISION_FALLBACK_MODELS` | — | Comma-separated fallbacks tried in order when a model fails or is overloaded |
| `AI_MAX_TOKENS` | `2048` | Text budget. **Thinking models spend this on hidden reasoning**, so a few hundred returns an empty answer |
| `AI_VISION_MAX_TOKENS` | `2048` | Vision budget, same caveat |
| `AI_TIMEOUT_MS` | `15000` | Text per-request timeout |
| `AI_VISION_TIMEOUT_MS` | `60000` | Vision timeout. Images are slower than text on every hosted API |
| `AI_REASONING_EFFORT` | *(omitted)* | `none`/`minimal`/`low`/`medium`/`high`. `low` keeps a thinking model's budget small; invalid values are ignored |

**Several keys per provider.** Every key variable is tried in order, so an
exhausted free-tier key falls through to the next instead of taking screening
offline. Each axis only collects its **own** provider's keys — a Gemini key is
never sent to the local gateway, or the reverse.

The legacy `OMNIROUTE_*` names are the older spelling of these same settings, so
a `.env` written before `AI_*` existed keeps working untouched. They are honoured
**only while that axis is on OmniRoute**, so a `.env` switched to Gemini cannot
keep talking to the old gateway by accident.

Recommended preset — OmniRoute chat + Gemini vision, ready to paste:

```
AI_PROVIDER=omniroute
AI_MODEL=auto/best-chat
OMNIROUTE_API_KEY=<gateway key>

AI_VISION_PROVIDER=gemini
GEMINI_API_KEY=<primary key>
GEMINI_API_KEY_BACKUP=<backup key>
AI_VISION_MODEL=gemini-3.8-flash
AI_VISION_FALLBACK_MODELS=gemini-3.7-flash,gemini-3.5-flash-lite
AI_TIMEOUT_MS=60000
AI_VISION_TIMEOUT_MS=60000
AI_REASONING_EFFORT=low
```

> ⚠️ A 429 from Gemini is metered **per model**, not per key. The client walks
> the whole key × model chain before giving up, so a throttled primary still
> reaches a healthy fallback model. Keep at least one entry in
> `AI_VISION_FALLBACK_MODELS`.

### #2 — auto-suspend after a wasted technician trip

| Variable | Default | Purpose |
|---|---|---|
| `CUSTOMER_NOSHOW_WAIT_MINUTES` | `60` | How long the technician must wait at the location before a no-show counts. Clamped to **30–60** (the UAT window). |
| `CUSTOMER_NOSHOW_LIMIT` | `1` | Reported no-shows that suspend the customer |
| `CUSTOMER_NOSHOW_AUTO_SUSPEND` | `true` | Toggle the no-show rule |
| `CUSTOMER_LATE_CANCEL_LIMIT` | `1` | Cancels after the technician arrived that suspend the customer |
| `CUSTOMER_LATE_CANCEL_AUTO_SUSPEND` | `true` | Toggle the late-cancellation rule |

The mobile mirror of the wait window (display only — the server decides):

| Variable | Default | Purpose |
|---|---|---|
| `EXPO_PUBLIC_CUSTOMER_NOSHOW_WAIT_MINUTES` | `60` | Countdown shown beside the technician's No-Show action |
| `EXPO_PUBLIC_CUSTOMER_LATE_CANCEL_SUSPENDS` | `true` | Whether the customer's cancel prompt warns about suspension |

### #4 — booking regulations before the location step

Backend (`Fixlinkmobile/backend/.env`):

| Variable | Default | Purpose |
|---|---|---|
| `SUBMIT_TERMS_REQUIRED` | `true` | Refuse a submission that never accepted the regulations |
| `SUBMIT_TERMS_VERSION` | `2026-10-01` | Version stamp stored on the job (`terms_version`) |
| `SUBMIT_TERMS_REJECTION` | `You must accept the booking regulations…` | Message returned with the `400` |

Mobile (`Fixlinkmobile/mobile/.env`) — the modal copy, so the regulation can be
reworded without a rebuild:

| Variable | Default | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SUBMIT_TERMS_REQUIRED` | `true` | Show the modal at all |
| `EXPO_PUBLIC_TERMS_VERSION` | `2026-10-01` | Version shown in the modal header |
| `EXPO_PUBLIC_TERMS_TITLE` | `Booking regulations` | Modal title |
| `EXPO_PUBLIC_TERMS_INTRO` | see `submitTerms.ts` | Intro paragraph |
| `EXPO_PUBLIC_TERMS_MIN_LEAD_DAYS` | `1` | Number used by the **1-day rule** copy |
| `EXPO_PUBLIC_TERMS_CANCEL_WINDOW_HOURS` | `5` | Number used by the **5-hour rule** copy |
| `EXPO_PUBLIC_TERMS_LEAD_LABEL` / `_LEAD_RULE` | derived from the two above | Override the first rule's heading/body |
| `EXPO_PUBLIC_TERMS_CANCEL_LABEL` / `_CANCEL_RULE` | derived | Override the second rule |
| `EXPO_PUBLIC_TERMS_SAME_DAY_LABEL` / `_SAME_DAY_RULE` | same-day charge copy | Override the third rule |
| `EXPO_PUBLIC_TERMS_AGREE_LABEL` / `_CONTINUE_LABEL` / `_DECLINE_LABEL` | see `submitTerms.ts` | Button and checkbox labels |
| `EXPO_PUBLIC_TERMS_DECLINE_NOTICE` | see `submitTerms.ts` | Shown on step 3 after declining |

> Both sides read their own copy of the switch. Turning the modal off in the app
> no longer disables the server check, and vice versa — set both if you really
> want to remove the gate.

### #5 — fake address / harassment / spam bookings

| Variable | Default | Purpose |
|---|---|---|
| `REQUEST_SAFETY_ENABLED` | `true` | Master switch for the checks below |
| `ADDRESS_MIN_LENGTH` | `8` | Minimum address length |
| `ADDRESS_MIN_TOKENS` | `2` | Minimum words ("Bogo" alone is rejected) |
| `ADDRESS_MAX_REPEAT_RUN` | `4` | Longest allowed run of one character (`aaaa`) |
| `ADDRESS_GPS_TOLERANCE_KM` | `5` | How far a customer may be from the address they book |
| `ADDRESS_ENFORCEMENT` | `flag` | `flag` = warn the technician, `block` = refuse the submission |
| `SUBMIT_COOLDOWN_SECONDS` | `60` | Identical re-submit cooldown |
| `SPAM_WINDOW_HOURS` | `24` | Window for the repeated-booking check |
| `SPAM_SIMILARITY_THRESHOLD` | `0.8` | Jaccard similarity that counts as "the same request" |
| `SPAM_MAX_MATCHES` | `2` | Similar requests before a new one is refused |
| `MAX_BOOKINGS_PER_ADDRESS_PER_DAY` | `3` | Bookings at one address that raise the targeting flag |
| `REQUEST_SAFETY_UTC_OFFSET_HOURS` | falls back to `DAILY_LIMIT_UTC_OFFSET_HOURS`, then `8` | Offset that defines "today" for the address-targeting check (PH = UTC+8) |

### #6 — daily request cap + photo screening

| Variable | Default | Purpose |
|---|---|---|
| `MAX_REQUESTS_PER_DAY` | `3` | Requests allowed per customer per day |
| `DAILY_LIMIT_UTC_OFFSET_HOURS` | `8` | Timezone offset used to define "today" (PH = UTC+8) |
| `DAILY_LIMIT_FREE_STATUSES` | `cancelled,canceled` | Statuses that free up a slot |
| `PHOTO_SCREENING_ENABLED` | falls back to `CREDENTIAL_SCREENING_ENABLED`, then `true` | Master switch for device-photo screening |
| `PHOTO_AI_VISION_ENABLED` | falls back to `CREDENTIAL_AI_VISION_ENABLED`, then `true` | Enable the AI pass for photos |
| `PHOTO_FLAG_THRESHOLD` | `60` | Score at which a photo is flagged |
| `PHOTO_HIGH_THRESHOLD` | `80` | Score at which a photo is high risk |
| `PHOTO_AI_THRESHOLD` | `0.6` | AI-generated/edited likelihood that raises a flag |

### #7 — technician capacity

| Variable | Default | Purpose |
|---|---|---|
| `TECHNICIAN_MAX_ACTIVE_JOBS` | `1` | Hard ceiling; accept is refused at this count |
| `TECHNICIAN_BUSY_JOBS` | `3` | "busy" tier for feed ranking |
| `TECHNICIAN_AT_CAPACITY_JOBS` | `6` | "at_capacity" tier for AI exclusion |
| `ACTIVE_JOB_STATUSES` | `Accepted,Confirmed,Customer Ready,In Progress` | Statuses that count as active work |

### #8 — repeat scammer

| Variable | Default | Purpose |
|---|---|---|
| `CUSTOMER_SCAM_LIMIT` | `3` | Upheld reports that trigger auto-suspend |
| `CUSTOMER_SCAM_AUTO_SUSPEND` | `true` | Toggle auto-suspend |
| `SCAM_REPORTABLE_STATUSES` | `in progress,completed` | When a report can be filed |

### #9 / #10 — credential + facial verification

| Variable | Default | Purpose |
|---|---|---|
| `CREDENTIAL_SCREENING_ENABLED` | `true` | Master switch |
| `CREDENTIAL_AI_VISION_ENABLED` | `true` | Enable the AI vision pass |
| `CREDENTIAL_FACE_CHECK_ENABLED` | `true` | Enable face judging (#10) |
| `CREDENTIAL_SELFIE_REQUIRED` | `true` | Selfie required at signup |
| `CREDENTIAL_FLAG_THRESHOLD` | `60` | Score at which a credential is flagged |
| `CREDENTIAL_HIGH_THRESHOLD` | `80` | Score at which a credential is high risk |
| `CREDENTIAL_MIN_DIMENSION` | `300` | Minimum image width/height in px |
| `CREDENTIAL_MIN_FILE_BYTES` | `20480` | Minimum file size |
| `CREDENTIAL_FORENSIC_WEIGHT` | `0.4` | Weight of the local forensic pass |
| `CREDENTIAL_VISION_WEIGHT` | `0.6` | Weight of the AI vision pass |
| `CREDENTIAL_VISION_AI_THRESHOLD` | `0.6` | `aiGeneratedLikelihood` that flags AI generation |
| `CREDENTIAL_VISION_TAMPER_THRESHOLD` | `0.6` | `tamperingLikelihood` that flags tampering |
| `CREDENTIAL_FACE_MATCH_THRESHOLD` | `0.5` | Minimum face-match confidence |
| `CREDENTIAL_LIVENESS_RISK_THRESHOLD` | `0.6` | Liveness risk that flags a spoof |
| `CREDENTIAL_VISION_MAX_BYTES` | `2097152` | Max bytes sent to the vision model |
| `CREDENTIAL_VISION_TIMEOUT_MS` | `20000` | Vision request timeout |
| `CREDENTIAL_AI_MARKERS` | `midjourney,dall-e,dalle,stable diffusion,stablediffusion,comfyui,c2pa,synthid,govai,imagen,firefly,flux` | AI signatures searched in file bytes |
| `CREDENTIAL_EDITOR_MARKERS` | `photoshop,adobe photoshop,canva,snapseed,lightroom,gimp,picsart,pixlr` | Editor signatures searched in file bytes |
| `TECHNICIAN_REQUIRED_DOCS` | `facePhotoFile,governmentIdFile,certificateFile` | Required technician signup files |
| `CUSTOMER_REQUIRED_DOCS` | `facePhotoFile,governmentIdFile` | Required customer signup files |

### #11 — two-way ratings

| Variable | Default | Purpose |
|---|---|---|
| `RATING_MIN` | `1` | Lowest accepted rating |
| `RATING_MAX` | `5` | Highest accepted rating |
| `REVIEWER_ROLES` | `customer,technician` | Roles allowed to rate |
| `NEGATIVE_RATING_MAX` | `2` | A rating at or below this is "negative" |
| `CUSTOMER_NEGATIVE_RATING_LIMIT` | `3` | Negative ratings that auto-suspend the customer |
| `CUSTOMER_NEGATIVE_RATING_AUTO_SUSPEND` | `true` | Toggle the rule |

---

## Database migration

Run the block at the bottom of `Fixlinkmobile/backend/src/db/schema.sql`
(everything from `-- UAT #6/#8/#9/#10 MIGRATIONS` onward) in the Supabase SQL
Editor. It is idempotent (`if not exists` / `or replace`).

Verify afterwards:

```sql
select column_name from information_schema.columns
where table_name in ('users','reviews','jobs','service_incidents')
  and column_name in (
    'reviewer_role','scam_count','photo_risk_score','photo_risk_level',
    'safety_flags','safety_level',
    'credential_risk_score','credential_risk_level','selfie_url','face_check_level'
  )
order by column_name;

select proname from pg_proc
where proname in ('recompute_customer_rating','record_scam_incident');
```

Expect all the columns plus exactly **one** `record_scam_incident` (6-arg). If a
legacy 4-arg overload exists, drop it:

```sql
drop function if exists public.record_scam_incident(uuid, uuid, uuid, text);
```

---

## How to test

### Automated (no database needed)

```bash
cd Fixlinkmobile/backend
npm run typecheck     # syntax + require resolution
npm test              # 93 tests
node scripts/e2e-uat.js            # consolidated E2E for #2-#11 + the tokenization audits
node scripts/e2e-credential-screening.js   # screening/facial E2E (+1 live vision call)

cd ../mobile
npm run verify        # TypeScript + import check
```

### Live (read-only, safe against production)

```bash
cd Fixlinkmobile/backend
node scripts/check-uat-env.js      # which env vars are set, and effective values
node scripts/smoke-live.js         # schema presence checks against live Supabase
node scripts/probe-ai-provider.js  # two real AI calls: text JSON + vision JSON
```

### Re-screen legacy accounts (#9/#10 backfill)

```bash
node scripts/rescreen-credentials.js                 # dry run (list only)
node scripts/rescreen-credentials.js --apply         # write scores for unscored users
node scripts/rescreen-credentials.js --apply --force # re-screen everyone with an ID
```

`--force` is the upgrade path: run it again after `AI_VISION_MODEL` is
configured so accounts get the AI vision verdict too.

### Manual device checklist

| # | Steps | Expected |
|---|---|---|
| 2 | As the technician: Mark Arrival, then try No-Show straight away | Refused — "Wait N more minutes" (and the tile shows a countdown) |
| 2 | As the technician: wait out the window (or set `CUSTOMER_NOSHOW_WAIT_MINUTES=30` and wait 30 min after arrival), then tap No-Show | Report accepted; the customer is suspended and can no longer log in |
| 2 | As the customer: cancel a request after the technician marked arrival | Warning names the suspension; confirming suspends the account |
| 2 | As the customer: cancel before the technician arrives | Cancels normally, account untouched |
| 5 | Book with a gibberish address ("aaaaaaaa") | Rejected with "enter a real street address" |
| 5 | Book from far away at someone else's address | Technician sees a safety warning on the job |
| 5 | Submit the same request repeatedly | Repeated near-identical bookings are refused |
| 6 | Submit 3 requests in one day, then a 4th | 4th is rejected with a "daily limit" message |
| 6 | Submit a request with an obviously AI-generated device photo | Technician sees a "may be fake/AI-generated" warning on the job |
| 7 | Accept a job, then try to accept another | Blocked: "Finish it before accepting another request" |
| 8 | Technician reports the same customer on 3 completed jobs | 3rd report suspends the customer; they can no longer log in |
| 9 | Register a technician with a photo-of-a-screen ID | Admin review shows a credential risk level + flags |
| 10 | Register a customer/technician without a selfie | Signup is rejected ("A face photo is required.") |
| 10 | Register with a selfie that does not match the ID photo | Screened as a face mismatch (advisory, admin-visible) |
| 11 | Complete a job, rate the customer as the technician | Rating saved; customer's verified badge + portfolio visible on the card |
| 11 | Give the same customer 3 negative ratings (≤ 2 stars) | Customer is auto-suspended |

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `AI request failed (400)` | The provider rejects an optional parameter. It is retried once without `response_format` / `reasoning_effort` — if it still fails, unset `AI_REASONING_EFFORT`. |
| `AI request failed (503)` / `(429)` | The model is overloaded or throttled. Gemini meters quota **per model**, so the client walks every key × model before giving up. Add more `AI_VISION_FALLBACK_MODELS`; the chain is also retried once. |
| `AI returned an empty completion (finish_reason: length)` | A thinking model spent the whole budget on reasoning. Raise `AI_MAX_TOKENS` / `AI_VISION_MAX_TOKENS`. |
| Vision uses a text model | `AI_VISION_MODEL` unset → it falls back to `AI_MODEL`. Point it at a multimodal model, or set `AI_VISION_PROVIDER` to split the axes. |
| Screening always low / no face verdicts | No vision provider configured (`isVisionConfigured()` false). Local forensics still runs; the note says so. Run `probe-ai-provider.js`. |
| Assistant replies but screening does not (or the reverse) | The axes are split: check `AI_PROVIDER` **and** `AI_VISION_PROVIDER` separately in `check-uat-env.js`. |
| `report-scam` returns 500 | The `record_scam_incident` function/columns are missing. Run the migration block. |
| `report-no-show` returns `409 ARRIVAL_REQUIRED` | The technician never tapped **Mark Arrival**; the wait window is measured from that stamp. |
| `report-no-show` returns `409 CUSTOMER_NO_SHOW_WAIT` | The wait window has not passed yet. Fully expected — the message carries `remainingMinutes`. |
| A late cancellation does not suspend | `CUSTOMER_LATE_CANCEL_AUTO_SUSPEND=false`, a limit above 1, or the job had no `technician_arrival_timestamp`. |
| Daily limit not applied | `MAX_REQUESTS_PER_DAY` unset → default 3. Check with `check-uat-env.js`. |
| Accept is never blocked | `TECHNICIAN_MAX_ACTIVE_JOBS` too high, or the job status is not in `ACTIVE_JOB_STATUSES`. |
