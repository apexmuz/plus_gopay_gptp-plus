const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('paypal challenge handling should actively solve hcaptcha while waiting for create-account entry', () => {
    assert.match(
        source,
        /const HCAPTCHA_CHECKBOX_SELECTORS = \[/,
        'expected dedicated hcaptcha checkbox selectors'
    );

    assert.match(
        source,
        /#checkbox/,
        'expected hcaptcha checkbox selector support'
    );

    assert.match(
        source,
        /async function waitForCreateAccountButton\(/,
        'expected an active wait helper for the PayPal create-account button'
    );

    assert.match(
        source,
        /await solveSlider\(\);[\s\S]*?await checkCriticalErrors\(\);/s,
        'expected create-account waiting path to keep solving challenges while polling'
    );
});
