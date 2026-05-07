const assert = require('assert');
const test = require('node:test');
const { detectRegistrationAdvance } = require('../registration-submit-state');

test('detectRegistrationAdvance: 错误页 errorPageVisible 不应判定为推进成功', () => {
    // 真实场景：第二次 OTP 提交后页面跳到 OpenAI 错误页（Try again），OTP 框消失
    const before = { url: 'https://auth.openai.com/email-verification', otpVisible: true, profileVisible: false, chatVisible: false };
    const after = { url: 'https://auth.openai.com/email-verification', otpVisible: false, profileVisible: false, chatVisible: false, errorPageVisible: true };

    const result = detectRegistrationAdvance(before, after, before.url);
    assert.strictEqual(result, null, '错误页时不能算 otpGone 推进成功');
});

test('detectRegistrationAdvance: 正常进入资料页，仍判定为 profileShown', () => {
    const before = { url: 'https://auth.openai.com/email-verification', otpVisible: true, profileVisible: false, chatVisible: false };
    const after = { url: 'https://auth.openai.com/about-you', otpVisible: false, profileVisible: true, chatVisible: false, errorPageVisible: false };

    const result = detectRegistrationAdvance(before, after, before.url);
    assert.strictEqual(result, 'urlChanged', '页面跳转应被识别为成功推进');
});

test('detectRegistrationAdvance: 已进入 chatgpt 仍优先判定为 chatLoaded', () => {
    const before = { url: 'https://auth.openai.com/email-verification', otpVisible: true, profileVisible: false, chatVisible: false };
    const after = { url: 'https://chatgpt.com', otpVisible: false, profileVisible: false, chatVisible: true, errorPageVisible: false };

    const result = detectRegistrationAdvance(before, after, before.url);
    assert.strictEqual(result, 'chatLoaded');
});
