import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatExperience,
  formatRating,
  formatReviewDate,
  formatSkillList,
  draftFromProfile,
  getVerificationBadge,
} from '../Fixlinkmobile/mobile/src/utils/technicianProfileHelpers.ts';

test('formatExperience formats single, multiple, and empty years properly', () => {
  assert.equal(formatExperience(undefined), '0 yrs');
  assert.equal(formatExperience(null), '0 yrs');
  assert.equal(formatExperience(''), '0 yrs');
  assert.equal(formatExperience(0), '0 yrs');
  assert.equal(formatExperience(1), '1 yr');
  assert.equal(formatExperience('1'), '1 yr');
  assert.equal(formatExperience(5), '5 yrs');
  assert.equal(formatExperience('7'), '7 yrs');
});

test('formatRating handles missing, zero, and valid numbers', () => {
  assert.equal(formatRating(undefined), 'N/A');
  assert.equal(formatRating(null), 'N/A');
  assert.equal(formatRating(0), 'N/A');
  assert.equal(formatRating(4.8), '4.8');
  assert.equal(formatRating(5), '5.0');
});

test('formatReviewDate converts ISO timestamp into human readable date', () => {
  assert.equal(formatReviewDate(null), '');
  assert.equal(formatReviewDate(undefined), '');
  assert.equal(formatReviewDate('invalid-date'), '');
  const result = formatReviewDate('2026-05-15T12:00:00.000Z');
  assert.match(result, /May 15, 2026/);
});

test('formatSkillList extracts cleanly trimmed skill names', () => {
  assert.deepEqual(formatSkillList(undefined), []);
  assert.deepEqual(formatSkillList(''), []);
  assert.deepEqual(formatSkillList('Refrigeration, Aircon , Washing Machine'), [
    'Refrigeration',
    'Aircon',
    'Washing Machine',
  ]);
  assert.deepEqual(formatSkillList(['Laptop', ' PC ', '']), ['Laptop', 'PC']);
});

test('draftFromProfile correctly maps profile data to form draft', () => {
  const profile = {
    name: 'Juan Dela Cruz',
    phone: '09123456789',
    address: 'Bogo City, Cebu',
    bio: 'Certified technician with 8 years of experience.',
    skills: ['Refrigeration', 'Air Conditioning'],
    yearsExperience: 8,
  };
  const draft = draftFromProfile(profile);
  assert.equal(draft.name, 'Juan Dela Cruz');
  assert.equal(draft.phone, '09123456789');
  assert.equal(draft.address, 'Bogo City, Cebu');
  assert.equal(draft.bio, 'Certified technician with 8 years of experience.');
  assert.equal(draft.skills, 'Refrigeration, Air Conditioning');
  assert.equal(draft.yearsExperience, '8');
});

test('getVerificationBadge returns appropriate label and status', () => {
  const verified = getVerificationBadge(true);
  assert.equal(verified.isVerified, true);
  assert.equal(verified.label, 'Verified Technician');
  assert.equal(verified.icon, 'shield-checkmark');

  const unverified = getVerificationBadge(false);
  assert.equal(unverified.isVerified, false);
  assert.equal(unverified.label, 'Verification Pending');
  assert.equal(unverified.icon, 'shield-outline');
});
