const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('stripe billing fields should use stable fill mode instead of fragile slow typing', () => {
    const expectations = [
        /await humanFillInput\(page, nameInput, CONFIG\.billing\.name, false, true\)/,
        /await humanFillInput\(page, page\.locator\('#billingAddressLine1'\), CONFIG\.billing\.address, false, true\)/,
        /await humanFillInput\(page, zipLoc, CONFIG\.billing\.zip, false, true\)/,
        /await humanFillInput\(page, cityLoc, CONFIG\.billing\.city, false, true\)/,
        /await humanFillInput\(page, el, item\.val, false, true\)/
    ];

    for (const regex of expectations) {
        assert.match(source, regex);
    }
});
