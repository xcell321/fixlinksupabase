# In-App Chat Synchronization & Message Persistence Implementation Plan

> Status: completed and historical. The chat persistence fix, resilient customer lookup, workload and capacity system, and notification two-step described below are implemented. Current backend paths are thin `backend/src/routes/requests.js` delegating to `controllers/` + `services/` + `repositories/`, workload logic in `backend/src/services/workloadService.js`, schedule visibility in `backend/src/services/techScheduleService.js`, and the mobile client in `mobile/src/services/api/` with screens under `mobile/src/features/`. Supabase PostgreSQL is the store; Firestore references below describe the legacy system the migration replaced.

The user logged in as a technician and sent a chat message to a customer. When logging in as the customer, the Messages screen displays "No Active Conversations" and the sent message is completely missing.

## Root Cause Analysis
1. **No Backend Persistence for Messages:** In `ChatScreen.tsx`, messages were stored only in React's local component state (`useState(messagesByConv)`). There were no backend endpoints or database queries to persist messages. Once a user switched accounts or navigated away, messages vanished.
2. **Customer Name Matching Discrepancy:** The customer account in `users` collection has `name: "Edsiel Ursal"`, while existing jobs in `acceptedJobs` have `customerName: "edsiel"`. The backend endpoint `GET /api/requests/customer/:customerName` did a strict equality check (`job.customerName === req.params.customerName`). Because `"edsiel" !== "Edsiel Ursal"`, the query returned an empty list, showing "No Active Conversations".
3. **Missing `customerUid` Linkage:** Repair requests were submitted without saving the customer's `uid`, preventing resilient user-based lookups.

---

## Proposed Changes

### 1. Backend (`backend/src/routes/requests.js` + controllers/services)
- **Resilient Customer Lookup:** `GET /api/requests/customer/:customerName` supports:
  - Matching by `customerUid` query parameter (`?customerUid=...`).
  - Case-insensitive comparison (`toLowerCase().trim()`).
  - First name / substring matching so "Edsiel Ursal" matches "edsiel".
- **Chat Message Persistence Endpoints (Supabase `messages` table, legacy Firestore subcollection `acceptedJobs/:id/messages` replaced):**
  - `GET /api/requests/accepted/:id/messages`: Fetches all messages for the job from Supabase `messages` ordered by `timestamp asc`.
  - `POST /api/requests/accepted/:id/messages`: Saves a message with fields `{ senderUid, senderName, senderRole, text, timestamp }`.

### 2. Legacy data alignment (historical, Firestore era)
- Run a migration script to update existing `acceptedJobs` and `repairRequests` where `customerName` is "edsiel" to set `customerUid: "k2lEHRP4xUZ9K3loZlHNCjdjTyp2"` and `customerName: "Edsiel Ursal"`, ensuring immediate visibility on both accounts.

### 3. API Client (`mobile/src/services/api/`)
- Add `fetchJobMessages(jobId)`: calls `GET /requests/accepted/${jobId}/messages`.
- Add `sendJobMessage(jobId, messageData)`: calls `POST /requests/accepted/${jobId}/messages`.
- Update `fetchCustomerRequests(customerName, customerUid)` to pass `customerUid` as query parameter.

### 4. Customer & Technician Chat (`mobile/src/features/customer/ChatScreen.tsx`)
- Update `loadConversations` to pass `currentUser.uid` alongside `currentUser.name`.
- Load real messages from `fetchJobMessages(selectedConversation.id)` when a conversation is opened.
- Implement polling interval (every 3 seconds) while inside an active conversation so new messages sync live between technician and customer.
- Update `handleSendMessage` to send the message payload to `sendJobMessage(...)` and append to messages.
- Accurately determine bubble alignment (`isMe = msg.senderUid === currentUser.uid || msg.senderRole === currentUser.role`).

### 5. Submit Request (`mobile/src/features/customer/SubmitRequestScreen.tsx` & `mobile/src/navigation/AppNavigator.tsx`)
- Pass `currentUser` (or `customerUid: user.uid`) to `SubmitRequestScreen` so new service requests always store `customerUid`.

### 6. Technician Workload & Capacity (`backend/src/services/workloadService.js`, `backend/src/routes/ai.js`, `backend/src/routes/requests.js`)
- Helper `getTechnicianActiveJobCount` / `getActiveJobCountsForTechnicians` counts `status IN (Accepted,Confirmed,Customer Ready,In Progress)` (`count head:true`). Levels `0–2 available`, `3–5 busy`, `6+ at_capacity`.
- AI `GET /api/ai/recommend` annotates `activeJobs/workloadStatus`, filters `at_capacity`, `-0.06` penalty for `busy`, sorts, adds schedule separately. Exposes `{activeJobs, workloadStatus}`.
- Accept `PUT /api/requests/:id/accept` re-checks count before `rpc accept_job`; `at_capacity` → `409 TECHNICIAN_AT_CAPACITY`. `GET /api/requests/technician/:uid/workload` for UI. Auto-recover when `≤5`.
- Mobile `AvailableJobsScreen` `fetchTechnicianWorkload` → `3–5` `You're Currently Busy… Cancel/Accept Anyway`, `6+` `You're At Capacity… OK` + block; `RequestProgressScreen` `focusedJobId/autoExpandReview` → `Busy/Available — X active jobs` chip (teal/gold) plus separate schedule row.

### 7. Notification Two-Step (`mobile/src/navigation/AppNavigator.tsx`, `backend/src/routes/requests.js`)
- `GET /api/requests/notifications` (10s poll, limit 100, read+unread) badge `filter(!read).length`; `PUT /api/requests/notifications/:id/read` optimistic fire-and-forget (404 keep optimistic), `GET /api/requests/job/:id` ownership check → `chat`→ thread, `job` Completed→ `RequestProgressScreen` focused, else `RequestDetailsScreen`/tech `highlightedJobId`.

---

## Verification Plan

### Automated / Backend Verification
- Test `GET /api/requests/customer/Edsiel%20Ursal` and verify it returns the active accepted jobs.
- Test `POST /api/requests/accepted/:id/messages` and `GET /api/requests/accepted/:id/messages` to verify messages are stored and retrieved in Supabase PostgreSQL.
- Test workload: `0–2` → `available` in AI, `3–5` → `busy` still in AI with penalty, `6+` → excluded; `PUT /:id/accept` at `5` → `200`, at `6` → `409 TECHNICIAN_AT_CAPACITY`, after `Completed` → `5` → eligible again; `GET /technician/:uid/workload` auth.

### End-to-End Verification
- Log in as Technician (e.g., Dustine Villaruz or Benjie Quinio).
- Go to Messages tab or Job -> "Message Customer".
- Send a message (e.g. "Hello, I am on my way with the tools!").
- Log out and log in as Customer (Edsiel Ursal).
- Go to Messages tab: Verify active conversation is displayed (not "No Active Conversations").
- Open conversation: Verify the technician's message is visible on the left side.
- Reply as Customer (e.g. "Thank you, see you soon!").
- Confirm both messages persist across reloads and account switches.
- Technician with `3–5` active jobs → AI card shows `Busy — 4 active jobs` + schedule `2 jobs scheduled on this date`; accept shows busy warning; `6+` not in AI, accept shows at-capacity `OK`.
- Notification 1st tap → detail + badge –1 no spinner; 2nd tap same → exact `chat`/Completed `progress+review`/`details`/tech `highlightedCard`; deleted job → `detailError` no crash; refresh retains read.
