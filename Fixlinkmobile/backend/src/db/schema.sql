-- =====================================================================
-- FixLink Capstone - Supabase / PostgreSQL Schema
-- Cebu Roosevelt Memorial Colleges — College of Computer Studies
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query
-- Idempotent: safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- USERS
-- id = Supabase Auth user id (uuid)
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  address text,
  role text not null check (role in ('customer', 'technician', 'admin')),
  status text not null default 'active',
  verification_status text not null default 'unverified',
  rejection_reason text,
  government_id_number text,
  government_id_file_url text,
  certificate_file_url text,
  bio text,
  skills text[] not null default '{}',
  years_experience int not null default 0,
  latitude double precision,
  longitude double precision,
  location_updated_at timestamptz,
  fcm_token text,
  portfolio jsonb not null default '[]',
  rating double precision,
  total_reviews int not null default 0,
  is_available boolean not null default false,
  profile_image text,
  no_show_count int not null default 0,
  updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_role on public.users (role);
create index if not exists idx_users_status on public.users (status);
create index if not exists idx_users_name on public.users (lower(name));
create index if not exists idx_users_customer_name on public.users (lower(name)) where role = 'customer';

-- ---------------------------------------------------------------------
-- CATEGORIES
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  devices jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- ---------------------------------------------------------------------
-- ANNOUNCEMENTS
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- JOBS (consolidates Firestore repairRequests + acceptedJobs)
-- State machine: Pending -> Accepted -> Confirmed -> Customer Ready
--                -> In Progress -> Completed
--                with Cancelled and No-Show branches
--
-- Anti-abuse/confirmation workflow fields:
--   * service_latitude/longitude + confirmed_service_location hold the
--     location the technician should travel to (snapshot at submit time).
--   * customer_latitude/longitude hold the CUSTOMER'S live GPS, kept
--     separate so a customer away from the service location is never
--     treated as a fake request, and so live GPS updates never overwrite
--     the confirmed service destination on the map.
-- ---------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  original_request_id uuid, -- self-reference; preserves legacy 2-collection lookup
  customer_uid uuid references public.users(id) on delete set null,
  customer_name text not null,
  technician_uid uuid references public.users(id) on delete set null,
  technician_name text,
  appliance_type text not null,
  category text,
  description text not null,
  location text not null,
  latitude double precision,
  longitude double precision,
  customer_latitude double precision,
  customer_longitude double precision,
  confirmed_service_location text,
  service_latitude double precision,
  service_longitude double precision,
  preferred_date text,
  preferred_time text,
  scheduled_date text,
  photo_url text,
  status text not null default 'Pending' check (status in ('Pending', 'Accepted', 'Confirmed', 'Customer Ready', 'In Progress', 'Completed', 'Cancelled', 'No-Show')),
  is_other boolean not null default false,
  declined_by uuid references public.users(id) on delete set null,
  verification_code text,
  verification_code_for_arrival text,
  accepted_at timestamptz,
  customer_confirmation_timestamp timestamptz,
  customer_ready_timestamp timestamptz,
  started_at timestamptz,
  technician_arrival_timestamp timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_stage text,
  cancelled_by text,
  cancellation_reason text,
  location_updated_at timestamptz,
  review_id uuid,
  reviewed_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_jobs_status on public.jobs (status, created_at desc);
create index if not exists idx_jobs_customer_uid on public.jobs (customer_uid);
create index if not exists idx_jobs_technician_uid on public.jobs (technician_uid);
create index if not exists idx_jobs_customer_name on public.jobs (lower(customer_name));
create index if not exists idx_jobs_technician_name on public.jobs (lower(technician_name));
create index if not exists idx_jobs_original_request on public.jobs (original_request_id);

-- ---------------------------------------------------------------------
-- MESSAGES
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  sender_uid uuid not null,
  sender_name text not null,
  sender_role text not null check (sender_role in ('customer', 'technician', 'admin')),
  -- `text` stays NOT NULL: an image-only message stores an empty string.
  text text not null,
  -- Optional photo attached by either participant.
  image_url text,
  timestamp timestamptz not null default now()
);

create index if not exists idx_messages_job on public.messages (job_id, timestamp asc);

-- ---------------------------------------------------------------------
-- MESSAGE_READS (replaces Firestore readBy[] array)
-- ---------------------------------------------------------------------
create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_uid uuid not null references public.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_uid)
);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_uid uuid not null references public.users(id) on delete cascade,
  sender_uid uuid,
  sender_name text,
  job_id uuid references public.jobs(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  type text not null default 'chat' check (type in ('chat', 'job', 'system')),
  text text,
  read boolean not null default false,
  read_at timestamptz,
  timestamp timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on public.notifications (recipient_uid, read);
create index if not exists idx_notifications_job on public.notifications (job_id);

-- ---------------------------------------------------------------------
-- SERVICE INCIDENTS (anti-abuse / no-show history)
-- Records the stage of a cancellation and any possible no-show so a
-- customer's history can be reviewed before the admin takes action.
-- Stages: before_accept, after_accept, after_confirmation, after_ready,
--         after_travel
-- Types:  cancellation, no_show
-- Status: logged, warning, flagged, reviewed, resolved
-- ---------------------------------------------------------------------
create table if not exists public.service_incidents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  customer_uid uuid references public.users(id) on delete set null,
  technician_uid uuid references public.users(id) on delete set null,
  type text not null check (type in ('cancellation', 'no_show')),
  stage text not null check (stage in ('before_accept', 'after_accept', 'after_confirmation', 'after_ready', 'after_travel')),
  reason text,
  status text not null default 'logged' check (status in ('logged', 'warning', 'flagged', 'reviewed', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_service_incidents_customer on public.service_incidents (customer_uid, created_at desc);
create index if not exists idx_service_incidents_job on public.service_incidents (job_id);

-- ---------------------------------------------------------------------
-- REVIEWS
-- ---------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  technician_uid uuid references public.users(id) on delete set null,
  technician_name text,
  customer_uid uuid references public.users(id) on delete set null,
  customer_name text not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  request_id uuid references public.jobs(id) on delete set null,
  -- UAT #11: which side wrote this row ('customer' or 'technician').
  reviewer_role text not null default 'customer',
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_technician on public.reviews (technician_uid);
create index if not exists idx_reviews_technician_name on public.reviews (lower(technician_name));
create index if not exists idx_reviews_customer on public.reviews (customer_uid);

-- UAT #11: two-way ratings share the reviews table, separated by reviewer_role
-- ('customer' = customer rates technician, 'technician' = technician rates the
-- customer). The column is present in the create-table block above for fresh
-- builds and added by the migration at the bottom for existing databases.

-- ---------------------------------------------------------------------
-- REPORTS (admin panel "Reports & disputes"; no mobile write path yet)
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_uid uuid references public.users(id) on delete set null,
  reported_user_uid uuid references public.users(id) on delete set null,
  reported_user_name text,
  title text,
  reason text,
  description text,
  status text not null default 'open',
  resolution text,
  user_status text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_reports_status on public.reports (status);
create index if not exists idx_reports_reported_user on public.reports (reported_user_uid);

-- =====================================================================
-- ROW LEVEL SECURITY
-- The backend ALWAYS talks to Postgres through the service_role key,
-- which bypasses RLS. The mobile app never connects directly to the
-- database. Enabling RLS with zero policies means even a leaked anon
-- key grants no read/write access.
-- =====================================================================
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.announcements enable row level security;
alter table public.jobs enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.notifications enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.service_incidents enable row level security;
-- NOTE: password_resets is created further down (it depends on users), so its
-- row-level-security statement lives right after its own create-table block
-- instead of here. Having it here broke fresh builds with a relation error.

-- =====================================================================
-- RPC FUNCTIONS
-- =====================================================================

-- Accept a job atomically: assign technician, generate 4-digit OTP.
create or replace function public.accept_job(
  p_job_id uuid,
  p_technician_uid uuid,
  p_technician_name text
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_job public.jobs%rowtype;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Repair request not found';
  end if;

  if v_job.status is distinct from 'Pending' then
    raise exception 'Job is no longer pending';
  end if;

  update public.jobs
    set original_request_id = p_job_id,
        technician_uid = p_technician_uid,
        technician_name = p_technician_name,
        status = 'Accepted',
        verification_code = lpad(floor(1000 + random() * 9000)::int::text, 4, '0'),
        accepted_at = now(),
        declined_by = null,
        updated_at = now()
  where id = p_job_id;

  return p_job_id;
end;
$$;

-- Insert a chat message + fan out a notification atomically.
-- Insert a chat message + fan out a notification atomically.
-- Recreated in the migration section below with the p_image_url parameter, so
-- the old five-argument signature is dropped first (Postgres treats a changed
-- argument list as an overload, which would make named RPC calls ambiguous).
drop function if exists public.send_chat_message(uuid, uuid, text, text, text);

create or replace function public.send_chat_message(
  p_job_id uuid,
  p_sender_uid uuid,
  p_sender_name text,
  p_sender_role text,
  p_text text,
  p_image_url text default null
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_message_id uuid;
  v_recipient uuid;
  -- `text` is NOT NULL, so an image-only message is stored as an empty string
  -- and the notification still carries something readable.
  v_text text := coalesce(p_text, '');
begin
  insert into public.messages (job_id, sender_uid, sender_name, sender_role, text, image_url)
  values (p_job_id, p_sender_uid, p_sender_name, p_sender_role, v_text, p_image_url)
  returning id into v_message_id;

  select case when p_sender_role = 'technician' then customer_uid else technician_uid end
    into v_recipient
  from public.jobs
  where id = p_job_id;

  if (v_recipient is not null and v_recipient <> p_sender_uid) then
    insert into public.notifications (recipient_uid, sender_uid, sender_name, job_id, message_id, type, text, timestamp)
    values (
      v_recipient, p_sender_uid, p_sender_name, p_job_id, v_message_id, 'chat',
      coalesce(nullif(v_text, ''), 'Sent a photo'),
      now()
    );
  end if;

  return v_message_id;
end;
$$;

-- ---------------------------------------------------------------------
-- PASSWORD RESETS (single-use password reset links)
-- Records the fingerprint of an issued reset token so a link can be
-- redeemed at most once and only before its expiration.
-- ---------------------------------------------------------------------
create table if not exists public.password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_resets_token_hash_idx on public.password_resets (token_hash);
create index if not exists password_resets_user_id_idx on public.password_resets (user_id);
create index if not exists password_resets_expires_at_idx on public.password_resets (expires_at);

-- The backend only ever reaches Postgres through the service_role key (which
-- bypasses RLS), so enabling RLS with no policies locks the table down. This
-- must run AFTER the table exists, or a fresh build fails.
alter table public.password_resets enable row level security;

-- ---------------------------------------------------------------------
-- FUNCTIONS
-- ---------------------------------------------------------------------

-- Recompute a technician's average rating + review count on the users row.
create or replace function public.recompute_technician_rating(p_technician_uid uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.users u
    set rating = agg.avg_rating,
        total_reviews = agg.review_count
  from (
    select
      coalesce(avg(rating), 0)::double precision as avg_rating,
      count(*)::int as review_count
    from public.reviews
    where technician_uid = p_technician_uid
  ) agg
  where u.id = p_technician_uid;
end;
$$;

-- Record a no-show incident atomically: insert the incident row and bump the
-- customer's no_show_count in one transaction so history and counter never
-- drift out of sync.
create or replace function public.record_no_show(
  p_job_id uuid,
  p_customer_uid uuid,
  p_technician_uid uuid,
  p_stage text,
  p_reason text
) returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  -- Lock the customer row first to prevent concurrent count drift.
  select no_show_count into v_count
  from public.users
  where id = p_customer_uid
  for update;

  if v_count is null then
    v_count := 0;
  end if;

  insert into public.service_incidents (job_id, customer_uid, technician_uid, type, stage, reason, status)
  values (p_job_id, p_customer_uid, p_technician_uid, 'no_show', p_stage, p_reason, 'logged');

  update public.users
    set no_show_count = v_count + 1,
        updated_at = now()
  where id = p_customer_uid;

  return v_count + 1;
end;
$$;

-- ---------------------------------------------------------------------
-- MIGRATIONS (existing databases)
-- Safe to re-run alongside the create-table block above for projects
-- created before the anti-abuse/confirmation workflow existed.
-- ---------------------------------------------------------------------
alter table public.users add column if not exists no_show_count int not null default 0;

alter table public.jobs add column if not exists customer_latitude double precision;
alter table public.jobs add column if not exists customer_longitude double precision;
alter table public.jobs add column if not exists confirmed_service_location text;
alter table public.jobs add column if not exists service_latitude double precision;
alter table public.jobs add column if not exists service_longitude double precision;
alter table public.jobs add column if not exists verification_code_for_arrival text;
alter table public.jobs add column if not exists customer_confirmation_timestamp timestamptz;
alter table public.jobs add column if not exists customer_ready_timestamp timestamptz;
alter table public.jobs add column if not exists technician_arrival_timestamp timestamptz;
alter table public.jobs add column if not exists cancellation_stage text;
alter table public.jobs add column if not exists cancelled_by text;
alter table public.jobs add column if not exists cancellation_reason text;

-- Expand the jobs status and notifications type check constraints.
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (status in ('Pending', 'Accepted', 'Confirmed', 'Customer Ready', 'In Progress', 'Completed', 'Cancelled', 'No-Show'));

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in ('chat', 'job', 'system'));

-- Chat photos: a message may carry an image alongside (or instead of) text.
alter table public.messages add column if not exists image_url text;

-- Reviews now record the reviewer, so the technician's reviews tab can show the
-- customer's current name and profile picture instead of a stored name only.
alter table public.reviews add column if not exists customer_uid uuid references public.users(id) on delete set null;
create index if not exists idx_reviews_customer on public.reviews (customer_uid);

-- ---------------------------------------------------------------------
-- UAT #8/#9/#10 MIGRATIONS
-- Repeat-scammer standing, credential screening and facial verification.
-- ---------------------------------------------------------------------

-- UAT #6: fake / AI-generated device-photo screening on submitted jobs.
alter table public.jobs add column if not exists photo_risk_score int;
alter table public.jobs add column if not exists photo_risk_level text;
alter table public.jobs add column if not exists photo_flags jsonb default '[]'::jsonb;
alter table public.jobs add column if not exists photo_notes text;

-- UAT #5: fake-address / harassment / spam-booking signals on the request.
alter table public.jobs add column if not exists safety_flags jsonb default '[]'::jsonb;
alter table public.jobs add column if not exists safety_level text;

-- UAT #11: which side wrote each review.
alter table public.reviews add column if not exists reviewer_role text not null default 'customer';
create index if not exists idx_reviews_reviewer_role on public.reviews (reviewer_role);

-- UAT #8: repeat-scammer standing and scam incidents.
alter table public.users add column if not exists scam_count int not null default 0;
alter table public.service_incidents drop constraint if exists service_incidents_type_check;
alter table public.service_incidents add constraint service_incidents_type_check check (type in ('cancellation', 'no_show', 'scam'));
-- Normalise the stage check so the scam incident's 'after_travel' stage is always allowed.
alter table public.service_incidents drop constraint if exists service_incidents_stage_check;
alter table public.service_incidents add constraint service_incidents_stage_check check (stage in ('before_accept', 'after_accept', 'after_confirmation', 'after_ready', 'after_travel'));
alter table public.service_incidents add column if not exists reported_uid uuid references public.users(id) on delete set null;
alter table public.service_incidents add column if not exists reporter_role text;

-- UAT #9/#10: credential screening and facial verification (advisory).
alter table public.users add column if not exists credential_risk_score int;
alter table public.users add column if not exists credential_risk_level text;
alter table public.users add column if not exists credential_flags jsonb default '[]'::jsonb;
alter table public.users add column if not exists credential_notes text;
alter table public.users add column if not exists credential_screened_at timestamptz;
alter table public.users add column if not exists verification_note text;
alter table public.users add column if not exists selfie_url text;
alter table public.users add column if not exists face_check_level text;
alter table public.users add column if not exists face_match_confidence numeric;
alter table public.users add column if not exists face_liveness_risk numeric;

-- Recompute a customer's average rating + review count (mirror of the
-- technician roll-up, fed by the technician -> customer reviews).
create or replace function public.recompute_customer_rating(p_customer_uid uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.users u
    set rating = agg.avg_rating,
        total_reviews = agg.review_count
  from (
    select
      coalesce(avg(rating), 0)::double precision as avg_rating,
      count(*)::int as review_count
    from public.reviews
    where customer_uid = p_customer_uid and reviewer_role = 'technician'
  ) agg
  where u.id = p_customer_uid;
end;
$$;

-- Record a scam incident atomically and bump the reported user's running
-- scam_count, so the auto-suspend policy and the incident log never drift.
create or replace function public.record_scam_incident(
  p_job_id uuid,
  p_reporter_uid uuid,
  p_reporter_role text,
  p_reported_uid uuid,
  p_reported_role text,
  p_reason text
) returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  select scam_count into v_count
  from public.users
  where id = p_reported_uid
  for update;

  if v_count is null then
    v_count := 0;
  end if;

  insert into public.service_incidents (job_id, customer_uid, technician_uid, type, stage, reason, status, reported_uid, reporter_role)
  values (
    p_job_id,
    case when p_reported_role = 'customer' then p_reported_uid else p_reporter_uid end,
    case when p_reported_role = 'technician' then p_reported_uid else p_reporter_uid end,
    'scam', 'after_travel', p_reason, 'flagged', p_reported_uid, p_reporter_role
  );

  update public.users
    set scam_count = v_count + 1,
        updated_at = now()
  where id = p_reported_uid;

  return v_count + 1;
end;
$$;