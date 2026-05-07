const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const productSource = fs.readFileSync(path.join(__dirname, '..', 'product_activator.js'), 'utf8');

function extractWindow(source, marker, span = 360) {
    const idx = source.indexOf(marker);
    assert.ok(idx >= 0, `missing marker: ${marker}`);
    return source.slice(idx, idx + span);
}

test('checkout proxy parse error should be classified as retryable transient failure', () => {
    for (const source of [serverSource, productSource]) {
        const window = extractWindow(source, 'Parse Error: Expected HTTP/, RTSP/ or ICE/');
        assert.match(window, /status: 'retry'/);
        assert.match(window, /shouldRetry: true/);
        assert.match(window, /当前代理超时严重，已切换代理重试/);
    }
});
