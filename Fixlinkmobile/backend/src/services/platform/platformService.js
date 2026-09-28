// Platform catalog service: admin-managed categories + announcements.
// Extracted from routes/users.js. The 60s memory cache stays here so both the
// mobile and admin readers share one policy. Behavior is unchanged.

const { supabase } = require('../../config/supabase');

const platformCache = {
  categories: { at: 0, data: null },
  announcements: { at: 0, data: null },
};

const listCategories = async () => {
  // Admin-managed catalog barely changes. 60s memory cache shields the
  // database when many users open register or submit at once.
  const now = Date.now();
  if (platformCache.categories.data && now - platformCache.categories.at < 60000) {
    return platformCache.categories.data;
  }
  const { data } = await supabase.from('categories').select('*').order('name', { ascending: true });
  platformCache.categories = {
    at: now,
    data: (data || []).map((doc) => ({ id: doc.id, name: doc.name, devices: doc.devices || [] })),
  };
  return platformCache.categories.data;
};

const listAnnouncements = async () => {
  const now = Date.now();
  if (platformCache.announcements.data && now - platformCache.announcements.at < 60000) {
    return platformCache.announcements.data;
  }
  const { data } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  platformCache.announcements = {
    at: now,
    data: (data || []).map((doc) => ({ id: doc.id, ...doc, createdAt: doc.created_at ? new Date(doc.created_at).toISOString() : null })),
  };
  return platformCache.announcements.data;
};

module.exports = { listCategories, listAnnouncements };
