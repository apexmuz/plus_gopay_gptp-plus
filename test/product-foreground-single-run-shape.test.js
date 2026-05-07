const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const activatorSource = fs.readFileSync(path.join(__dirname, '..', 'product_activator.js'), 'utf8');

test('foreground product creation should opt into single-run mode', () => {
    assert.match(
        activatorSource,
        /const singleRun = options\.singleRun === true;/,
        'expected product activator to read options.singleRun'
    );

    assert.match(
        activatorSource,
        /const maxAccountRetries = singleRun \? 1 : CONFIG\.MAX_ACCOUNT_RETRIES/,
        'expected single-run mode to collapse account retries to 1'
    );

    assert.match(
        activatorSource,
        /const maxActivationRetriesPerAccount = singleRun \? 1 : CONFIG\.MAX_ACT_RETRIES_PER_ACCOUNT/,
        'expected single-run mode to collapse activation retries to 1'
    );

    assert.match(
        serverSource,
        /startProductCreation\(cdk,[\s\S]*?\{[\s\S]*?jobKey: task\.jobKey,[\s\S]*?stopController,[\s\S]*?singleRun: true[\s\S]*?\}\)/,
        'expected /api/redeem-product to force single-run mode for foreground tasks'
    );
});
