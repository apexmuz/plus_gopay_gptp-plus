const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

test('getAdminData stats include product_running_job_key', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'mysql-store.js'), 'utf8');

    assert.match(
        source,
        /product_running_job_key:\s*productPendingRows\.length\s*>\s*0[\s\S]*parseAdminProductGenerationTask\(productPendingRows\[0\]\)\.jobKey/,
        'expected getAdminData to expose running admin product generation job key'
    );
});
