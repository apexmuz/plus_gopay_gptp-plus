const assert = require('assert');
const test = require('node:test');

const { probeCheckoutProxy } = require('../checkout-proxy-probe');

test('probeCheckoutProxy 会在单次 Parse Error 后重试并继续成功', async () => {
    let attempts = 0;
    const request = {
        get: async () => {
            attempts += 1;
            if (attempts === 1) {
                throw new Error('apiRequestContext.get: Parse Error: Expected HTTP/, RTSP/ or ICE/');
            }
            return {
                ok: () => true,
                text: async () => '203.0.113.9'
            };
        }
    };

    const result = await probeCheckoutProxy(request, {
        maxAttempts: 3,
        retryDelayMs: 0
    });

    assert.strictEqual(result.ip, '203.0.113.9');
    assert.strictEqual(result.attempts, 2);
});

test('probeCheckoutProxy 连续 transient error 时，应抛出可重试的代理波动错误', async () => {
    let attempts = 0;
    const request = {
        get: async () => {
            attempts += 1;
            throw new Error('apiRequestContext.get: Parse Error: Expected HTTP/, RTSP/ or ICE/');
        }
    };

    await assert.rejects(
        () => probeCheckoutProxy(request, {
            maxAttempts: 3,
            retryDelayMs: 0
        }),
        /代理或网络持续超时/
    );
    assert.strictEqual(attempts, 3);
});

test('probeCheckoutProxy 遇到 407 应立即判定为代理认证失败', async () => {
    let attempts = 0;
    const request = {
        get: async () => {
            attempts += 1;
            return {
                ok: () => false,
                status: () => 407,
                text: async () => ''
            };
        }
    };

    await assert.rejects(
        () => probeCheckoutProxy(request, {
            maxAttempts: 3,
            retryDelayMs: 0
        }),
        /代理认证失败/
    );
    assert.strictEqual(attempts, 1);
});
