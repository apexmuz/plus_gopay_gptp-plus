const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'register_openai.js'), 'utf8');

test('submitOtpWithRetry tracks all attempted OTP codes and uses registration advance state helper', () => {
    assert.match(
        source,
        /const attemptedCodes = new Set\(\)/,
        'expected submitOtpWithRetry to keep a set of all attempted codes'
    );

    assert.match(
        source,
        /detectRegistrationAdvance/,
        'expected register flow to use registration advance state detection'
    );
});

test('fillProfileFieldsIfPresent reuses one stable registration profile per flow', () => {
    assert.match(
        source,
        /__registrationProfile\s*=\s*null/,
        'expected module-level cached registration profile state'
    );

    assert.match(
        source,
        /__registrationProfile\s*\|\|\s*\(__registrationProfile\s*=\s*createRegistrationProfile\(\)\)/,
        'expected fillProfileFieldsIfPresent to reuse a cached profile instead of regenerating every retry'
    );
});

test('inbox address creation uses a human-like name derived from the registration profile', () => {
    assert.match(
        source,
        /name:\s*registrationProfile\.emailLocalPart/,
        'expected createAddress to pass a human-like email local-part instead of API-random meaningless characters'
    );
});
