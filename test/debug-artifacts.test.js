const test = require('node:test');
const assert = require('assert');
const path = require('path');

const {
    getDebugArtifactsRoot,
    buildDebugScreenshotPath,
    buildDebugArtifactPath
} = require('../debug-artifacts');

test('debug screenshots default to product_files bind-mounted tree', () => {
    delete process.env.DEBUG_SCREENSHOT_DIR;

    const root = getDebugArtifactsRoot();
    assert.strictEqual(
        root,
        path.join(path.resolve(__dirname, '..'), 'product_files', 'debug_screenshots')
    );

    const screenshotPath = buildDebugScreenshotPath('激活', 'error', 1700000000000);
    assert.strictEqual(
        screenshotPath,
        path.join(root, '激活', 'error_1700000000000.png')
    );
});

test('debug screenshot root supports relative env override from workspace root', () => {
    process.env.DEBUG_SCREENSHOT_DIR = 'runtime/debug-captures';

    const root = getDebugArtifactsRoot();
    assert.strictEqual(
        root,
        path.join(path.resolve(__dirname, '..'), 'runtime', 'debug-captures')
    );

    const artifactPath = buildDebugArtifactPath('注册', 'register_debug_result', '.json', 1700000000123);
    assert.strictEqual(
        artifactPath,
        path.join(root, '注册', 'register_debug_result_1700000000123.json')
    );

    delete process.env.DEBUG_SCREENSHOT_DIR;
});
