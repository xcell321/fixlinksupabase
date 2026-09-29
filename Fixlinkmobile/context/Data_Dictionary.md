# FixLink Data Dictionary (Supabase PostgreSQL)

> Naming: database columns are `snake_case` (see `backend/src/db/schema.sql` and `context/SCHEMA.md`). The Express API serializes rows to `camelCase` for the mobile client (for example `customer_uid` becomes `customerUid` via `domain/jobSerializer.js`). This file uses the mobile-facing `camelCase` names; map them back to `snake_case` when writing SQL.

## Table: users

| Field Name | Data Type | Description |
|---|---|---|
| id | String (UUID) | Primary key. Equals the Supabase Auth user id. |
| name | String | User full name. |
| email | String | Email address used for login and communication. |
| phone | String | Contact mobile number. |
| address | String | User address. |
| role | String | System role. Values: customer, technician, admin. |
| status | String | Account status. Values: active, pending_verification, rejected, suspended. |
| verificationStatus | String | Technician credential verification. Values: unverified, pending, verified, rejected. |
| rejectionReason | String | Reason given when a technician application is rejected. |
| governmentIdNumber | String | Government-issued ID number for technician vetting. |
| governmentIdFileUrl | String | Public URL of the uploaded government ID. |
| certificateFileUrl | String | Public URL of the uploaded TESDA or vocational certificate. |
| bio | String | Short introduction or background of the user. |
| skills | Array of String | Technician skill tags (for example Refrigerator, Washing Machine, General Repair). |
| yearsExperience | Number | Years of repair experience (technicians only). |
| latitude | Number | Last reported GPS latitude. |
| longitude | Number | Last reported GPS longitude. |
| locationUpdatedAt | String (ISO-8601) | Date and time the location was last updated. |
| fcmToken | String | Push-notification token (reserved; push dispatch is not actively used, notifications are in-app only). |
| portfolio | Array of Object | Proof-of-work repairs. Each item holds name, url, uploadedAt, repairType, model. One photo per request; upload requires repairType and model. |
| rating | Number | Aggregated average rating from 1.0 to 5.0. |
| totalReviews | Number | Count of submitted reviews. |
| isAvailable | Boolean | Technician availability toggle. True means open for jobs. |
| profileImage | String | Public URL of the profile picture. |
| noShowCount | Number | Customer no-show counter, bumped atomically by record_no_show(). |
| updatedAt | String (ISO-8601) | Date and time the profile was last updated. |
| createdAt | String (ISO-8601) | Date and time the account was created. |

## Table: jobs

| Field Name | Data Type | Description |
|---|---|---|
| id | String (UUID) | Primary key. Auto-generated job identifier. |
| originalRequestId | String (UUID) | Legacy audit self-reference; keeps old dual-ID lookups working. |
| customerUid | String (UUID) | Requesting customer (references users.id). |
| customerName | String | Customer display name for the job ticket. |
| technicianUid | String (UUID) | Assigned technician (references users.id). |
| technicianName | String | Assigned technician display name. |
| applianceType | String | Device name (for example Washing Machine, Laptop) or parent category. |
| category | String | Parent admin-managed category (for example Home Appliances). |
| description | String | Customer description of the failure. |
| location | String | Formatted service address or community landmark. |
| latitude | Number | Geocoded service-location latitude (submit-time snapshot). |
| longitude | Number | Geocoded service-location longitude (submit-time snapshot). |
| customerLatitude | Number | Customer live GPS latitude, kept separate so live pings never overwrite routing. |
| customerLongitude | Number | Customer live GPS longitude, kept separate so live pings never overwrite routing. |
| confirmedServiceLocation | String | Travel destination snapshot for the technician. |
| serviceLatitude | Number | Service destination latitude used for routing. |
| serviceLongitude | Number | Service destination longitude used for routing. |
| preferredDate | String | Requested service date. |
| preferredTime | String | Requested time window (for example Morning 8AM-12PM). |
| scheduledDate | String | Full scheduled date-time string. |
| photoUrl | String | Public URL of the uploaded appliance photo. |
| status | String | Lifecycle state. Values: Pending, Accepted, Confirmed, Customer Ready, In Progress, Completed, Cancelled, No-Show. Active workload means Accepted, Confirmed, Customer Ready, or In Progress. |
| isOther | Boolean | Free-text other-device flag. |
| declinedBy | String (UUID) | Technician who dismissed this job from their feed. |
| verificationCode | String | 4-digit completion OTP generated atomically on acceptance. |
| verificationCodeForArrival | String | Arrival confirmation code for the confirm, ready, and arrive workflow. |
| acceptedAt | String (ISO-8601) | Date and time the job was accepted. |
| customerConfirmationTimestamp | String (ISO-8601) | Customer confirm-repair timestamp. |
| customerReadyTimestamp | String (ISO-8601) | Customer-ready timestamp. |
| startedAt | String (ISO-8601) | Date and time the repair began. |
| technicianArrivalTimestamp | String (ISO-8601) | Technician arrival timestamp. |
| completedAt | String (ISO-8601) | Date and time of verified completion. |
| cancelledAt | String (ISO-8601) | Date and time of cancellation. |
| cancellationStage | String | Stage at cancel. Values: before_accept, after_accept, after_confirmation, after_ready, after_travel. |
| cancelledBy | String | Who cancelled the job. |
| cancellationReason | String | Cancel reason text. |
| locationUpdatedAt | String (ISO-8601) | Date and time the live location was last updated. |
| reviewId | String (UUID) | Associated review (references reviews.id). One review per completed job. |
| reviewedAt | String (ISO-8601) | Date and time the review was submitted. |
| updatedAt | String (ISO-8601) | Date and time the job was last updated. |
| createdAt | String (ISO-8601) | Date and time the request was submitted. |

## Table: messages

| Field Name | Data Type | Description |
|---|---|---|
| id | String (UUID) | Primary key. Auto-generated message identifier. |
| jobId | String (UUID) | Job this message belongs to (references jobs.id). |
| senderUid | String (UUID) | Message sender (references users.id). |
| senderName | String | Display name of the sender. |
| senderRole | String | Sender role. Values: customer, technician, admin. |
| text | String | Chat body. Never null; image-only messages store an empty string. At least text or photo is required. |
| imageUrl | String | Public URL of an optional chat photo, rendered inline. |
| timestamp | String (ISO-8601) | Date and time the message was sent. |

## Table: message_reads

| Field Name | Data Type | Description |
|---|---|---|
| messageId | String (UUID) | Read message (references messages.id). Part of the composite primary key. |
| userUid | String (UUID) | Reader (references users.id). Part of the composite primary key. |
| readAt | String (ISO-8601) | Date and time the message was read. |

## Table: reviews

| Field Name | Data Type | Description |
|---|---|---|
| id | String (UUID) | Primary key. Auto-generated review identifier. |
| technicianUid | String (UUID) | Reviewed technician (references users.id). Indexed for lookup. |
| technicianName | String | Reviewed technician display name. |
| customerUid | String (UUID) | Reviewing customer (references users.id). Indexed for lookup. |
| customerName | String | Reviewing customer display name. |
| rating | Number | Star rating, integer from 1 to 5. |
| comment | String | Written customer feedback. |
| requestId | String (UUID) | Completed job being reviewed (references jobs.id). |
| createdAt | String (ISO-8601) | Date and time the review was submitted. |

## Table: notifications

| Field Name | Data Type | Description |
|---|---|---|
| id | String (UUID) | Primary key. Auto-generated notification identifier. |
| recipientUid | String (UUID) | Receiver (references users.id). Only the recipient may read or mark it. |
| senderUid | String (UUID) | User who triggered the notification (references users.id). |
| senderName | String | Display name of the sender. |
| jobId | String (UUID) | Related job (references jobs.id, deleted with the job; the app keeps its optimistic read state). |
| messageId | String (UUID) | Related chat message (references messages.id). |
| type | String | Notification kind. Values: chat for a new message, job for a request update. System is reserved and not emitted. Routing uses type plus jobId and messageId. |
| text | String | Short notification body. |
| read | Boolean | Read flag. First tap sets read to true optimistically and decrements the badge by one. |
| readAt | String (ISO-8601) | Date and time the notification was read. Persisted across poll, reopen, and restart. |
| timestamp | String (ISO-8601) | Date and time the notification was created. Feed sorts newest first, limit 100. |

## Table: announcements

| Field Name | Data Type | Description |
|---|---|---|
| id | String (UUID) | Primary key. Auto-generated identifier. |
| title | String | Headline text. |
| message | String | Full announcement body. |
| active | Boolean | Display toggle. |
| createdAt | String (ISO-8601) | Date and time the announcement was created. |

## Table: categories

| Field Name | Data Type | Description |
|---|---|---|
| id | String (UUID) | Primary key. Auto-generated identifier. |
| name | String | Category name (for example Home Appliances). Unique. |
| devices | Array of String | Device list under the category, drives the customer picker and skill chips. |
| createdAt | String (ISO-8601) | Date and time the category was created. |
| updatedAt | String (ISO-8601) | Date and time the category was last updated. |

## Table: service_incidents

| Field Name | Data Type | Description |
|---|---|---|
| id | String (UUID) | Primary key. Auto-generated identifier. |
| jobId | String (UUID) | Related job (references jobs.id, set null if the job is deleted). |
| customerUid | String (UUID) | Customer involved (references users.id, set null if the account is deleted). |
| technicianUid | String (UUID) | Technician involved (references users.id, set null if the account is deleted). |
| type | String | Incident kind. Values: cancellation, no_show. |
| stage | String | Stage at incident. Values: before_accept, after_accept, after_confirmation, after_ready, after_travel. |
| reason | String | Incident reason text. |
| status | String | Review state. Values: logged, warning, flagged, reviewed, resolved. Defaults to logged. |
| createdAt | String (ISO-8601) | Date and time the incident was logged. |
| resolvedAt | String (ISO-8601) | Date and time the incident was resolved. |

## Table: reports

| Field Name | Data Type | Description |
|---|---|---|
| id | String (UUID) | Primary key. Auto-generated identifier. |
| reporterUid | String (UUID) | Reporting user (references users.id, set null if the account is deleted). |
| reportedUserUid | String (UUID) | Reported user (references users.id, set null if the account is deleted). |
| reportedUserName | String | Display name of the reported user. |
| title | String | Report title. |
| reason | String | Report reason. |
| description | String | Report body. |
| status | String | Handling state. Defaults to open. |
| resolution | String | Admin resolution text. |
| userStatus | String | Resulting user status action. |
| createdAt | String (ISO-8601) | Date and time the report was created. |
| resolvedAt | String (ISO-8601) | Date and time the report was resolved. |

## Table: password_resets

| Field Name | Data Type | Description |
|---|---|---|
| id | String (UUID) | Primary key. Auto-generated identifier. |
| userId | String (UUID) | Account the reset was issued for (references users.id, deleted with the account). |
| tokenHash | String | SHA-256 fingerprint of the reset token; the raw token is never stored. |
| expiresAt | String (ISO-8601) | Link expiry, 24 hours from issuance. |
| usedAt | String (ISO-8601) | Redemption timestamp; non-null means the link is spent and single-use. |
| createdAt | String (ISO-8601) | Date and time the reset was issued. |
