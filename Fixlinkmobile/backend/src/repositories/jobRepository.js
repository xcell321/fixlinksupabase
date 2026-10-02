// Data access for the `jobs` table. Every Supabase query on jobs lives here so
// services stay free of query-building details and so a schema change touches
// exactly one file.

const { supabase } = require('../config/supabase');

const TABLE = 'jobs';

// Resolve a job either by its own id or by the legacy original request id.
// Returns the raw row, or null.
const findByIdOrOriginalId = async (id) => {
  if (!id) return null;
  const cleanId = String(id).trim();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .or(`id.eq.${cleanId},original_request_id.eq.${cleanId}`)
    .maybeSingle();
  if (error || !data) return null;
  return data;
};

const findById = async (id) => {
  const { data } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  return data || null;
};

// Newest pending jobs first. The feed only shows jobs inside 20 km, so the
// newest 200 pending rows bound per-request work under many-user load.
const findPending = async (limit = 200) => {
  const { data } = await supabase
    .from(TABLE)
    .select('*')
    .eq('status', 'Pending')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
};

const findByCustomerUid = async (customerUid) => {
  const { data } = await supabase.from(TABLE).select('*').eq('customer_uid', customerUid);
  return data || [];
};

// Ownership-column lookup used by the chat inbox, where the column depends on
// the caller's role ('customer_uid' or 'technician_uid').
const findByOwnerField = async (field, uid) => {
  const { data } = await supabase.from(TABLE).select('*').eq(field, uid);
  return data || [];
};

// Requests booked at (or near) an address. Used by the UAT #5 anti-harassment
// check to spot many bookings aimed at the same place in one day.
const findByLocationLike = async (location) => {
  const needle = String(location || '').trim();
  if (needle.length < 4) return [];
  const { data } = await supabase
    .from(TABLE)
    .select('id, created_at, location, confirmed_service_location, customer_uid, status')
    .ilike('confirmed_service_location', `%${needle}%`);
  return data || [];
};

const findByCustomerNameLike = async (customerName) => {
  const { data } = await supabase.from(TABLE).select('*').ilike('customer_name', `%${customerName}%`);
  return data || [];
};

const findByTechnicianUid = async (technicianUid) => {
  const { data } = await supabase.from(TABLE).select('*').eq('technician_uid', technicianUid);
  return data || [];
};

// Lightweight projection used by the unread-notification endpoint, which only
// needs to label a chat notification with the other party's name.
const findChatLabelsByField = async (field, uid) => {
  const { data } = await supabase.from(TABLE).select('id, customer_name, technician_name').eq(field, uid);
  return data || [];
};

const findByCustomerForStatus = async ({ customerUid, customerName, status }) => {
  const { data } = await supabase
    .from(TABLE)
    .select('*')
    .eq('customer_uid', customerUid)
    .eq('customer_name', customerName)
    .eq('status', status)
    .order('completed_at', { ascending: false });
  return data || [];
};

// Minimal projection used to notify the customer after a technician accepts.
const findAssignmentSummary = async (id) => {
  const { data } = await supabase
    .from(TABLE)
    .select('customer_uid, appliance_type')
    .eq('id', id)
    .maybeSingle();
  return data || null;
};

// Minimal projection used to validate a cancellation before writing.
const findCancellationContext = async (id) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, customer_uid, technician_uid, technician_name, status')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data;
};

// Returns { id, error } — `error` is surfaced so the caller can keep its
// original 500 handling.
const insertJob = async (row) => {
  const { data, error } = await supabase.from(TABLE).insert(row).select('id').single();
  return { id: data?.id ?? null, error };
};

const updateById = async (id, updates) => supabase.from(TABLE).update(updates).eq('id', id);

// Update + return affected ids, so the caller can 404 when nothing matched.
const updateByIdReturningIds = async (id, updates) =>
  supabase.from(TABLE).update(updates).eq('id', id).select('id');

const insertIncident = async (row) => supabase.from('service_incidents').insert(row);

// Atomic accept (guards against two technicians taking the same job).
const acceptJob = async ({ jobId, technicianUid, technicianName }) =>
  supabase.rpc('accept_job', {
    p_job_id: jobId,
    p_technician_uid: technicianUid,
    p_technician_name: technicianName,
  });

// Atomic no-show logging; returns the customer's running no-show count.
const recordNoShow = async ({ jobId, customerUid, technicianUid, stage, reason }) =>
  supabase.rpc('record_no_show', {
    p_job_id: jobId,
    p_customer_uid: customerUid,
    p_technician_uid: technicianUid,
    p_stage: stage,
    p_reason: reason,
  });

// Atomic scam-incident logging (UAT #8); returns the reported user's running
// scam count so the caller can apply the auto-suspend policy.
const recordScamIncident = async ({ jobId, reporterUid, reporterRole, reportedUid, reportedRole, reason }) =>
  supabase.rpc('record_scam_incident', {
    p_job_id: jobId,
    p_reporter_uid: reporterUid,
    p_reporter_role: reporterRole,
    p_reported_uid: reportedUid,
    p_reported_role: reportedRole,
    p_reason: reason,
  });

module.exports = {
  findByIdOrOriginalId,
  findById,
  findPending,
  findByCustomerUid,
  findByOwnerField,
  findByLocationLike,
  findByCustomerNameLike,
  findByTechnicianUid,
  findChatLabelsByField,
  findByCustomerForStatus,
  findAssignmentSummary,
  findCancellationContext,
  insertJob,
  updateById,
  updateByIdReturningIds,
  insertIncident,
  acceptJob,
  recordNoShow,
  recordScamIncident,
};
