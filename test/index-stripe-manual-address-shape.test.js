const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('Stripe checkout should expand manual address mode and use visible-only fields', () => {
    assert.match(
        source,
        /Enter address manually/,
        'expected Stripe fallback to click the manual address link when autocomplete does not appear'
    );

    assert.match(
        source,
        /pickFirstVisibleStripeInput/,
        'expected Stripe address fields to use a visible-only selector helper'
    );

    assert.match(
        source,
        /!className\.includes\('HiddenInput'\)/,
        'expected hidden Stripe inputs to be filtered out'
    );
});
