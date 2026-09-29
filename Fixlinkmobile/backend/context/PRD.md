# Product Requirements Document (PRD) — FixLink Mobile
**Cebu Roosevelt Memorial Colleges — College of Computer Studies**  
*Bachelor of Science in Information Technology (BSIT)*  
*Systems Analysis and Design (SAD) / Capstone Project — January 2026*  
**Project Title:** FIXLINK: AN ALL-AROUND TECHNICIAN SERVICE PLATFORM FOR REPAIR REQUEST MANAGEMENT AND HOME-BASED TECHNICIAN DISPATCH  
**Researchers:** Jonard Masong, James Robert Rojas, Edsiel Ursal  
**Faculty Advisers:** Carl Joshua Cosep | Marjorie Reso, MIT | Dr. Jonel D. Gelig  

---

## 1. Executive Summary & Purpose

In contemporary households and small business environments, appliances and digital devices—ranging from system units, computer monitors, and laptops to refrigerators, washing machines, and water heaters—are indispensable to daily life. However, when equipment breaks down, customers encounter severe friction locating qualified, available, and trustworthy repair technicians who are willing to perform on-site home service.

**FixLink** is an all-around technician service platform designed to bridge the gap between customers in distress and skilled technicians in the community. It provides automated skill-matching, distance-aware technician dispatch, turn-by-turn navigation for home service, real-time job status tracking, secure OTP job completion, and a livelihood portal for independent, part-time, or unemployed technicians.

---

## 2. Problem Statement (From Chapter 1)

This project directly addresses the five core challenges documented in **Chapter 1: Statement of the Problem**:

1. **Inefficient and Unreliable Technician Sourcing Process:**  
   Customers currently rely on word-of-mouth referrals, newspaper classified ads, or informal social media postings. This is slow, unreliable, and provides no guarantee that the individual possesses the specific skills required for the broken appliance.
2. **Lack of Real-Time Technician Availability:**  
   There is no existing system showing customers which technicians are currently active, available, and located near their neighborhood, resulting in long turnaround times and repeated failed inquiries.
3. **Absence of a Centralized Repair Request Platform:**  
   Repair requests are coordinated through disjointed SMS, voice calls, or paper logs. This informal process leads to lost requests, scheduling conflicts, lack of accountability, and zero status visibility.
4. **Limited Job Opportunities for Part-Time and Unemployed Technicians:**  
   Many skilled individuals with practical repair experience—particularly vocational graduates, part-time technicians, or unemployed workers—lack marketing tools and budget to advertise their services or secure steady clients.
5. **Inconvenience of Transporting Bulky Appliances:**  
   Without an organized home-service platform with location dispatch, customers with heavy items like washing machines and refrigerators are forced to hire transport or risk damaging equipment while hauling it to physical workshops.

---

## 3. Statement of Purpose & Objectives

FixLink was conceptualized to achieve five specific objectives:

1. **Multi-Category Repair Request Platform:** Allow customers to submit repair requests for a wide spectrum of home appliances, electronics, and computing devices.
2. **Automated Skill-Based Matching Engine:** Automatically match and notify available technicians whose verified proficiencies align with the requested appliance type.
3. **Centralized Request Lifecycle & Tracking:** Provide real-time state tracking from submission (`Pending`), assignment (`Accepted`), active repair (`In Progress`), to certified finish (`Completed`).
4. **Livelihood & Income Generation:** Provide part-time and unemployed repair personnel with consistent access to local job leads, digital reputation tracking, and proof-of-work portfolios.
5. **Location-Based Home Dispatch:** Leverage forward/reverse geocoding and routing maps to dispatch technicians directly to customer homes, eliminating transport burdens.

---

## 4. Significance of the Study

- **Customers:** Saves substantial time, effort, and transit expense by delivering vetted, on-demand technicians to their doorstep.
- **Technicians:** Acts as a cost-free digital business hub, unlocking consistent job requests, automated proximity sorting, and verified customer testimonials.
- **Researchers:** Enhances practical expertise in full-stack mobile development, geospatial routing, state-machine modeling, and relational database (PostgreSQL) architecture.
- **Future Researchers:** Serves as a validated reference model for community-based service matching, gig-economy platforms, and localized service dispatch systems.

---

## 5. Scope and Delimitations (Chapter 1 Compliance)

### 5.1 System Scope
1. **User Account Creation & Role Separation:** Independent sign-up flows for Customers and Technicians with secure credential hashing.
2. **Technician Verification & Skill Tagging:** Mandatory document uploads (Government ID and TESDA/Vocational Skill Certification) verified by an administrator before job access.
3. **Repair Request Submission:** Customers specify appliance category, damage description, preferred appointment date/time, image of damaged unit, and pinpointed address.
4. **Automated Notification & Proximity Matching:** System calculates distance between customer and technician and alerts nearby qualified technicians.
5. **Job Acceptance & Dispatch Management:** Technicians view matching jobs, inspect general distance, and accept requests.
6. **Mutual Live Map Tracking:** Unlocks only after job acceptance; displays real-time driving route, remaining distance (km), and ETA (minutes) via LocationIQ.
7. **In-App Communication:** In-app messaging and direct telephone call dialer between customer and matched technician for logistics coordination.
8. **Secure 4-Digit OTP Completion Handshake:** Tamper-proof job conclusion requiring customer to furnish a random 4-digit code to the technician upon successful repair.
9. **Ratings & Feedback System:** 1-to-5 star evaluation with written reviews to preserve quality assurance across the technician network.
10. **Technician Profile & Portfolio Builder:** Gallery showcase of completed repairs, average ratings, verified badge, and specialties.
11. **System Admin Governance:** Administrative management of user status, credential verification, category lists, and platform announcements.

### 5.2 Delimitations and Constraints (Out of Scope)
- **No In-App Payment Gateway:** All financial transactions (service fees, parts reimbursement) are settled directly between customer and technician via Cash-on-Service. No payment gateway (Stripe, GCash API, PayPal) is integrated.
- **No Automated Hardware Diagnostics:** The system is an operational dispatch and matching platform; it does not diagnose board schematics, run automated software tests, or replace manual troubleshooting.
- **Categorization Boundaries:** Support is strictly scoped to the platform-defined skill categories managed by the system admin (e.g., Home Appliances, Mobile Devices, Networking & Internet Devices, Computer & Laptop, Other Electronic Devices). The category list is dynamically loaded from the admin-maintained `categories` collection.
- **Mandatory Internet Connectivity:** Both customer and technician devices require active internet connectivity to poll and update real-time states and GPS telemetry.

---

## 6. Target User Roles & Personas

### 6.1 The Customer (Household / Office Owner)
- **Profile:** Needs immediate assistance for broken appliances (e.g., refrigerator stopped cooling, water heater leaking, PC won't boot).
- **Needs:** Fast matching with a qualified technician, transparent arrival time, clear communication, and avoidance of heavy equipment hauling.
- **Key Actions:** Create request, select appliance type, pinpoint home location, track technician arrival, provide completion OTP, write 5-star review.

### 6.2 The Technician (Independent / Part-Time / TESDA-Certified)
- **Profile:** Skilled tradesperson or electronics technician seeking steady local repair gigs without personal marketing investments.
- **Needs:** Filtered job leads that match their tools and capabilities, proximity-based job ranking, clear customer directions, and building a professional reputation.
- **Key Actions:** Register skills, upload credentials, review nearby jobs feed, accept assignment, navigate via map route, execute repair, verify OTP, upload portfolio photo.

### 6.3 The System Administrator
- **Profile:** Institutional or platform manager maintaining quality standards.
- **Needs:** Verify incoming technician documentation, suspend delinquent accounts, broadcast platform advisories, and monitor overall completion metrics.
- **Key Actions:** Inspect Government ID and TESDA certificates, toggle technician status to `active`/`verified`, post system announcements.

---

## 7. Detailed Functional Requirements

### Module 1: Authentication & Onboarding (FR-AUTH)
- `FR-AUTH-01`: Unified authentication screen supporting secure login for both Customers and Technicians.
- `FR-AUTH-02`: Customer registration capturing Name, Email, Password, and Phone Number.
- `FR-AUTH-03`: Technician registration requiring multi-select skill tags (`Refrigerator`, `Washing Machine`, `Computer`, `Laptop`, `General Repair`, etc.).
- `FR-AUTH-04`: Technician registration requiring upload of Government-issued ID and TESDA/Vocational Skill Certificate.
- `FR-AUTH-05`: Account state gate: Technicians remain in `pending_verification` state until approved by an administrator.

### Module 2: Repair Request Management (FR-REQ)
- `FR-REQ-01`: Customers select the appliance category from a modal dynamically listing the admin-managed skill categories (fetched via `GET /api/users/platform/categories`), then drill into the device list of the chosen category to pick the exact item needing repair.
- `FR-REQ-02`: Customers can write a detailed issue description (symptoms, brand, error codes).
- `FR-REQ-03`: Customers can attach a photograph of the damaged unit.
- `FR-REQ-04`: Location tagging: Integrated LocationIQ forward geocoding converts street addresses to precise latitude/longitude, with a "Locate Me" GPS fallback.
- `FR-REQ-05`: Customers specify preferred service date and time slot.
- `FR-REQ-06`: Upon submission, the request enters the `Pending` queue in the PostgreSQL `jobs` table and is surfaced in the availability feed of matching technicians within a 20km radius.

### Module 3: Matching & Dispatch Engine (FR-MATCH)
- `FR-MATCH-01`: Technician feed queries only pending requests whose category intersects with the technician's verified skills.
- `FR-MATCH-02`: Proximity calculation: Distance between technician's current location and request coordinates is computed using the Haversine formula and displayed as `distanceKm`.
- `FR-MATCH-03`: Privacy shield: Customer exact coordinates and full street address remain masked in the available jobs feed until a job is accepted.
- `FR-MATCH-04`: Decline capability: Technicians can dismiss an available job, hiding it from their feed without canceling it for other qualified technicians.
- `FR-MATCH-05`: Atomic acceptance: Accepting a job updates the `jobs` row in place via the `accept_job()` RPC, assigns `technicianUid`, and generates a random 4-digit verification code.

### Module 4: Technician Workload & Capacity (FR-WORKLOAD)
- `FR-WORKLOAD-01`: Active workload defined as `Accepted`, `Confirmed`, `Customer Ready`, `In Progress` (not `Pending`/`Completed`/`Cancelled`/`No-Show`), computed live from `jobs` via `getTechnicianActiveJobCount` / `getActiveJobCountsForTechnicians` (no stored column, no migration).
- `FR-WORKLOAD-02`: Levels `0–2 available` (fully eligible), `3–5 busy` (still eligible, slight `–0.06` ranking dip, not overpowering skill/rating/distance), `6+ at_capacity` (excluded from automatic `GET /api/ai/recommend`).
- `FR-WORKLOAD-03`: AI pipeline order: verified/active + skill → workload filter (`at_capacity` out, `busy` penalty) → distance/schedule/rating → schedule visibility kept separate (`techScheduleService.js`).
- `FR-WORKLOAD-04`: `GET /api/ai/recommend` response adds safe `{activeJobs, workloadStatus}` (`available`/`busy`/`at_capacity`) per candidate; `6+` never appears.
- `FR-WORKLOAD-05`: Authoritative `PUT /api/requests/:id/accept` re-checks count before `rpc accept_job`; if `at_capacity` → `409 {code:TECHNICIAN_AT_CAPACITY, activeJobs, workloadStatus}`; existing jobs untouched, auto-recover when ≤5.
- `FR-WORKLOAD-06`: `GET /api/requests/technician/:uid/workload` returns `{activeJobs, workloadStatus}` (auth `uid===auth`).
- `FR-WORKLOAD-07`: Mobile `Available — 2 active jobs` / `Busy — 4 active jobs` chip on AI cards; `Busy` accept shows `You're Currently Busy…4… Cancel / Accept Anyway`; `At Capacity` shows `You're At Capacity…6… OK` and blocks.

### Module 5: Mutual Live Tracking & Navigation (FR-MAP)
- `FR-MAP-01`: Upon job acceptance, mutual location tracking is unlocked for both parties.
- `FR-MAP-02`: Technicians stream real-time GPS coordinates to the server via background/foreground geolocation.
- `FR-MAP-03`: LocationIQ routing engine calculates driving route, road polyline geometry, distance in kilometers, and estimated time of arrival (ETA) in minutes.
- `FR-MAP-04`: MapTrackerScreen renders an interactive Leaflet.js map inside a React Native WebView showing customer home pin, moving technician vehicle pin, and full path.
- `FR-MAP-05`: External navigation fallback: One-tap button allows technician to launch Google Maps or Apple Maps turn-by-turn turn directions.

### Module 6: Communication & Execution (FR-COMM)
- `FR-COMM-01`: In-app messaging thread (`ChatScreen`) created specifically for each accepted job, supporting text messages and timestamps.
- `FR-COMM-02`: Direct telephone dialer trigger allowing customer or technician to dial cellular numbers for urgent updates (e.g., security gate pass, landmarks).
- `FR-COMM-03`: Technician can update job status from `Accepted` to `In Progress` upon arriving at the customer's residence.

### Module 7: Secure Completion & Reviews (FR-VERIF)
- `FR-VERIF-01`: Customer dashboard displays a unique 4-digit completion OTP during `In Progress` status.
- `FR-VERIF-02`: Technician must enter this 4-digit code on their device to conclude the job.
- `FR-VERIF-03`: Server validates OTP; if correct, transitions job status to `Completed`, archives active tracking, and prompts customer for feedback.
- `FR-VERIF-04`: Rating submission: Customer rates technician from 1 to 5 stars and writes optional text feedback.
- `FR-VERIF-05`: Review record is committed to the `reviews` collection, dynamically recalculating the technician's cumulative rating.
- `FR-VERIF-06`: Technicians can upload a photo of the completed repair with a description to their public portfolio.

---

## 8. Agile Development Methodology (Chapter 1 Alignment)

The software adheres to the **Agile Development Model** across six recurring phases:
1. **Requirements Gathering:** Interviews with CRMC community members, local households, and Bogo City freelance technicians to establish requirements.
2. **Design the Requirements:** Architecture drafting, wireframing role dashboards, and defining PostgreSQL schemas.
3. **Construction / Iteration:** Sprint-based implementation of Expo mobile screens, Express REST endpoints, LocationIQ API integration, and Supabase RPC functions.
4. **Testing / Quality Assurance:** Verification of skill-filtering algorithms, GPS tracking accuracy, OTP validation edge cases, and role access controls.
5. **Deployment & Training:** Staging distribution and user orientation sessions for community stakeholders and local technicians.
6. **Feedback & Evaluation:** Structured user surveys to capture usability metrics and iterate feature refinements.
