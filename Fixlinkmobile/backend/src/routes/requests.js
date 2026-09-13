const express = require('express');
const multer = require('multer');

const router = express.Router();
const { supabase, uploadBuffer } = require('../config/supabase');
const { resolveCoordinates } = require('../utils/geocode');
const { analyzeRepairDescription, isOmniRouteConfigured } = require('../service/repairAnalyzer');
const { requireAuth } = require('../middleware/requireAuth');
const { createRateLimiter } = require('../middleware/rateLimit');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// In-memory dedupe ledger: kills duplicate-submit write amplification without any extra DB reads.
const recentSubmits = new Map();
const SUBMIT_DEDUPE_MS = 60000;

router.use(requireAuth);

const perUserLimiter = createRateLimiter({
  windowMs: 60000,
  max: 60,
  keyGenerator: (req) => (req.authUser ? `user:${req.authUser.uid}` : req.ip),
  message: 'Too many requests, please try again later.',
});

router.use(perUserLimiter);

const unreadLimiter = createRateLimiter({
  windowMs: 60000,
  max: 20,
  keyGenerator: (req) => (req.authUser ? `user:${req.authUser.uid}` : req.ip),
  message: 'Too many chat refresh requests, please try again later.',
});

const distanceInKm = (firstLatitude, firstLongitude, secondLatitude, secondLongitude) => {
  if (![firstLatitude, firstLongitude, secondLatitude, secondLongitude].every(Number.isFinite)) return null;
  const radians = (value) => value * Math.PI / 180;
  const latitudeDelta = radians(secondLatitude - firstLatitude);
  const longitudeDelta = radians(secondLongitude - firstLongitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(firstLatitude)) * Math.cos(radians(secondLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const BOGO_LANDMARKS = {
  'lepiten': { latitude: 11.0278, longitude: 124.0355 },
  'san vicente': { latitude: 11.0550, longitude: 124.0216 },
  'p. rodriguez': { latitude: 11.0485, longitude: 124.0038 },
  'rodriguez': { latitude: 11.0485, longitude: 124.0038 },
  'poblacion': { latitude: 11.0485, longitude: 124.0038 },
  'taytayan': { latitude: 11.0430, longitude: 124.0080 },
  'gairan': { latitude: 11.0554, longitude: 124.0217 },
  'cogon': { latitude: 11.0380, longitude: 124.0150 },
  'dakit': { latitude: 11.0620, longitude: 124.0120 },
  'nailon': { latitude: 11.0850, longitude: 124.0350 },
  'libertad': { latitude: 11.0310, longitude: 124.0020 },
  'siocon': { latitude: 11.0680, longitude: 124.0250 },
  'cantecson': { latitude: 11.0410, longitude: 123.9890 },
  'sudtongan': { latitude: 11.0720, longitude: 124.0010 },
  'la paz': { latitude: 11.0720, longitude: 124.0010 }
};

const resolveCoords = async (latitude, longitude, locationText) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon };
  if (!locationText) return null;
  return resolveCoordinates(locationText);
};

// Synchronous local fallback used when listing jobs (avoids one network call
// per row). Job coordinates are stored at creation time, so this only applies
// to legacy rows that predate coordinate storage.
const resolveLocalCoords = (latitude, longitude, locationText) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon };
  const lower = String(locationText || '').toLowerCase();
  for (const [key, coords] of Object.entries(BOGO_LANDMARKS)) {
    if (lower.includes(key)) return coords;
  }
  return null;
};

const serializeJob = (row) => {
  const job = {
    id: row.id,
    customerName: row.customer_name,
    applianceType: row.appliance_type,
    description: row.description,
    location: row.location,
    status: row.status,
    isOther: Boolean(row.is_other),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
  if (row.customer_uid) job.customerUid = row.customer_uid;
  if (row.technician_uid) job.technicianUid = row.technician_uid;
  if (row.technician_name) job.technicianName = row.technician_name;
  if (row.category) job.category = row.category;
  if (row.latitude != null) job.latitude = row.latitude;
  if (row.longitude != null) job.longitude = row.longitude;
  if (row.preferred_date) job.preferredDate = row.preferred_date;
  if (row.preferred_time) job.preferredTime = row.preferred_time;
  if (row.scheduled_date) job.scheduledDate = row.scheduled_date;
  if (row.photo_url) job.photoUrl = row.photo_url;
  if (row.declined_by) job.declinedBy = row.declined_by;
  if (row.verification_code) job.verificationCode = row.verification_code;
  if (row.accepted_at) job.acceptedAt = new Date(row.accepted_at).toISOString();
  if (row.completed_at) job.completedAt = new Date(row.completed_at).toISOString();
  if (row.cancelled_at) job.cancelledAt = new Date(row.cancelled_at).toISOString();
  if (row.review_id) job.reviewId = row.review_id;
  if (row.reviewed_at) job.reviewedAt = new Date(row.reviewed_at).toISOString();
  if (row.original_request_id) job.originalRequestId = row.original_request_id;
  if (row.updated_at) job.updatedAt = new Date(row.updated_at).toISOString();
  return job;
};

const serializeMessage = (row) => ({
  id: row.id,
  senderUid: row.sender_uid,
  senderName: row.sender_name,
  senderRole: row.sender_role,
  text: row.text,
  timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
});

// Resolve a job either by its own id or by the legacy original request id.
const resolveJob = async (id) => {
  if (!id) return null;
  const cleanId = String(id).trim();
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .or(`id.eq.${cleanId},original_request_id.eq.${cleanId}`)
    .maybeSingle();
  if (error || !data) return null;
  return data;
};

const findUserUidByName = async (name, role) => {
  const requestedName = String(name || '').trim().toLowerCase();
  if (!requestedName) return null;
  const { data } = await supabase
    .from('users')
    .select('id, name')
    .eq('role', role)
    .ilike('name', `%${requestedName}%`);
  if (!data || data.length === 0) return null;
  const match = data.find((user) => {
    const userName = String(user.name || '').trim().toLowerCase();
    return userName === requestedName || userName.includes(requestedName) || requestedName.includes(userName);
  });
  return match ? match.id : null;
};

const fetchMessagesWithReadBy = async (messageRows) => {
  if (!messageRows || messageRows.length === 0) return [];
  const messageIds = messageRows.map((m) => m.id);
  const { data: reads } = await supabase
    .from('message_reads')
    .select('message_id, user_uid')
    .in('message_id', messageIds);
  const readsByMessage = {};
  (reads || []).forEach((read) => {
    if (!readsByMessage[read.message_id]) readsByMessage[read.message_id] = [];
    readsByMessage[read.message_id].push(read.user_uid);
  });
  return messageRows.map((row) => ({
    ...serializeMessage(row),
    readBy: readsByMessage[row.id] || [],
  }));
};

// 1. POST Route: Submit a new repair request (Customer side)
router.post('/', upload.single('photo'), async (req, res) => {
  try {
    const {
      customerName,
      customerUid,
      applianceType,
      category,
      description,
      location,
      latitude,
      longitude,
      preferredDate,
      preferredTime,
      scheduledDate,
      isOther
    } = req.body;

    if (customerUid && customerUid !== req.authUser.uid) {
      return res.status(403).json({ error: 'You can only submit requests for your own account.' });
    }

    if (!customerName || !applianceType || !description || !location) {
      return res.status(400).json({ error: 'Please fill out all required fields.' });
    }

    const dedupeFingerprint = `${customerUid}|${String(applianceType).toLowerCase().trim()}|${String(description || '').toLowerCase().trim()}`;
    const now = Date.now();
    recentSubmits.forEach((ts, key) => { if (now - ts > SUBMIT_DEDUPE_MS) recentSubmits.delete(key); });
    const lastSubmit = recentSubmits.get(dedupeFingerprint);
    if (lastSubmit) {
      return res.status(429).json({ error: 'It looks like you already submitted this. Please wait a moment before trying again.' });
    }
    recentSubmits.set(dedupeFingerprint, now);

    let finalLat = Number(latitude);
    let finalLon = Number(longitude);
    if (!Number.isFinite(finalLat) || !Number.isFinite(finalLon)) {
      const resolved = await resolveCoords(latitude, longitude, location);
      if (resolved) {
        finalLat = resolved.latitude;
        finalLon = resolved.longitude;
      }
    }

    let resolvedDate = preferredDate ? String(preferredDate).trim() : null;
    let resolvedTime = preferredTime ? String(preferredTime).trim() : null;
    let resolvedScheduled = scheduledDate ? String(scheduledDate).trim() : null;

    if ((!resolvedDate || !resolvedTime) && resolvedScheduled) {
      try {
        const d = new Date(resolvedScheduled);
        if (!isNaN(d.getTime())) {
          if (!resolvedDate) {
            resolvedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }
          if (!resolvedTime) {
            resolvedTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          }
        }
      } catch (_) {}
    }

    const newRequest = {
      customerName,
      ...(customerUid && { customerUid }),
      applianceType,
      ...(category && String(category).trim() && { category: String(category).trim() }),
      description,
      location,
      ...(Number.isFinite(finalLat) && { latitude: finalLat }),
      ...(Number.isFinite(finalLon) && { longitude: finalLon }),
      ...(resolvedDate && { preferredDate: resolvedDate }),
      ...(resolvedTime && { preferredTime: resolvedTime }),
      ...(resolvedScheduled && { scheduledDate: resolvedScheduled }),
      status: 'Pending',
      createdAt: new Date().toISOString(),
      isOther: Boolean(isOther)
    };

    let photoUrl = null;
    if (req.file) {
      try {
        photoUrl = await uploadBuffer({
          folder: 'repair-photos',
          file: req.file,
          buffer: req.file.buffer,
          contentType: req.file.mimetype,
        });
      } catch (photoError) {
        console.error('Photo upload failed; saving request without photo:', photoError.message);
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from('jobs')
      .insert({
        customer_name: customerName,
        ...(customerUid && { customer_uid: customerUid }),
        appliance_type: applianceType,
        ...(category && String(category).trim() && { category: String(category).trim() }),
        description,
        location,
        ...(Number.isFinite(finalLat) && { latitude: finalLat }),
        ...(Number.isFinite(finalLon) && { longitude: finalLon }),
        ...(resolvedDate && { preferred_date: resolvedDate }),
        ...(resolvedTime && { preferred_time: resolvedTime }),
        ...(resolvedScheduled && { scheduled_date: resolvedScheduled }),
        status: 'Pending',
        is_other: Boolean(isOther),
        ...(photoUrl && { photo_url: photoUrl }),
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error saving repair request:', insertError);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    // Best-effort AI auto-fill: when no category was picked (e.g. "other"), let
    // the AI triage the description into a category so technician matching keeps
    // working. Never blocks the response - a failure just leaves the job as-is.
    const resolvedCategory = String(category || '').trim();
    if (!resolvedCategory && isOmniRouteConfigured()) {
      analyzeRepairDescription({ description, applianceType, category })
        .then((analysis) => {
          const detectedCategory = analysis?.category;
          if (!detectedCategory) return null;
          return supabase
            .from('jobs')
            .update({ category: detectedCategory })
            .eq('id', inserted.id);
        })
        .then((result) => {
          if (result?.error) console.warn('AI category auto-fill failed:', result.error.message);
        })
        .catch((error) => console.warn('AI category auto-fill skipped:', error.message));
    }

    res.status(201).json({
      message: photoUrl
        ? 'Repair request submitted successfully!'
        : 'Repair request submitted successfully. The photo could not be uploaded.',
      photoUploaded: Boolean(photoUrl),
      requestId: inserted.id,
      request: newRequest
    });
  } catch (error) {
    console.error('Error saving repair request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. GET Route: Fetch all pending/available repair requests (Technician side)
router.get('/', async (req, res) => {
  try {
    const { technicianUid, category, latitude: queryLat, longitude: queryLon } = req.query;
    if (!technicianUid || technicianUid !== req.authUser.uid) return res.status(403).json({ error: 'Technician identity does not match the authenticated account.' });

    let technician = null;
    if (technicianUid) {
      const { data } = await supabase.from('users').select('*').eq('id', technicianUid).maybeSingle();
      technician = data || null;
    }

    const { data: rows } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'Pending')
      .order('created_at', { ascending: false });

    const requests = [];
    const pendingSnapshot = rows || [];

    const techLat = Number(technician?.latitude ?? queryLat);
    const techLon = Number(technician?.longitude ?? queryLon);
    const hasTechCoords = Number.isFinite(techLat) && Number.isFinite(techLon);

    pendingSnapshot.forEach((data) => {
      const verified = technician?.status === 'active' || technician?.verification_status === 'verified';
      const skills = Array.isArray(technician?.skills) ? technician.skills : [];
      const normalize = (str) => String(str).toLowerCase().trim().replace(/[\s\/]/g, '');
      const skillsNormalized = skills.map(normalize);
      const requestedCategoryNormalized = normalize(data.application_type || data.appliance_type || category || '');

      const skillMatch = !technicianUid || (verified && (() => {
        const requestCategory = normalize(data.category || '');
        const requestDevice = normalize(data.application_type || data.appliance_type || category || '');

        if (requestCategory && skillsNormalized.includes(requestCategory)) return true;

        return skillsNormalized.some(skillNorm => {
          if (['generalrepair', 'general repair', 'allaround', 'allaroundrepair'].includes(skillNorm)) return true;

          if (data.is_other && ['others', 'other'].includes(skillNorm)) return true;

          const isComputerRequest = ['laptop', 'computermonitor', 'desktopcomputer', 'systemunit', 'computer', 'pc'].some(c => requestedCategoryNormalized.includes(c));
          const hasComputerSkill = skillsNormalized.some(skill => skill.includes('computer') || skill.includes('laptop') || skill.includes('electronics'));

          const isApplianceRequest = ['refrigerator', 'washingmachine', 'waterheater', 'television', 'tv', 'airconditioner'].some(c => requestedCategoryNormalized.includes(c));
          const hasApplianceSkill = skillsNormalized.some(skill => skill.includes('appliance') || skill.includes('refrigerator') || skill.includes('washing'));

          const match = skillNorm === requestedCategoryNormalized ||
                   requestedCategoryNormalized.includes(skillNorm) ||
                   skillNorm.includes(requestedCategoryNormalized) ||
                   (isComputerRequest && hasComputerSkill) ||
                   (isApplianceRequest && hasApplianceSkill) ||
                   (requestDevice && (requestDevice.includes(skillNorm) || skillNorm.includes(requestDevice)));

          return match;
        });
      })());

      const jobCoords = resolveLocalCoords(data.latitude, data.longitude, data.location);
      const distanceKm = hasTechCoords && jobCoords
        ? distanceInKm(techLat, techLon, jobCoords.latitude, jobCoords.longitude)
        : null;

      if ((!data.status || data.status === 'Pending') && skillMatch && data.declined_by !== technicianUid) {
        requests.push({
          ...serializeJob(data),
          ...(jobCoords && { latitude: jobCoords.latitude, longitude: jobCoords.longitude }),
          ...(distanceKm !== null && { distanceKm: Number(distanceKm.toFixed(1)) })
        });
      }
    });

    requests.sort((first, second) => (first.distanceKm ?? Number.POSITIVE_INFINITY) - (second.distanceKm ?? Number.POSITIVE_INFINITY));

    res.status(200).json(requests);
  } catch (error) {
    console.error('Error fetching repair requests:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/messages/unread', unreadLimiter, async (req, res) => {
  try {
    const { uid, role } = req.query || {};
    if (!uid || !['customer', 'technician'].includes(role)) {
      return res.status(400).json({ error: 'User identity and role are required.' });
    }
    if (String(uid) !== req.authUser.uid) {
      return res.status(403).json({ error: 'User identity does not match the authenticated account.' });
    }

    const profileUid = String(req.authUser.uid);
    const field = role === 'technician' ? 'technician_uid' : 'customer_uid';
    const [jobsResult, notificationsResult] = await Promise.all([
      supabase.from('jobs').select('id, customer_name, technician_name').eq(field, profileUid),
      supabase.from('notifications').select('*').eq('recipient_uid', profileUid).eq('type', 'chat')
    ]);

    const allSavedNotifications = ((notificationsResult.data || []))
      .map((n) => ({ id: n.id, ...n }))
      .filter((notification) => notification.type === 'chat');
    const savedNotifications = allSavedNotifications.filter((notification) => notification.read !== true);
    const notifications = savedNotifications.map((n) => ({
      id: n.id,
      jobId: n.job_id,
      messageId: n.message_id,
      senderName: n.sender_name || 'Contact',
      text: n.text,
      timestamp: n.timestamp ? new Date(n.timestamp).toISOString() : null,
      read: n.read === true,
    }));
    const savedMessageIds = new Set(allSavedNotifications.map((notification) => notification.message_id).filter(Boolean));
    const legacyNotifications = [];

    const jobs = jobsResult.data || [];

    if (jobs.length > 0) {
      const { data: recentMessages } = await supabase
        .from('messages')
        .select('*')
        .in('job_id', jobs.map((j) => j.id))
        .order('timestamp', { ascending: false })
        .limit(100);

      const recentRows = (recentMessages || []).slice();
      const readsByMessage = {};
      if (recentRows.length > 0) {
        const { data: reads } = await supabase
          .from('message_reads')
          .select('message_id, user_uid')
          .in('message_id', recentRows.map((m) => m.id));
        (reads || []).forEach((read) => {
          if (!readsByMessage[read.message_id]) readsByMessage[read.message_id] = [];
          readsByMessage[read.message_id].push(read.user_uid);
        });
      }

      recentRows.forEach((message) => {
        const readBy = readsByMessage[message.id] || [];
        if (message.sender_uid !== profileUid && !readBy.includes(profileUid) && !savedMessageIds.has(message.id)) {
          const jobMeta = jobs.find((item) => item.id === message.job_id) || {};
          legacyNotifications.push({
            jobId: message.job_id,
            messageId: message.id,
            senderName: message.sender_name || (role === 'customer' ? jobMeta.technician_name : jobMeta.customer_name) || 'Contact',
            text: message.text || 'New message',
            timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : null,
            senderUid: message.sender_uid,
            senderNameForInsert: message.sender_name,
          });
        }
      });
    }

    if (legacyNotifications.length > 0) {
      const inserts = legacyNotifications.map((notification) => ({
        type: 'chat',
        recipient_uid: profileUid,
        sender_uid: notification.senderUid || null,
        sender_name: notification.senderNameForInsert || notification.senderName,
        job_id: notification.jobId,
        message_id: notification.messageId,
        text: notification.text,
        timestamp: notification.timestamp ? new Date(notification.timestamp).toISOString() : new Date().toISOString(),
        read: false,
      }));
      const { data: created, error: insertError } = await supabase.from('notifications').insert(inserts).select('id');
      if (!insertError && created) {
        created.forEach((row, index) => {
          notifications.push({ ...legacyNotifications[index], id: row.id });
        });
      }
    }

    notifications.sort((first, second) => String(second.timestamp || '').localeCompare(String(first.timestamp || '')));
    res.json(notifications);
  } catch (error) {
    console.error('Error loading unread messages:', error);
    res.status(500).json({ error: 'Unable to load unread messages.' });
  }
});

router.get('/messages/inbox', async (req, res) => {
  try {
    const { uid, role } = req.query || {};
    if (!uid || !['customer', 'technician'].includes(role)) {
      return res.status(400).json({ error: 'User identity and role are required.' });
    }
    if (String(uid) !== req.authUser.uid) {
      return res.status(403).json({ error: 'User identity does not match the authenticated account.' });
    }

    const profileUid = String(req.authUser.uid);
    const field = role === 'technician' ? 'technician_uid' : 'customer_uid';
    const { data: jobs } = await supabase
      .from('jobs')
      .select('*')
      .eq(field, profileUid);

    if (!jobs || jobs.length === 0) return res.json([]);

    const { data: allMessages } = await supabase
      .from('messages')
      .select('*')
      .in('job_id', jobs.map((j) => j.id))
      .order('timestamp', { ascending: true });

    const messagesByJob = {};
    (allMessages || []).forEach((m) => {
      if (!messagesByJob[m.job_id]) messagesByJob[m.job_id] = [];
      messagesByJob[m.job_id].push(m);
    });

    const messageIds = (allMessages || []).map((m) => m.id);
    const readsByMessage = {};
    if (messageIds.length > 0) {
      const { data: reads } = await supabase
        .from('message_reads')
        .select('message_id, user_uid')
        .in('message_id', messageIds);
      (reads || []).forEach((read) => {
        if (!readsByMessage[read.message_id]) readsByMessage[read.message_id] = [];
        readsByMessage[read.message_id].push(read.user_uid);
      });
    }

    const inbox = jobs.map((job) => {
      if (String(job.status || '').toLowerCase() === 'cancelled') return null;

      const messages = messagesByJob[job.id] || [];
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      const unreadCount = messages.filter((message) =>
        message.sender_uid !== profileUid && !(readsByMessage[message.id] || []).includes(profileUid)
      ).length;

      const peerName = role === 'technician' ? job.customer_name : job.technician_name;
      return {
        jobId: job.id,
        peerName: peerName || (role === 'technician' ? 'Customer' : 'Technician'),
        peerInitial: String(peerName || (role === 'technician' ? 'C' : 'T')).charAt(0).toUpperCase(),
        applianceType: job.appliance_type || 'Repair Job',
        status: job.status || 'Active',
        lastMessage: lastMessage
          ? { text: lastMessage.text || '', senderName: lastMessage.sender_name || 'Contact', timestamp: lastMessage.timestamp ? new Date(lastMessage.timestamp).toISOString() : null }
          : null,
        unreadCount,
      };
    });

    res.json(inbox.filter(item => item !== null));
  } catch (error) {
    console.error('Error loading inbox:', error);
    res.status(500).json({ error: 'Unable to load inbox.' });
  }
});

router.put('/accepted/:id/messages/read', async (req, res) => {
  try {
    const { viewerUid } = req.body || {};
    if (!viewerUid) return res.status(400).json({ error: 'Viewer identity is required.' });
    if (String(viewerUid) !== req.authUser.uid) return res.status(403).json({ error: 'Viewer identity does not match the authenticated account.' });
    const job = await resolveJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Accepted job not found.' });

    const { data: messageRows } = await supabase
      .from('messages')
      .select('*')
      .eq('job_id', job.id);

    const { data: reads } = await supabase
      .from('message_reads')
      .select('message_id')
      .eq('user_uid', String(viewerUid))
      .in('message_id', (messageRows || []).map((m) => m.id));

    const alreadyRead = new Set((reads || []).map((r) => r.message_id));

    const unreadMessages = (messageRows || []).filter((m) =>
      m.sender_uid !== String(viewerUid) && !alreadyRead.has(m.id)
    );

    if (unreadMessages.length > 0) {
      const { error: insertError } = await supabase
        .from('message_reads')
        .insert(unreadMessages.map((m) => ({ message_id: m.id, user_uid: String(viewerUid), read_at: new Date().toISOString() })));
      if (insertError) console.error('Error inserting message reads:', insertError.message);
    }

    const { error: notifError } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('recipient_uid', String(viewerUid))
      .eq('job_id', job.id)
      .eq('read', false);

    if (notifError) console.error('Error marking notifications read:', notifError.message);

    res.json({ markedCount: unreadMessages.length });
  } catch (error) {
    console.error('Error marking messages read:', error);
    res.status(500).json({ error: 'Unable to mark messages as read.' });
  }
});

router.get('/customer/:customerName', async (req, res) => {
  try {
    const requestedName = String(req.params.customerName || '').trim().toLowerCase();
    const requestedUid = String(req.query.customerUid || '').trim();
    if (!requestedUid || requestedUid !== req.authUser.uid) return res.status(403).json({ error: 'Customer identity does not match the authenticated account.' });

    const uidJobs = await supabase.from('jobs').select('*').eq('customer_uid', requestedUid);
    const rawJobs = uidJobs.data || [];
    let allJobs = rawJobs.slice();

    if (requestedName) {
      const nameJobs = await supabase.from('jobs').select('*').ilike('customer_name', `%${requestedName}%`);
      (nameJobs.data || []).forEach((job) => {
        if (!allJobs.some((existing) => existing.id === job.id)) allJobs.push(job);
      });
    }

    const jobs = allJobs.filter((job) => {
      const jobName = String(job.customer_name || '').trim().toLowerCase();
      const nameMatches = jobName && requestedName && (
        jobName === requestedName ||
        jobName.includes(requestedName) ||
        requestedName.includes(jobName) ||
        jobName.split(/\s+/)[0] === requestedName.split(/\s+/)[0]
      );
      const uidMatches = requestedUid && job.customer_uid === requestedUid;
      return (uidMatches || nameMatches) && String(job.status || '').toLowerCase() !== 'completed';
    });

    const withTechnician = await Promise.all(jobs.map(async (job) => {
      if (!job.technician_uid && !job.technician_name) return serializeJob(job);
      let technician = {};
      if (job.technician_uid) {
        const { data: techRow } = await supabase.from('users').select('*').eq('id', job.technician_uid).maybeSingle();
        technician = techRow || {};
      }

      let reviews = [];
      if (job.technician_uid) {
        const { data: reviewRows } = await supabase.from('reviews').select('*').eq('technician_uid', job.technician_uid);
        reviews = reviewRows || [];
      }
      if (reviews.length === 0 && (job.technician_name || technician.name)) {
        const nameToSearch = job.technician_name || technician.name;
        const { data: nameReviews } = await supabase.from('reviews').select('*').eq('technician_name', nameToSearch);
        reviews = nameReviews || [];
      }

      let technicianRating = null;
      let technicianTotalReviews = reviews.length;

      if (reviews.length > 0) {
        technicianRating = Number((reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length).toFixed(1));
      } else if (technician.rating != null && Number(technician.rating) > 0) {
        technicianRating = Number(Number(technician.rating).toFixed(1));
        technicianTotalReviews = Number(technician.total_reviews || 1);
      }

      return {
        ...serializeJob(job),
        technicianPhone: technician.phone || null,
        technicianSkills: technician.skills || [],
        technicianRating,
        technicianTotalReviews
      };
    }));

    res.json(withTechnician);
  } catch (error) {
    console.error('Error loading customer requests:', error);
    res.status(500).json({ error: 'Unable to load request status.' });
  }
});

router.get('/technician/:technicianUid', async (req, res) => {
  try {
    if (req.params.technicianUid !== req.authUser.uid) return res.status(403).json({ error: 'Technician identity does not match the authenticated account.' });
    const { data: rows } = await supabase.from('jobs').select('*').eq('technician_uid', req.params.technicianUid);
    res.json((rows || []).map(serializeJob));
  } catch (error) {
    console.error('Error loading technician jobs:', error);
    res.status(500).json({ error: 'Unable to load technician jobs.' });
  }
});

router.get('/accepted/:id/messages', async (req, res) => {
  try {
    const job = await resolveJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Accepted job not found.' });
    const { data: rows } = await supabase
      .from('messages')
      .select('*')
      .eq('job_id', job.id)
      .order('timestamp', { ascending: true });
    res.json(await fetchMessagesWithReadBy(rows || []));
  } catch (error) {
    console.error('Error loading job messages:', error);
    res.status(500).json({ error: 'Unable to load job messages.' });
  }
});

router.post('/accepted/:id/messages', async (req, res) => {
  try {
    const { senderUid, senderName, senderRole, text } = req.body || {};
    if (!senderUid || !senderName || !senderRole || !String(text || '').trim()) {
      return res.status(400).json({ error: 'Sender identity and message text are required.' });
    }
    if (String(senderUid) !== req.authUser.uid) return res.status(403).json({ error: 'Sender identity does not match the authenticated account.' });
    const job = await resolveJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Accepted job not found.' });

    const messageText = String(text).trim();
    const { data, error } = await supabase.rpc('send_chat_message', {
      p_job_id: job.id,
      p_sender_uid: String(senderUid),
      p_sender_name: String(senderName),
      p_sender_role: String(senderRole),
      p_text: messageText,
    });

    if (error) {
      console.error('Error saving job message:', error.message);
      return res.status(500).json({ error: 'Unable to save job message.' });
    }

    res.status(201).json({
      id: data,
      senderUid: String(senderUid),
      senderName: String(senderName),
      senderRole: String(senderRole),
      text: messageText,
      timestamp: new Date().toISOString(),
      readBy: [String(senderUid)]
    });
  } catch (error) {
    console.error('Error saving job message:', error);
    res.status(500).json({ error: 'Unable to save job message.' });
  }
});

router.put('/:id/decline', async (req, res) => {
  try {
    const { technicianUid } = req.body || {};
    if (!technicianUid || technicianUid !== req.authUser.uid) return res.status(403).json({ error: 'Technician identity does not match the authenticated account.' });
    const { data, error } = await supabase
      .from('jobs')
      .update({ declined_by: technicianUid, status: 'Pending', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id');
    if (error || !data || data.length === 0) return res.status(404).json({ error: 'Repair request not found.' });
    res.json({ message: 'Request declined and returned to the available queue.' });
  } catch (error) {
    console.error('Error declining request:', error);
    res.status(500).json({ error: 'Unable to decline request.' });
  }
});

router.put('/:id/cancel', async (req, res) => {
  try {
    const { data: existing, error: fetchError } = await supabase.from('jobs').select('id, customer_uid, status').eq('id', req.params.id).maybeSingle();
    if (fetchError || !existing) return res.status(404).json({ error: 'Repair request not found.' });
    if (existing.customer_uid !== req.authUser.uid) return res.status(403).json({ error: 'You can only cancel your own request.' });
    if (String(existing.status || '').toLowerCase() !== 'pending') return res.status(409).json({ error: 'Only pending requests can be cancelled.' });
    await supabase
      .from('jobs')
      .update({ status: 'Cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    res.json({ message: 'Repair request cancelled.' });
  } catch (error) {
    console.error('Error cancelling repair request:', error);
    res.status(500).json({ error: 'Unable to cancel repair request.' });
  }
});

router.get('/accepted/:id/location', async (req, res) => {
  try {
    const job = await resolveJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Accepted job not found.' });
    res.json({ latitude: job.latitude || null, longitude: job.longitude || null, location: job.location || null });
  } catch (error) {
    console.error('Error loading customer location:', error);
    res.status(500).json({ error: 'Unable to load customer location.' });
  }
});

router.get('/accepted/:id/live-tracking', async (req, res) => {
  try {
    const job = await resolveJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Accepted job not found.' });
    if (!['Accepted', 'In Progress'].includes(job.status)) {
      return res.status(409).json({ error: 'Live tracking is available after job acceptance.' });
    }

    let technician = {};
    if (job.technician_uid) {
      const { data } = await supabase.from('users').select('*').eq('id', job.technician_uid).maybeSingle();
      technician = data || {};
    }

    res.json({
      customer: {
        latitude: Number(job.latitude) || null,
        longitude: Number(job.longitude) || null,
        name: job.customer_name || 'Customer',
        address: job.location || null,
      },
      technician: {
        latitude: Number(technician.latitude) || null,
        longitude: Number(technician.longitude) || null,
        name: job.technician_name || technician.name || 'Technician',
      },
      status: job.status,
      updatedAt: technician.location_updated_at ? new Date(technician.location_updated_at).toISOString() : null,
    });
  } catch (error) {
    console.error('Error loading live tracking:', error);
    res.status(500).json({ error: 'Unable to load live tracking.' });
  }
});

router.put('/accepted/:id/customer-location', async (req, res) => {
  try {
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const { customerUid } = req.body || {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !customerUid) {
      return res.status(400).json({ error: 'Customer identity and valid coordinates are required.' });
    }
    if (customerUid !== req.authUser.uid) return res.status(403).json({ error: 'Customer identity does not match the authenticated account.' });
    const job = await resolveJob(req.params.id);
    if (!job || job.customer_uid !== customerUid) return res.status(404).json({ error: 'Assigned job not found.' });
    const locationUpdatedAt = new Date().toISOString();
    await supabase.from('jobs').update({ latitude, longitude, location_updated_at: locationUpdatedAt }).eq('id', job.id);
    res.json({ latitude, longitude, locationUpdatedAt });
  } catch (error) {
    console.error('Error updating customer location:', error);
    res.status(500).json({ error: 'Unable to update customer location.' });
  }
});

router.put('/accepted/:id/status', async (req, res) => {
  try {
    const { status, technicianUid } = req.body || {};
    const allowedStatuses = ['In Progress', 'Completed', 'Cancelled'];
    if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid job status.' });
    if (!technicianUid || technicianUid !== req.authUser.uid) return res.status(403).json({ error: 'Technician identity does not match the authenticated account.' });
    const job = await resolveJob(req.params.id);
    if (!job || (technicianUid && job.technician_uid !== technicianUid)) return res.status(404).json({ error: 'Assigned job not found.' });
    const updates = { status, updated_at: new Date().toISOString() };
    if (status === 'In Progress') updates.started_at = new Date().toISOString();
    if (status === 'Cancelled') updates.cancelled_at = new Date().toISOString();
    await supabase.from('jobs').update(updates).eq('id', job.id);
    res.json({ message: `Job marked ${status}.`, status });
  } catch (error) {
    console.error('Error updating job status:', error);
    res.status(500).json({ error: 'Unable to update job status.' });
  }
});

router.get('/completed/:customerName', async (req, res) => {
  try {
    const { data: rows } = await supabase
      .from('jobs')
      .select('*')
      .eq('customer_name', req.params.customerName)
      .eq('status', 'Completed')
      .is('review_id', null);
    res.json((rows || []).map(serializeJob));
  } catch (error) {
    console.error('Error loading completed jobs:', error);
    res.status(500).json({ error: 'Unable to load completed jobs.' });
  }
});

router.post('/:id/review', async (req, res) => {
  try {
    const { customerName, rating, comment } = req.body || {};
    const numericRating = Number(rating);
    if (!customerName || !Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ error: 'Customer name and a rating from 1 to 5 are required.' });
    }
    const job = await resolveJob(req.params.id);
    if (!job || job.customer_uid !== req.authUser.uid || job.customer_name !== customerName || String(job.status).toLowerCase() !== 'completed') {
      return res.status(404).json({ error: 'Completed job not found.' });
    }
    if (job.review_id) return res.status(409).json({ error: 'This job has already been reviewed.' });

    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .insert({
        technician_uid: job.technician_uid,
        technician_name: job.technician_name,
        customer_name: customerName,
        rating: numericRating,
        comment: String(comment || '').trim(),
        request_id: job.id,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (reviewError) throw reviewError;

    await supabase.from('jobs').update({ review_id: review.id, reviewed_at: new Date().toISOString() }).eq('id', job.id);

    if (job.technician_uid) {
      try {
        await supabase.rpc('recompute_technician_rating', { p_technician_uid: job.technician_uid });
      } catch (userUpdErr) {
        console.warn('Could not sync user rating:', userUpdErr.message);
      }
    }

    res.status(201).json({ message: 'Review submitted successfully.' });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ error: 'Unable to submit review.' });
  }
});

// 3. PUT Route: Accept a job atomically
router.put('/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    const { technicianUid, technicianName } = req.body || {};
    if (!technicianUid || !technicianName) {
      return res.status(400).json({ error: 'Technician identity is required to accept a job.' });
    }
    if (technicianUid !== req.authUser.uid) return res.status(403).json({ error: 'Technician identity does not match the authenticated account.' });

    const { data: jobId, error } = await supabase.rpc('accept_job', {
      p_job_id: id,
      p_technician_uid: String(technicianUid),
      p_technician_name: String(technicianName),
    });

    if (error) {
      if (/Repair request not found/i.test(error.message)) {
        return res.status(404).json({ error: 'Repair request not found' });
      }
      if (/no longer pending/i.test(error.message)) {
        return res.status(409).json({ error: 'This job has already been taken.' });
      }
      console.error('Error accepting job:', error.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    res.status(200).json({ message: 'Job accepted successfully!', jobId });
  } catch (error) {
    console.error('Error accepting job:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Route to verify completion code
router.post('/:id/verify-completion', async (req, res) => {
  try {
    const { code } = req.body;
    const job = await resolveJob(req.params.id);

    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.technician_uid !== req.authUser.uid) return res.status(403).json({ error: 'Only the assigned technician can verify completion.' });
    if (job.verification_code !== String(code).trim()) return res.status(400).json({ error: 'Invalid verification code.' });

    await supabase
      .from('jobs')
      .update({ status: 'Completed', completed_at: new Date().toISOString() })
      .eq('id', job.id);

    res.json({ message: 'Job completed successfully!' });
  } catch (error) {
    console.error('Error verifying completion:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;