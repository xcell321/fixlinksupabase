// Admin user data-access: mapUser + listUsers.
// Extracted from routes/admin.js. The admin list shape (uid+id, disabled flag,
// dual createdAt/created_at) is preserved exactly so the admin panel HTML
// keeps working. Do not replace with utils/serialize.js without updating the
// frontend contract.

const { supabase } = require('../config/supabase');

function mapUser(row) {
  return {
    uid: row.id,
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status || row.verification_status || 'active',
    verification_status: row.verification_status,
    phone: row.phone,
    address: row.address,
    skills: row.skills,
    government_id_file_url: row.government_id_file_url,
    certificate_file_url: row.certificate_file_url,
    rating: row.rating,
    total_reviews: row.total_reviews,
    createdAt: row.created_at,
    created_at: row.created_at,
    disabled: row.status !== 'active',
  };
}

async function listUsers() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;
  return (data || []).map(mapUser);
}

module.exports = { mapUser, listUsers };
