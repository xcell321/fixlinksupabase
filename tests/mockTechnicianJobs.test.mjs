import test from 'node:test';
import assert from 'node:assert/strict';
import { getPrototypeMockJobs, getPrototypeActiveJobs } from '../Fixlinkmobile/mobile/src/utils/mockTechnicianJobs.ts';

test('getPrototypeMockJobs returns valid list of realistic jobs', () => {
  const jobs = getPrototypeMockJobs();
  assert.ok(Array.isArray(jobs));
  assert.ok(jobs.length >= 3);
  jobs.forEach(job => {
    assert.ok(job.id);
    assert.ok(job.applianceType);
    assert.ok(job.customerName);
    assert.ok(job.location);
    assert.ok(job.distanceKm != null);
  });
});

test('getPrototypeActiveJobs returns valid active jobs', () => {
  const activeJobs = getPrototypeActiveJobs();
  assert.ok(Array.isArray(activeJobs));
  assert.ok(activeJobs.length >= 1);
  assert.equal(activeJobs[0].status, 'In Progress');
});
