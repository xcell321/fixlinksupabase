// Admin technician review: detail, credential proxy, approve/reject decisions.
const express = require('express');

const router = express.Router();
const { supabase } = require('../../config/supabase');

router.get('/technicians/:uid', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('*').eq('id', req.params.uid).maybeSingle();
    if (error) throw error;
    if (!data || data.role !== 'technician') return res.status(404).json({ error: 'Technician profile not found' });
    const { password, passwordHash, resetToken, ...safe } = data;
    // Provide camelCase aliases for the technician-review frontend (which expects governmentIdFileUrl etc.)
    // while keeping snake_case for backwards compatibility.
    const camelAliases = {
      governmentIdNumber: data.government_id_number ?? null,
      governmentIdFileUrl: data.government_id_file_url ?? null,
      certificateFileUrl: data.certificate_file_url ?? null,
      yearsExperience: data.years_experience ?? null,
      verificationStatus: data.verification_status ?? null,
      rejectionReason: data.rejection_reason ?? null,
    };
    res.json({ uid: data.id, ...safe, ...camelAliases, status: data.status || data.verification_status || 'active', createdAt: data.created_at || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/technicians/:uid/credential/:type', async (req, res) => {
  try {
    const fieldByType = { 'government-id': 'government_id_file_url', certificate: 'certificate_file_url' };
    const field = fieldByType[req.params.type];
    if (!field) return res.status(400).json({ error: 'Invalid credential type' });
    const { data } = await supabase.from('users').select(field).eq('id', req.params.uid).maybeSingle();
    const fileUrl = data ? data[field] : null;
    if (!fileUrl) return res.status(404).json({ error: 'Credential file not found' });
    // Supabase Storage public URL — fetch and proxy
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) return res.status(fileResponse.status).json({ error: 'Credential file could not be loaded' });
    res.setHeader('Content-Type', fileResponse.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.send(Buffer.from(await fileResponse.arrayBuffer()));
  } catch (error) {
    res.status(500).json({ error: 'Credential file could not be loaded' });
  }
});

router.patch('/technicians/:uid/decision', async (req, res) => {
  try {
    const { decision, reason } = req.body;
    const status = decision === 'approve' ? 'active' : decision === 'reject' ? 'rejected' : null;
    if (!status) return res.status(400).json({ error: 'decision must be approve or reject' });
    const { error } = await supabase
      .from('users')
      .update({
        status,
        verification_status: status === 'active' ? 'verified' : 'rejected',
        rejection_reason: reason || null,
      })
      .eq('id', req.params.uid);
    if (error) throw error;
    res.json({ message: `Technician ${decision}d successfully`, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/verify-technician/:uid', async (req, res) => {
  try {
    const { error } = await supabase.from('users').update({ status: 'active', verification_status: 'verified' }).eq('id', req.params.uid);
    if (error) throw error;
    res.status(200).json({ message: 'Technician verified and activated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
