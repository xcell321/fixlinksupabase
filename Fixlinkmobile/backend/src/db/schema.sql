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
-- State machine: Pending -> Accepted -> In Progress -> Completed
--                with Cancelled branches
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
  preferred_date text,
  preferred_time text,
  scheduled_date text,
  photo_url text,
  status text not null default 'Pending' check (status in ('Pending', 'Accepted', 'In Progress', 'Completed', 'Cancelled')),
  is_other boolean not null default false,
  declined_by uuid references public.users(id) on delete set null,
  verification_code text,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
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
  text text not null,
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
-- REVIEWS
-- ---------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  technician_uid uuid references public.users(id) on delete set null,
  technician_name text,
  customer_name text not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  request_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_technician on public.reviews (technician_uid);
create index if not exists idx_reviews_technician_name on public.reviews (lower(technician_name));

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
create or replace function public.send_chat_message(
  p_job_id uuid,
  p_sender_uid uuid,
  p_sender_name text,
  p_sender_role text,
  p_text text
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_message_id uuid;
  v_recipient uuid;
begin
  insert into public.messages (job_id, sender_uid, sender_name, sender_role, text)
  values (p_job_id, p_sender_uid, p_sender_name, p_sender_role, p_text)
  returning id into v_message_id;

  select case when p_sender_role = 'technician' then customer_uid else technician_uid end
    into v_recipient
  from public.jobs
  where id = p_job_id;

  if (v_recipient is not null and v_recipient <> p_sender_uid) then
    insert into public.notifications (recipient_uid, sender_uid, sender_name, job_id, message_id, type, text, timestamp)
    values (v_recipient, p_sender_uid, p_sender_name, p_job_id, v_message_id, 'chat', p_text, now());
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