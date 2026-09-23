import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWorkloadDisplayStatus,
  filterJobs,
  formatJobSchedule,
  validateOtpCode,
  calculateWorkloadSummary,
  getTechnicianCredentialBadgeInfo
} from '../Fixlinkmobile/mobile/src/utils/availableJobsHelpers.ts';

test('getWorkloadDisplayStatus returns correct status based on active count', () => {
  assert.equal(getWorkloadDisplayStatus(0), 'available');
  assert.equal(getWorkloadDisplayStatus(2), 'available');
  assert.equal(getWorkloadDisplayStatus(3), 'busy');
  assert.equal(getWorkloadDisplayStatus(5), 'busy');
  assert.equal(getWorkloadDisplayStatus(6), 'at_capacity');
  assert.equal(getWorkloadDisplayStatus(10), 'at_capacity');
});

test('validateOtpCode checks for exactly 4 digits', () => {
  assert.equal(validateOtpCode('1234'), true);
  assert.equal(validateOtpCode(' 1234 '), true);
  assert.equal(validateOtpCode('123'), false);
  assert.equal(validateOtpCode('12345'), false);
  assert.equal(validateOtpCode('abcd'), false);
  assert.equal(validateOtpCode(''), false);
});

test('calculateWorkloadSummary calculates remaining capacity and label', () => {
  const summary1 = calculateWorkloadSummary(1);
  assert.equal(summary1.status, 'available');
  assert.equal(summary1.activeCount, 1);
  assert.equal(summary1.remainingCapacity, 5);
  assert.equal(summary1.label, 'Available');

  const summary2 = calculateWorkloadSummary(6);
  assert.equal(summary2.status, 'at_capacity');
  assert.equal(summary2.remainingCapacity, 0);
  assert.equal(summary2.label, 'At Capacity');
});

test('filterJobs filters by category, distance, and query', () => {
  const sampleJobs = [
    { id: '1', applianceType: 'Samsung Refrigerator', description: 'Leaking water', distanceKm: 3.5, customerName: 'Alice' },
    { id: '2', applianceType: 'Carrier Air Conditioner', description: 'Not cooling', distanceKm: 8.2, customerName: 'Bob' },
    { id: '3', applianceType: 'LG Washing Machine', description: 'Motor error', distanceKm: 14.0, customerName: 'Charlie' }
  ];

  const nearbyOnly = filterJobs(sampleJobs, { maxDistanceKm: 10 });
  assert.equal(nearbyOnly.length, 2);

  const categoryOnly = filterJobs(sampleJobs, { category: 'Aircon' });
  assert.equal(categoryOnly.length, 1);
  assert.equal(categoryOnly[0].id, '2');

  const queryMatch = filterJobs(sampleJobs, { searchQuery: 'water' });
  assert.equal(queryMatch.length, 1);
  assert.equal(queryMatch[0].id, '1');
});

test('formatJobSchedule handles various formats', () => {
  const jobWithDateAndTime = { id: '1', preferredDate: 'Oct 12', preferredTime: '2:00 PM' };
  assert.equal(formatJobSchedule(jobWithDateAndTime), 'Oct 12 (at) 2:00 PM');

  const jobWithTimeOnly = { id: '2', preferredTime: '3:00 PM' };
  assert.equal(formatJobSchedule(jobWithTimeOnly), '3:00 PM');
});

test('getTechnicianCredentialBadgeInfo returns correct badge state and descriptions', () => {
  const verifiedActive = getTechnicianCredentialBadgeInfo({ verified: true, status: 'active' });
  assert.equal(verifiedActive.isVerified, true);
  assert.equal(verifiedActive.badgeLabel, 'Verified Pro');
  assert.equal(verifiedActive.badgeSublabel, 'TESDA Accredited');
  assert.equal(verifiedActive.icon, 'shield-checkmark');

  const verifiedStatus = getTechnicianCredentialBadgeInfo({ verificationStatus: 'verified' });
  assert.equal(verifiedStatus.isVerified, true);

  const pending = getTechnicianCredentialBadgeInfo({ verified: false, status: 'pending' });
  assert.equal(pending.isVerified, false);
  assert.equal(pending.badgeLabel, 'Verification Pending');
  assert.equal(pending.badgeSublabel, 'Under Review');
  assert.equal(pending.icon, 'shield-outline');

  const empty = getTechnicianCredentialBadgeInfo(undefined);
  assert.equal(empty.isVerified, false);
});



