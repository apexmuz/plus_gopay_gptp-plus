const assert = require('assert');
const test = require('node:test');
const { normalizeExcludedCodes, isCodeExcluded, pickFirstAllowedCode } = require('../otp-code-utils');

test('normalizeExcludedCodes supports string, array and Set inputs', () => {
    assert.deepStrictEqual([...normalizeExcludedCodes('671316')], ['671316']);
    assert.deepStrictEqual([...normalizeExcludedCodes(['671316', '490340', '671316'])], ['671316', '490340']);
    assert.deepStrictEqual([...normalizeExcludedCodes(new Set(['111111', '222222']))], ['111111', '222222']);
});

test('pickFirstAllowedCode skips all previously attempted OTP codes, not just the last one', () => {
    const codes = ['671316', '490340', '771234'];
    const excluded = ['671316', '490340'];

    assert.strictEqual(isCodeExcluded('671316', excluded), true);
    assert.strictEqual(isCodeExcluded('490340', excluded), true);
    assert.strictEqual(isCodeExcluded('771234', excluded), false);
    assert.strictEqual(pickFirstAllowedCode(codes, excluded), '771234');
});
