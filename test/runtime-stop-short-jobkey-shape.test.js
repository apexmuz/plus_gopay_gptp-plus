const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('runtime stop lookup should tolerate short job-key suffixes from runtime log views', () => {
    assert.match(
        serverSource,
        /function resolveStopHandlerByJobKey\(handlerMap, jobKey\)/,
        'expected a shared job-key resolver for stop handlers'
    );

    assert.match(
        serverSource,
        /candidateKeys\.filter\(\(key\) => key === normalizedKey \|\| key\.endsWith\(normalizedKey\)\)/,
        'expected stop lookup to fall back to suffix matching'
    );

    assert.match(
        serverSource,
        /const fn = resolveStopHandlerByJobKey\(runtimeTaskStopHandlers, jobKey\)/,
        'expected runtime stop requests to use the shared resolver'
    );

    assert.match(
        serverSource,
        /const fn = resolveStopHandlerByJobKey\(adminGenerationStopHandlers, jobKey\)/,
        'expected admin batch stop requests to use the shared resolver'
    );
});
