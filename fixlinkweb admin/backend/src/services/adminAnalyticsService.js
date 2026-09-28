// Admin job data-access + overview/analytics aggregation.
// Extracted from routes/admin.js. Queries stay identical (select('*') with
// in-memory filtering) so numbers do not change; add pagination/caching as a
// follow-up once the admin panel is covered by tests.

const { supabase } = require('../config/supabase');
const { listUsers } = require('./adminUserService');

async function listJobs() {
  const { data, error } = await supabase.from('jobs').select('*');
  if (error) throw error;
  return data || [];
}

async function getOverview() {
  const users = await listUsers();
  const jobs = await listJobs();
  const { data: reviews } = await supabase.from('reviews').select('*');
  const reviewList = reviews || [];
  const pendingTechnicians = users.filter((u) => u.role === 'technician' && u.status === 'pending_verification');
  const technicians = users.filter((u) => u.role === 'technician');
  const customers = users.filter((u) => u.role === 'customer');
  const completedRequests = jobs.filter((j) => String(j.status).toLowerCase() === 'completed').length;
  const averageRating = reviewList.length
    ? reviewList.reduce((t, r) => t + Number(r.rating || 0), 0) / reviewList.length
    : 0;
  return {
    counts: {
      customers: customers.length,
      technicians: technicians.length,
      pendingTechnicians: pendingTechnicians.length,
      requests: jobs.length,
      completedRequests,
      activeRequests: jobs.filter((j) => ['pending', 'accepted', 'in progress'].includes(String(j.status || 'pending').toLowerCase())).length,
      reviews: reviewList.length,
      averageRating: Number(averageRating.toFixed(1)),
    },
    requestStatuses: jobs.reduce((acc, j) => {
      const s = j.status || 'Pending';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {}),
    recentUsers: [...users].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5),
    pendingTechnicians: pendingTechnicians.slice(0, 5),
  };
}

async function getAnalytics() {
  const jobs = await listJobs();
  const users = await listUsers();
  const { data: reviews } = await supabase.from('reviews').select('*');
  const technicians = users.filter((u) => u.role === 'technician');
  const technicianPerformance = technicians
    .map((t) => {
      const assigned = jobs.filter((j) => j.technician_uid === t.uid || j.technician_name === t.name);
      return { name: t.name || t.email, requests: assigned.length, completed: assigned.filter((j) => String(j.status).toLowerCase() === 'completed').length };
    })
    .filter((x) => x.requests > 0)
    .sort((a, b) => b.completed - a.completed);
  const categories = jobs.reduce((acc, j) => {
    const cat = j.appliance_type || j.category || 'Other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  return {
    requestVolume: jobs.length,
    completedRequests: jobs.filter((j) => String(j.status).toLowerCase() === 'completed').length,
    technicianPerformance,
    popularCategories: Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    reviewCount: (reviews || []).length,
  };
}

module.exports = { listJobs, getOverview, getAnalytics };
