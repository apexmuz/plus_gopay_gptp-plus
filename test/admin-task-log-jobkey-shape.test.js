const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const mysqlSource = fs.readFileSync(path.join(__dirname, '..', 'mysql-store.js'), 'utf8');
const adminSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');

test('admin task table should use canonical task job_key for stop/delete actions', () => {
    assert.match(
        mysqlSource,
        /logs: logRows\.map\([\s\S]*?id: row\.job_key,[\s\S]*?\}\)/s,
        'expected admin task log payload to expose job_key as row id'
    );

    assert.match(
        adminSource,
        /onclick='stopAdminTask\(\$\{JSON\.stringify\(l\.id\)\}\)'/,
        'expected task stop action to use canonical id field from API'
    );

    assert.match(
        adminSource,
        /onclick='deleteAdminTaskLog\(\$\{JSON\.stringify\(l\.id\)\}\)'/,
        'expected task delete action to use canonical id field from API'
    );
});
