const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const productSource = fs.readFileSync(path.join(__dirname, '..', 'product_activator.js'), 'utf8');

function extractWindow(source, marker, span = 420) {
    const idx = source.indexOf(marker);
    assert.ok(idx >= 0, `missing marker: ${marker}`);
    return source.slice(idx, idx + span);
}

test('checkout terminal failures should no longer be classified as retryable', () => {
    for (const source of [serverSource, productSource]) {
        for (const marker of [
            'PayPal 未渲染创建账户表单',
            '支付失败 (stripe_redirect_failed)',
            '支付失败 (paypal_blocked)'
        ]) {
            const window = extractWindow(source, marker);
            assert.match(window, /status: 'failed'/, `expected failed status near ${marker}`);
            assert.match(window, /shouldRetry: false/, `expected shouldRetry false near ${marker}`);
        }
    }

    assert.match(extractWindow(serverSource, 'if (timedOut || normalized.includes("运行时错误")) {', 320), /shouldRetry: false/);
    assert.match(extractWindow(productSource, "if (timedOut || normalized.includes('运行时错误')) {", 360), /shouldRetry: false/);
});
