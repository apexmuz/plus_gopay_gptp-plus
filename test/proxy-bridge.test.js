const assert = require('assert');
const net = require('net');
const test = require('node:test');

const {
    needsPlaywrightProxyBridge,
    startLocalPlaywrightProxyBridge,
    stopLocalPlaywrightProxyBridge
} = require('../playwright-proxy-bridge');

test('needsPlaywrightProxyBridge detects authenticated socks proxy', () => {
    assert.strictEqual(needsPlaywrightProxyBridge('socks5://user:pass@127.0.0.1:1080'), true);
    assert.strictEqual(needsPlaywrightProxyBridge('socks://user:pass@127.0.0.1:1080'), true);
    assert.strictEqual(needsPlaywrightProxyBridge('http://user:pass@127.0.0.1:8080'), false);
    assert.strictEqual(needsPlaywrightProxyBridge('socks5://127.0.0.1:1080'), false);
    assert.strictEqual(needsPlaywrightProxyBridge(''), false);
});

test('startLocalPlaywrightProxyBridge exposes local unauthenticated http proxy for socks upstream metadata', async () => {
    const fakeCreateConnection = async () => {
        const upstream = new net.Socket();
        upstream.destroy = () => {};
        upstream.on = () => upstream;
        upstream.pipe = () => upstream;
        upstream.write = () => true;
        return { socket: upstream };
    };

    const bridge = await startLocalPlaywrightProxyBridge('socks5://user:pass@127.0.0.1:1080', {
        createConnection: fakeCreateConnection
    });
    assert.ok(bridge);
    assert.ok(bridge.localProxyUrl.startsWith('http://127.0.0.1:'));
    assert.strictEqual(bridge.upstream.protocol, 'socks5');
    assert.strictEqual(bridge.upstream.host, '127.0.0.1');
    assert.strictEqual(bridge.upstream.port, 1080);
    assert.strictEqual(bridge.upstream.username, 'user');
    assert.strictEqual(bridge.upstream.password, 'pass');

    const url = new URL(bridge.localProxyUrl);
    assert.ok(Number(url.port) > 0);

    await new Promise((resolve, reject) => {
        const socket = net.connect({ host: '127.0.0.1', port: Number(url.port) }, () => {
            socket.destroy();
            resolve();
        });
        socket.on('error', reject);
    });

    await stopLocalPlaywrightProxyBridge(bridge);
});
