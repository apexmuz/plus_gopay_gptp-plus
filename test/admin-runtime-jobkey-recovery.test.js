const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

test('admin loadData restores current running product generation job key from admin stats', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');

    assert.match(
        source,
        /window\.__adminProductGenJobKey\s*=\s*String\(data\.stats\.product_running_job_key\s*\|\|\s*''\)/,
        'loadData should recover running job key from admin stats'
    );
});
