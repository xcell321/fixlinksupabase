## Table: users

| Field Name | Data Type | Description |
|---|---|---|
| uid | String | User's unique identifier from Supabase Authentication. Used as the primary key of the `users` table. |
| email | String | User's email address used for login and communication. |
| name | String | User's full name. |
| role | String | System role of the user. Values: customer, technician, admin. |
| status | String | Account status. Values: active, pending_verification, rejected, suspended. |
| verificationStatus | String | Technician credential verification. Values: pending, verified, rejected. |
| createdAt | String | Date and time the account was created (ISO-8601). |
| updatedAt | String | Date and time the profile was last updated (ISO-8601). |
| phone | String | User's contact number. |
| address | String | User's address. |
| bio | String | Short introduction or background of the user. |
| skills | Array of String | List of repair skills for technicians (e.g., Refrigerator, Washing Machine). |
| yearsExperience | Number | Number of years of repair experience (technicians only). |
| governmentIdNumber | String | Government-issued ID number for technician vetting. |
| governmentIdFileUrl | String | URL of the uploaded government ID document. |
| certificateFileUrl | String | URL of the uploaded certification document. |
| latitude | Number | User's current latitude coordinate. |
| longitude | Number | User's current longitude coordinate. |
| locationUpdatedAt | String | Date and time the location was last updated (ISO-8601). |
| fcmToken | String | Device push-notification token (reserved column; push dispatch is not actively used in the current release). |
| portfolio | Array of Object | List of work samples. Each item contains {name, url, uploadedAt} or {title, description, imageUrl, completedAt}. |
| rating | Number | Average rating of the technician. |
| totalReviews | Number | Total number of reviews received. |
| isAvailable | Boolean | Availability status of the technician. Values: true, false. |
| profileImage | String | URL of the user's profile picture. |
| rejectionReason | String | Reason provided when a technician application is rejected. |

## Table: jobs — Pending / unassigned view (was `repairRequests`)

| Field Name | Data Type | Description |
|---|---|---|
| customerName | String | Full name of the customer who submitted the request. |
| customerUid | String | Unique identifier of the customer (references users.uid). |
| applianceType | String | Type of appliance or device to be repaired (e.g., Refrigerator, Laptop). |
| category | String | Category of the appliance (e.g., Home Appliances). |
| description | String | Detailed description of the problem. |
| location | String | Address or location where repair service is needed. |
| latitude | Number | Latitude coordinate of the service location. |
| longitude | Number | Longitude coordinate of the service location. |
| preferredDate | String | Preferred date for the repair service. |
| preferredTime | String | Preferred time window for the repair (e.g., Morning (8AM-12PM)). |
| scheduledDate | String | Full date and time the repair is scheduled (ISO-8601). |
| photoUrl | String | URL of the uploaded photo of the appliance. |
| status | String | Status of the repair request. Values: Pending, Cancelled. |
| isOther | Boolean | Flag indicating whether the appliance is an "other" category. |
| declinedBy | String | UID of the technician who declined the request. |
| createdAt | String | Date and time the request was submitted (ISO-8601). |
| updatedAt | String | Date and time the request was last updated (ISO-8601). |

## Table: jobs — Accepted / Completed view (was `acceptedJobs`)

| Field Name | Data Type | Description |
|---|---|---|
| customerName | String | Full name of the customer. |
| customerUid | String | Unique identifier of the customer (references users.uid). |
| applianceType | String | Type of appliance or device being repaired. |
| category | String | Category of the appliance. |
| description | String | Description of the repair problem. |
| location | String | Address of the service location. |
| latitude | Number | Latitude coordinate of the service location. |
| longitude | Number | Longitude coordinate of the service location. |
| preferredDate | String | Preferred date of service. |
| preferredTime | String | Preferred time window of service. |
| scheduledDate | String | Full scheduled date and time (ISO-8601). |
| photoUrl | String | URL of the uploaded appliance photo. |
| originalRequestId | String | ID of the original repairRequests document (for audit). |
| technicianUid | String | Unique identifier of the assigned technician (references users.uid). |
| technicianName | String | Full name of the assigned technician. |
| status | String | Status of the job. Values: Accepted, In Progress, Completed, Cancelled. |
| verificationCode | String | Random 4-digit OTP used to verify job completion. |
| acceptedAt | String | Date and time the technician accepted the job (ISO-8601). |
| completedAt | String | Date and time the job was completed (ISO-8601). |
| locationUpdatedAt | String | Date and time the customer's live location was last updated (ISO-8601). |
| reviewId | String | ID of the review document associated with this job (references reviews). |
| reviewedAt | String | Date and time the job was reviewed (ISO-8601). |

## Table: messages (was `acceptedJobs/{jobId}/messages` subcollection)

| Field Name | Data Type | Description |
|---|---|---|
| senderUid | String | Unique identifier of the message sender (references users.uid). |
| senderName | String | Full name of the message sender. |
| senderRole | String | Role of the sender. Values: customer, technician. |
| text | String | Content of the chat message. |
| timestamp | String | Date and time the message was sent (ISO-8601). |
| readBy | Array of String | List of UIDs who have read the message (derived from the `message_reads` association table). |

## Table: reviews

| Field Name | Data Type | Description |
|---|---|---|
| technicianUid | String | Unique identifier of the technician being reviewed (references users.uid). |
| technicianName | String | Full name of the technician. |
| customerName | String | Full name of the customer who left the review. |
| rating | Number | Rating given by the customer, integer from 1 to 5. |
| comment | String | Written feedback/comment from the customer. |
| requestId | String | ID of the completed job being reviewed (references jobs.id). |
| createdAt | String | Date and time the review was submitted (ISO-8601). |

## Table: notifications

| Field Name | Data Type | Description |
|---|---|---|
| type | String | Type of notification. Currently only chat. |
| recipientUid | String | UID of the user receiving the notification (references users.uid). |
| senderUid | String | UID of the user who triggered the notification (references users.uid). |
| senderName | String | Full name of the sender. |
| jobId | String | ID of the related job (references jobs.id). |
| messageId | String | ID of the related chat message (references messages.id). |
| text | String | Notification message content. |
| timestamp | String | Date and time the notification was created (ISO-8601). |
| read | Boolean | Flag indicating whether the notification has been read. Values: true, false. |
| readAt | String | Date and time the notification was read (ISO-8601). |

## Table: announcements

| Field Name | Data Type | Description |
|---|---|---|
| id | String | Unique identifier of the announcement (primary key). |
| title | String | Title of the announcement. |
| message | String | Body content of the announcement. |
| active | Boolean | Flag indicating if the announcement is currently active/visible. |
| createdAt | String | Date and time the announcement was created (ISO-8601). |

## Table: categories

| Field Name | Data Type | Description |
|---|---|---|
| name | String | Name of the appliance category (e.g., Home Appliances). |
| devices | Array of String | List of device names under the category. |
| createdAt | String | Date and time the category was created (ISO-8601). |
| updatedAt | String | Date and time the category was last updated (ISO-8601). |