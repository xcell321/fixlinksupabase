// POST /api/ai/assistant — Customer floating FixLink Assistant.
// Thin route: language state lives in services/ai/assistantLanguage.js,
// the prompt stays identical to the original. Behavior is unchanged.

const express = require('express');

const router = express.Router();
const { supabase } = require('../../config/supabase');
const { chatComplete, isOmniRouteConfigured } = require('../../services/omniRoute');
const { resolveAssistantLanguage } = require('../../services/ai/assistantLanguage');

router.post('/assistant', async (req, res) => {
  try {
    const { message, context } = req.body || {};
    const text = String(message || '').trim().slice(0, 500);
    if (!text) {
      return res.status(400).json({ error: 'A message is required.' });
    }
    if (!isOmniRouteConfigured()) {
      return res.status(502).json({ error: 'AI service is not configured.', ai: 'degraded' });
    }
    const c = context && typeof context === 'object' ? context : {};
    const customerKey = String(c.customerUid || c.customerName || '').trim().toLowerCase();
    const { lang, switched } = resolveAssistantLanguage(text, customerKey);

    // Top technicians by rating for ranking/recommendation questions (real data only).
    let topTechnicians = [];
    try {
      const { data: techRows } = await supabase
        .from('users')
        .select('name, rating, total_reviews, years_experience, skills')
        .eq('role', 'technician')
        .order('rating', { ascending: false, nullsFirst: false })
        .limit(5);
      const { summarizeRatings } = require('../../services/ratings/ratingSummary');
      topTechnicians = (techRows || []).map((t) => ({
        name: t.name,
        rating: t.rating != null ? Number(Number(t.rating).toFixed(1)) : null,
        reviews: t.total_reviews != null ? Number(t.total_reviews) : 0,
        yearsExperience: t.years_experience ?? null,
        skills: Array.isArray(t.skills) ? t.skills.slice(0, 5) : [],
      }));
      void summarizeRatings;
    } catch (_) {}
    const live = {
      customerName: c.customerName || null,
      activeJob: c.activeJob || null,
      activeCount: c.activeCount ?? null,
      pendingCount: c.pendingCount ?? null,
      completedCount: c.completedCount ?? null,
      topTechnicians,
    };
    const system = [
      "You are FixLink Assistant, the friendly in-app helper for FixLink customers (repair request + technician dispatch, Philippines).",
      'Reply ONLY in the detected customer language. Never mix languages: English messages get English-only replies, Bisaya gets Bisaya-only, Tagalog gets Tagalog-only.',
      'If the customer just asked to switch languages, confirm briefly in the NEW language (e.g. "Sure! Let us continue in English.") and then answer their question in that language.',
      'Reply warmly and directly, at most 4 short sentences, plain text, no markdown.',
      'Greet by first name only when the customer greets you.',
      'You know the FixLink mobile system: customer submits a repair in 4 steps (Appliance, Problem, Schedule, Location with GPS + map), tracks it under Repairs with live map, chats via Messages, verifies completion with a 4-digit OTP code, and rates the technician. Technicians see Available/Assigned jobs within 20km, accept jobs, navigate on the in-app map, and complete via OTP. Customer login and technician login are separate; a customer account cannot log in as technician and vice versa.',
      'For questions about the system or how to use the app, explain using the real screen and button names above.',
      'For ranking or recommendation questions, rank using ONLY topTechnicians (rating, then reviews). Name names with rating and review count, e.g. "1. Dustine Villaruz - 4.9 (12 reviews)".',
      'For status or time questions, use ONLY activeJob (status, technicianName, preferredTime). Never invent names, statuses, times, or prices.',
      'Do NOT provide price estimates. FixLink matching itself is free.',
      'If the data does not answer the question, say what the customer should tap (Book service, Repairs, Messages).',
    ].join(' ');
    const user = `Detected language: ${lang}.${switched ? ' The customer just requested this language; confirm briefly, then answer.' : ''} You MUST reply ONLY in ${lang}. Any other language is a wrong answer.\nCustomer message: ${text}\nLive FixLink data: ${JSON.stringify(live).slice(0, 2000)}`;
    console.log(`AI assistant lang: ${lang}${switched ? ' (switched)' : ''} | msg: ${text.slice(0, 60)}`);
    const { content } = await chatComplete({ system, user, json: false, temperature: 0.4, maxTokens: 260 });
    return res.status(200).json({ reply: String(content).trim().slice(0, 900), ai: 'ai' });
  } catch (error) {
    console.error('AI assistant error:', error.message);
    return res.status(502).json({ error: 'AI service unavailable.', ai: 'degraded' });
  }
});

module.exports = router;
