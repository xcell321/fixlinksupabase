# In-App Chat Synchronization & Message Persistence Implementation Plan

The user logged in as a technician and sent a chat message to a customer. When logging in as the customer, the Messages screen displays "No Active Conversations" and the sent message is completely missing.

## Root Cause Analysis
1. **No Backend Persistence for Messages:** In `ChatScreen.js`, messages were stored only in React's local component state (`useState(messagesByConv)`). There were no backend endpoints or database queries to persist messages. Once a user switched accounts or navigated away, messages vanished.
2. **Customer Name Matching Discrepancy:** The customer account in `users` collection has `name: "Edsiel Ursal"`, while existing jobs in `acceptedJobs` have `customerName: "edsiel"`. The backend endpoint `GET /api/requests/customer/:customerName` did a strict equality check (`job.customerName === req.params.customerName`). Because `"edsiel" !== "Edsiel Ursal"`, the query returned an empty list, showing "No Active Conversations".
3. **Missing `customerUid` Linkage:** Repair requests were submitted without saving the customer's `uid`, preventing resilient user-based lookups.

---

## Proposed Changes

### 1. Backend (`backend/src/routes/requests.js`)
- **Resilient Customer Lookup:** Update `GET /api/requests/customer/:customerName` to support:
  - Matching by `customerUid` query parameter (`?customerUid=...`).
  - Case-insensitive comparison (`toLowerCase().trim()`).
  - First name / substring matching so "Edsiel Ursal" matches "edsiel".
- **Chat Message Persistence Endpoints:**
  - `GET /api/requests/accepted/:id/messages`: Fetches all messages from the Firestore subcollection `acceptedJobs/:id/messages` ordered by `timestamp asc`.
  - `POST /api/requests/accepted/:id/messages`: Saves a message with fields `{ senderUid, senderName, senderRole, text, timestamp }`.

### 2. Firestore Historical Data Alignment
- Run a migration script to update existing `acceptedJobs` and `repairRequests` where `customerName` is "edsiel" to set `customerUid: "k2lEHRP4xUZ9K3loZlHNCjdjTyp2"` and `customerName: "Edsiel Ursal"`, ensuring immediate visibility on both accounts.

### 3. API Client (`mobile/src/screens/services/api.js`)
- Add `fetchJobMessages(jobId)`: calls `GET /requests/accepted/${jobId}/messages`.
- Add `sendJobMessage(jobId, messageData)`: calls `POST /requests/accepted/${jobId}/messages`.
- Update `fetchCustomerRequests(customerName, customerUid)` to pass `customerUid` as query parameter.

### 4. Customer & Technician Chat (`mobile/src/screens/customer/ChatScreen.js`)
- Update `loadConversations` to pass `currentUser.uid` alongside `currentUser.name`.
- Load real messages from `fetchJobMessages(selectedConversation.id)` when a conversation is opened.
- Implement polling interval (every 3 seconds) while inside an active conversation so new messages sync live between technician and customer.
- Update `handleSendMessage` to send the message payload to `sendJobMessage(...)` and append to messages.
- Accurately determine bubble alignment (`isMe = msg.senderUid === currentUser.uid || msg.senderRole === currentUser.role`).

### 5. Submit Request (`mobile/src/screens/customer/SubmitRequestScreen.js` & `AppNavigator.js`)
- Pass `currentUser` (or `customerUid: user.uid`) to `SubmitRequestScreen` so new service requests always store `customerUid`.

---

## Verification Plan

### Automated / Backend Verification
- Test `GET /api/requests/customer/Edsiel%20Ursal` and verify it returns the active accepted jobs.
- Test `POST /api/requests/accepted/:id/messages` and `GET /api/requests/accepted/:id/messages` to verify messages are stored and retrieved in Firestore.

### End-to-End Verification
- Log in as Technician (e.g., Dustine Villaruz or Benjie Quinio).
- Go to Messages tab or Job -> "Message Customer".
- Send a message (e.g. "Hello, I am on my way with the tools!").
- Log out and log in as Customer (Edsiel Ursal).
- Go to Messages tab: Verify active conversation is displayed (not "No Active Conversations").
- Open conversation: Verify the technician's message is visible on the left side.
- Reply as Customer (e.g. "Thank you, see you soon!").
- Confirm both messages persist across reloads and account switches.
