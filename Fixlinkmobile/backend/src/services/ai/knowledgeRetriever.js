// Lightweight retrieval over the FixLink knowledge base.
//
// Deliberately dependency-free: instead of embeddings it scores sections with a
// small keyword model (title, tags, body occurrences) and filters by role. That
// keeps the assistant grounded without an extra service, works offline, and
// scales far better than pasting the entire knowledge base into every prompt.
//
// retrieveKnowledge(query, { role, limit, maxChars }) returns:
//   { text, sections, role }
// where `text` is a ready-to-inject block and `sections` lists the chosen ids.

const { KNOWLEDGE_SECTIONS } = require('./knowledgeBase');

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this',
  'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with',
  'about', 'into', 'from', 'as', 'it', 'its', 'me', 'my', 'we', 'our', 'you',
  'your', 'he', 'she', 'they', 'them', 'his', 'her', 'their', 'i', 'can',
  'will', 'would', 'should', 'could', 'how', 'what', 'when', 'where', 'who',
  'why', 'which', 'sa', 'ang', 'ng', 'mga', 'ko', 'nako', 'ako', 'mo', 'imo',
  'ni', 'si', 'kay', 'ug', 'og', 'an', 'na', 'ba', 'man', 'lang', 'din',
  'po', 'ako', 'ikaw', 'siya', 'namo', 'ninyo', 'nga', 'para', 'at',
]);

const DEFAULT_SECTION_IDS = ['platform-overview', 'troubleshooting-faq', 'assistant-capabilities'];

const normalizeRole = (role) => {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'technician') return 'technician';
  if (value === 'admin') return 'admin';
  return 'customer';
};

const tokenize = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));

const appliesToRole = (section, role) => {
  const roles = section.roles;
  if (!roles || roles === 'all') return true;
  return Array.isArray(roles) && roles.includes(role);
};

// Weighted keyword score: a title hit is the strongest signal, then an explicit
// tag, then repetition inside the body (capped so one long section cannot win
// on sheer length alone).
const scoreSection = (section, tokens) => {
  if (tokens.length === 0) return 0;
  const title = String(section.title || '').toLowerCase();
  const tags = (section.tags || []).join(' ').toLowerCase();
  const body = String(section.content || '').toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 4;
    if (tags.includes(token)) score += 3;
    const bodyHits = body.split(token).length - 1;
    if (bodyHits > 0) score += Math.min(bodyHits, 3);
  }
  return score;
};

const renderSection = (section) => `## ${section.title}\n${section.content}`;

const retrieveKnowledge = (query, { role = 'customer', limit = 4, maxChars = 4000 } = {}) => {
  const normalizedRole = normalizeRole(role);
  const tokens = tokenize(query);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 4, KNOWLEDGE_SECTIONS.length));

  const candidates = KNOWLEDGE_SECTIONS
    .filter((section) => appliesToRole(section, normalizedRole))
    .map((section) => ({ section, score: scoreSection(section, tokens) }))
    .sort((a, b) => b.score - a.score);

  const picked = candidates.filter((entry) => entry.score > 0).slice(0, safeLimit);

  // Always ground the model with the baseline sections, even when the question
  // matches nothing strongly (for example a general-knowledge question).
  for (const id of DEFAULT_SECTION_IDS) {
    if (picked.length >= safeLimit) break;
    if (picked.some((entry) => entry.section.id === id)) continue;
    const section = KNOWLEDGE_SECTIONS.find((item) => item.id === id);
    if (section && appliesToRole(section, normalizedRole)) picked.push({ section, score: 0 });
  }

  const blocks = [];
  const chosenIds = [];
  let used = 0;
  for (const { section } of picked) {
    const block = renderSection(section);
    const cost = block.length + (blocks.length > 0 ? 2 : 0);
    if (used + cost > maxChars) {
      const remaining = maxChars - used - (blocks.length > 0 ? 2 : 0);
      if (remaining > 80) {
        blocks.push(block.slice(0, remaining));
        chosenIds.push(section.id);
      }
      break;
    }
    blocks.push(block);
    chosenIds.push(section.id);
    used += cost;
  }

  return { text: blocks.join('\n\n'), sections: chosenIds, role: normalizedRole };
};

module.exports = { retrieveKnowledge, tokenize, normalizeRole, DEFAULT_SECTION_IDS };
