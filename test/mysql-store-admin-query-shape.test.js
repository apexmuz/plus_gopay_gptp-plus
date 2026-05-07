const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

test('getAdminData config query keeps placeholder count aligned with config keys', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'mysql-store.js'), 'utf8');
    const match = source.match(/WHERE config_key IN \(([^)]*)\)\s*`,\s*\[([\s\S]*?)\]\s*\),/);

    assert.ok(match, 'expected to find getAdminData config query');

    const placeholders = (match[1].match(/\?/g) || []).length;
    const configKeys = (match[2].match(/'[^']*'/g) || []).length;

    assert.strictEqual(placeholders, configKeys);
});
