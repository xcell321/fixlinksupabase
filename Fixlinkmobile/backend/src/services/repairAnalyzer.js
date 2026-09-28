const { chatComplete, isOmniRouteConfigured } = require('./omniRoute');

// Requirement 1: the AI genuinely analyzes the customer's natural-language
// repair description via OmniRoute and extracts the device, category, problem,
// and the required technician skills. Output is validated and normalized so
// downstream matching only consumes clean, typed data.
const analyzeRepairDescription = async ({ description, applianceType, category }) => {
  const system = [
    "You are FixLink's repair-triage AI. You interpret a customer's natural-language repair request.",
    'Respond with STRICT JSON only, no markdown, matching EXACTLY this shape:',
    '{"device":"lowercase device family","category":"one concise category label","problem":"short symptom phrase","skills":["3 to 5 required technician skill labels"],"confidence":0.0,"isOther":false}',
    'Rules:',
    '- "category" should be a concise label a repair marketplace would group technicians by and must match the listed category when one is provided.',
    '- "skills" are the concrete technician skills this repair needs (e.g. refrigerator, aircon, computer, electronics).',
    '- "confidence" is a number 0..1 reflecting how clearly the description maps to the category.',
    '- "isOther" is true only when the device clearly does not fit any typical repair category.',
  ].join(' ');

  const user = [
    'Customer repair request:',
    `Description: ${String(description || '').trim()}`,
    applianceType ? `Listed device type: ${String(applianceType).trim()}` : '',
    category ? `Picked category: ${String(category).trim()}` : '',
    '',
    'Return the JSON object only.',
  ].filter(Boolean).join('\n');

  const { parsed } = await chatComplete({ system, user, json: true });

  const isString = (value) => typeof parsed?.[value] === 'string' && String(parsed[value]).trim().length > 0;
  const skills = Array.isArray(parsed?.skills)
    ? parsed.skills.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
    : [];
  const confidence = Number(parsed?.confidence);
  const rating = Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0;

  return {
    device: isString('device') ? String(parsed.device).trim() : String(applianceType || '').trim(),
    category: isString('category') ? String(parsed.category).trim() : String(category || '').trim(),
    problem: isString('problem') ? String(parsed.problem).trim() : '',
    skills,
    confidence: rating,
    isOther: Boolean(parsed?.isOther),
  };
};

module.exports = { analyzeRepairDescription, isOmniRouteConfigured };