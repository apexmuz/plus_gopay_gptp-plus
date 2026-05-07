const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('server exposes runtime asset preflight helper and uses it in foreground activation routes', () => {
    assert.match(
        serverSource,
        /async function ensureRuntimeAssetsReadyForActivation\(\)[\s\S]*?store\.getRuntimeAssets\(\)/,
        'expected a runtime asset preflight helper backed by store.getRuntimeAssets()'
    );

    assert.match(
        serverSource,
        /app\.post\('\/api\/redeem-product'[\s\S]*?await ensureRuntimeAssetsReadyForActivation\(\)/s,
        'expected /api/redeem-product to preflight runtime assets before starting product creation'
    );

    assert.match(
        serverSource,
        /app\.post\('\/api\/run-process'[\s\S]*?await ensureRuntimeAssetsReadyForActivation\(\)/s,
        'expected /api/run-process to preflight runtime assets before starting self-service activation'
    );
});
