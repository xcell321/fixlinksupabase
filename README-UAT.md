# FixLink — UAT Features #6–#11

Implementation, configuration and testing guide for the six UAT requirements.

> **Design rule:** nothing is hardcoded. Every tunable is read from
> `process.env` on each call, with a documented fallback so an empty `.env`
> still works. Fallbacks are the `DEFAULT_*` constants inside the policy
> modules — they are not inline magic values.

---

## Feature summary

| # | Requirement | Behaviour |
|---|---|---|
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
    requestSafety.js            #5  address sanity, similarity, spam policy
    dailyRequestLimit.js        #6  env-driven daily cap
    photoScreening.js           #6  device-photo policy + prompts
    verificationRequirements.js #10 required signup docs per role
    ratingRules.js              #11 rating range + negative-rating policy
    scamPolicy.js               #8  scam-strike policy
    credentialScreening.js      #9/#10 flags, thresholds, scoring, face/identity judging
    jobWorkflow.js              #8  isScamReportable() status gate
    jobSerializer.js            #6  photo risk fields on the job payload
    userSerializer.js           #8/#9/#10 scam, credential and face fields
  services/
    credential/documentForensics.js      #9  zero-dependency local forensics
    credential/credentialScreeningService.js #9/#10 orchestrator
    credential/photoScreeningService.js  #6  repair-photo orchestrator
    jobs/requestSafetyService.js         #5  fake address / spam / harassment
    jobs/scamReportService.js            #8  report + auto-suspend
    jobs/customerRatingService.js        #11 technician -> customer
    jobs/jobSubmitService.js             #6  daily cap + photo screening
    jobs/jobFeedService.js               #11 customer badge/portfolio enrichment
    workloadService.js                   #7  capacity thresholds
    omniRoute.js                         #9/#10 visionComplete() fallback chain
  routes/requests.js                     # POST /:id/rate-customer, POST /:id/report-scam
```

---

## Environment variables

All variables live in `Fixlinkmobile/backend/.env`. See
`Fixlinkmobile/backend/.env.example` for a copy-paste template.

### AI gateway (required for the AI parts of #6/#9/#10)

| Variable | Default | Purpose |
|---|---|---|
| `OMNIROUTE_BASE_URL` | `http://localhost:20128/v1` | Gateway base URL |
| `OMNIROUTE_API_KEY` | — | Gateway key (required) |
| `OMNIROUTE_MODEL` | `auto` | **Text** model: assistant, repair analyzer, ranking |
| `OMNIROUTE_VISION_MODEL` | falls back to `OMNIROUTE_MODEL` | **Vision** model for screening — must be multimodal |
| `OMNIROUTE_VISION_FALLBACK_MODELS` | — | Comma-separated fallbacks tried in order |
| `OMNIROUTE_TIMEOUT_MS` | `15000` | Request timeout |

> ⚠️ If `OMNIROUTE_VISION_MODEL` is not set, vision calls fall back to the text
> model and fail (e.g. a Copilot CLI 466 error). Screening then degrades to
> local forensics only — it never blocks registration.

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
node scripts/e2e-uat.js            # consolidated E2E for #6-#11 + tokenization audit
node scripts/e2e-credential-screening.js   # screening/facial E2E (+1 live vision call)

cd ../mobile
npm run verify        # TypeScript + import check
```

### Live (read-only, safe against production)

```bash
cd Fixlinkmobile/backend
node scripts/check-uat-env.js      # which env vars are set, and effective values
node scripts/smoke-live.js         # schema presence checks against live Supabase
```

### Re-screen legacy accounts (#9/#10 backfill)

```bash
node scripts/rescreen-credentials.js                 # dry run (list only)
node scripts/rescreen-credentials.js --apply         # write scores for unscored users
node scripts/rescreen-credentials.js --apply --force # re-screen everyone with an ID
```

`--force` is the upgrade path: run it again after `OMNIROUTE_VISION_MODEL` is
configured so accounts get the AI vision verdict too.

### Manual device checklist

| # | Steps | Expected |
|---|---|---|
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
| `OmniRoute vision failed (466)` | `OMNIROUTE_VISION_MODEL` not set (falls back to a text model). Set it to a multimodal model. |
| Screening always low / no face verdicts | AI vision disabled or gateway unreachable. Local forensics still runs; the note says so. |
| `report-scam` returns 500 | The `record_scam_incident` function/columns are missing. Run the migration block. |
| Daily limit not applied | `MAX_REQUESTS_PER_DAY` unset → default 3. Check with `check-uat-env.js`. |
| Accept is never blocked | `TECHNICIAN_MAX_ACTIVE_JOBS` too high, or the job status is not in `ACTIVE_JOB_STATUSES`. |
