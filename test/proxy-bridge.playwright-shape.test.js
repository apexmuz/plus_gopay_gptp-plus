const assert = require('assert');
const test = require('node:test');

const {
    needsPlaywrightProxyBridge,
    startLocalPlaywrightProxyBridge,
    stopLocalPlaywrightProxyBridge
} = require('../playwright-proxy-bridge');

test('authenticated socks proxy is converted to local http proxy for Playwright', async () => {
    const fakeCreateConnection = async () => {
        const socket = {
            destroy() {},
            on() { return socket; },
            pipe() { return socket; },
            write() { return true; }
        };
        return { socket };
    };

    const upstream = 'socks5://user:pass@127.0.0.1:1080';
    assert.strictEqual(needsPlaywrightProxyBridge(upstream), true);

    const bridge = await startLocalPlaywrightProxyBridge(upstream, {
        createConnection: fakeCreateConnection
    });
    try {
        assert.match(bridge.localProxyUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
        assert.notStrictEqual(bridge.localProxyUrl, upstream);
    } finally {
        await stopLocalPlaywrightProxyBridge(bridge);
    }
});

