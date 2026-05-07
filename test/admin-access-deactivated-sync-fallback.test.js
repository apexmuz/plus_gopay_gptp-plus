const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

function readServerSource() {
    return fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
}

test('syncAccessDeactivatedProductStatusesSafely returns fallback instead of throwing', async () => {
    const source = readServerSource();
    const match = source.match(/async function syncAccessDeactivatedProductStatusesSafely[\s\S]*?\n}\n(?=\nfunction scheduleAccessDeactivatedSync)/);

    assert.ok(match, 'expected safe access-deactivated sync helper to exist');

    const sandbox = {
        syncAccessDeactivatedProductStatuses: async () => {
            throw new Error('Request failed with status code 401');
        },
        console: {
            error: () => {}
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(`${match[0]}; this.safeSync = syncAccessDeactivatedProductStatusesSafely;`, sandbox);

    const result = await sandbox.safeSync(false, 'admin data');
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(result)),
        {
            skipped: true,
            reason: 'sync_error',
            error: 'Request failed with status code 401'
        }
    );
});

test('admin data and products routes use safe access-deactivated sync wrapper', () => {
    const source = readServerSource();

    assert.match(
        source,
        /app\.get\('\/api\/admin\/data',[\s\S]*?await syncAccessDeactivatedProductStatusesSafely\(false, 'admin data'\);/,
        'expected /api/admin/data to use safe sync wrapper'
    );

    assert.match(
        source,
        /app\.get\('\/api\/admin\/products',[\s\S]*?await syncAccessDeactivatedProductStatusesSafely\(false, 'admin products'\);/,
        'expected /api/admin/products to use safe sync wrapper'
    );
});
