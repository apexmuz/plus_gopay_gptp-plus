const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const adminSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');

test('runtime task stop handlers are wired for foreground product creation and self-service tasks', () => {
    assert.match(
        serverSource,
        /const runtimeTaskStopHandlers = new Map\(\)/,
        'expected a runtime task stop registry'
    );

    assert.match(
        serverSource,
        /app\.post\('\/api\/redeem-product'[\s\S]*?const stopController = createStopController\(\);[\s\S]*?registerRuntimeTaskStop\(task\.jobKey,[\s\S]*?startProductCreation\(cdk,[\s\S]*?stopController/s,
        'expected /api/redeem-product to register and pass a stopController'
    );

    assert.match(
        serverSource,
        /app\.post\('\/api\/run-process'[\s\S]*?const stopController = createStopController\(\);[\s\S]*?registerRuntimeTaskStop\(task\.jobKey,[\s\S]*?runCheckoutScript\(task\.jobKey,[\s\S]*?stopController/s,
        'expected /api/run-process to register and pass a stopController'
    );
});

test('admin task management exposes per-task stop action for running rows', () => {
    assert.match(
        adminSource,
        /async function stopAdminTask\(jobKey\)/,
        'expected admin page to define stopAdminTask(jobKey)'
    );

    assert.match(
        adminSource,
        /renderLogTable\([\s\S]*?l\.status === 'running'[\s\S]*?stopAdminTask\(/,
        'expected task table to render a stop button for running tasks'
    );
});
