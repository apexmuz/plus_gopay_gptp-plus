const assert = require('assert');
const test = require('node:test');
const { detectRegistrationAdvance } = require('../registration-submit-state');

test('does not treat submit as successful when email input was already absent before click', () => {
    const before = {
        url: 'https://auth.openai.com/email-verification/register',
        chatVisible: false,
        emailVisible: false,
        otpVisible: true,
        profileVisible: true
    };
    const after = {
        url: 'https://auth.openai.com/email-verification/register',
        chatVisible: false,
        emailVisible: false,
        otpVisible: true,
        profileVisible: true
    };

    assert.strictEqual(detectRegistrationAdvance(before, after, before.url), null);
});

test('treats otp disappearance or profile appearance as a real advance signal', () => {
    const startUrl = 'https://auth.openai.com/email-verification/register';

    assert.strictEqual(
        detectRegistrationAdvance(
            { url: startUrl, chatVisible: false, emailVisible: false, otpVisible: true, profileVisible: false },
            { url: startUrl, chatVisible: false, emailVisible: false, otpVisible: false, profileVisible: true },
            startUrl
        ),
        'profileShown'
    );

    assert.strictEqual(
        detectRegistrationAdvance(
            { url: startUrl, chatVisible: false, emailVisible: false, otpVisible: true, profileVisible: true },
            { url: startUrl, chatVisible: false, emailVisible: false, otpVisible: false, profileVisible: false },
            startUrl
        ),
        'otpGone'
    );
});
