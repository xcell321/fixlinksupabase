// Red-Green: UAT #10 — identity on record for every signup.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { verificationRequirements } = require('../src/domain/verificationRequirements');

const file = () => [{ buffer: Buffer.from('x'), mimetype: 'image/jpeg', originalname: 'a.jpg' }];

test('customer without ID file is rejected', () => {
  assert.equal(
    verificationRequirements('customer', { facePhotoFile: file() }),
    'A government ID file is required.'
  );
});

test('customer without face photo is rejected', () => {
  assert.equal(
    verificationRequirements('customer', { governmentIdFile: file() }),
    'A face photo is required.'
  );
});

test('customer with face photo and ID passes', () => {
  assert.equal(
    verificationRequirements('customer', { facePhotoFile: file(), governmentIdFile: file() }),
    null
  );
});

test('technician still needs all three files', () => {
  assert.equal(
    verificationRequirements('technician', { facePhotoFile: file(), governmentIdFile: file() }),
    'A certificate file is required.'
  );
  assert.equal(
    verificationRequirements('technician', { facePhotoFile: file(), governmentIdFile: file(), certificateFile: file() }),
    null
  );
});
