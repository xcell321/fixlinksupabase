// Regression tests for the FixLink Assistant knowledge base and retriever.
//
// These are pure, offline unit tests: no server, no Supabase, no AI gateway.
// They lock the behaviour the assistant relies on:
//   - a matching question routes to the right knowledge section,
//   - role filtering keeps customer-only and technician-only knowledge apart,
//   - the prompt is always grounded, even for unrelated (general) questions,
//   - the injected block never exceeds the character budget.
//
// Run with: npm test   (node --test)

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { KNOWLEDGE_SECTIONS } = require('../src/services/ai/knowledgeBase');
const { retrieveKnowledge, normalizeRole } = require('../src/services/ai/knowledgeRetriever');

test('knowledge base sections are well formed and uniquely identified', () => {
  assert.ok(KNOWLEDGE_SECTIONS.length >= 10, 'expected a substantial knowledge base');
  const ids = KNOWLEDGE_SECTIONS.map((section) => section.id);
  assert.equal(new Set(ids).size, ids.length, 'section ids must be unique');
  for (const section of KNOWLEDGE_SECTIONS) {
    assert.ok(section.id && typeof section.id === 'string', 'section needs an id');
    assert.ok(section.title && typeof section.title === 'string', `${section.id} needs a title`);
    assert.ok(section.content && section.content.length > 40, `${section.id} needs real content`);
    assert.ok(section.roles === 'all' || Array.isArray(section.roles), `${section.id} roles must be 'all' or a list`);
  }
});

test('role defaults to customer and only recognises known roles', () => {
  assert.equal(normalizeRole(undefined), 'customer');
  assert.equal(normalizeRole('technician'), 'technician');
  assert.equal(normalizeRole('TECHNICIAN'), 'technician');
  assert.equal(normalizeRole('admin'), 'admin');
  assert.equal(normalizeRole('something-else'), 'customer');
});

test('a booking question retrieves the customer booking section', () => {
  const result = retrieveKnowledge('unsaon pag submit ug repair request');
  assert.ok(result.sections.includes('customer-submit-request'), result.sections.join(','));
  assert.match(result.text, /four steps/i);
});

test('a cancellation question retrieves the cancellation policy section', () => {
  const result = retrieveKnowledge('can I cancel my request after the technician accepts');
  assert.ok(result.sections.includes('cancellation-policy'), result.sections.join(','));
});

test('a code question retrieves the completion OTP section', () => {
  const result = retrieveKnowledge('what is the 4 digit OTP code for completing the job');
  assert.ok(result.sections.includes('completion-otp'), result.sections.join(','));
});

test('role filtering keeps technician knowledge out of a customer answer', () => {
  const technician = retrieveKnowledge('available jobs near me that I can accept', { role: 'technician' });
  assert.ok(technician.sections.includes('technician-jobs-feed'), technician.sections.join(','));

  const customer = retrieveKnowledge('available jobs near me that I can accept', { role: 'customer' });
  assert.ok(!customer.sections.includes('technician-jobs-feed'), customer.sections.join(','));
});

test('customer-only knowledge is hidden from technicians', () => {
  const technician = retrieveKnowledge('how do I book a repair', { role: 'technician' });
  assert.ok(!technician.sections.includes('customer-submit-request'), technician.sections.join(','));
});

test('an unrelated general question is still grounded with baseline sections', () => {
  const result = retrieveKnowledge('what is the capital of France');
  assert.ok(result.sections.includes('platform-overview'), result.sections.join(','));
  assert.ok(result.text.length > 0);
});

test('an empty question returns the baseline grounding', () => {
  const result = retrieveKnowledge('');
  assert.ok(result.sections.includes('platform-overview'), result.sections.join(','));
});

test('the injected knowledge never exceeds the character budget', () => {
  const query = 'fixlink jobs chat otp tracking reviews technician booking schedule workload notifications';
  for (const maxChars of [400, 1200, 3500]) {
    const result = retrieveKnowledge(query, { maxChars });
    assert.ok(result.text.length <= maxChars, `text ${result.text.length} exceeded ${maxChars}`);
  }
});

test('the limit caps how many sections are injected', () => {
  const result = retrieveKnowledge('fixlink jobs chat otp tracking reviews technician booking', { limit: 2, maxChars: 100000 });
  assert.ok(result.sections.length <= 2, result.sections.join(','));
});
