const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readSource(relPath) {
    return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

test('all screenshot writers use shared debug artifact helper rooted in host-accessible storage', () => {
    const expectations = [
        ['index.js', "const { buildDebugScreenshotPath } = require('./debug-artifacts');", "buildDebugScreenshotPath('激活', prefix)"],
        ['register_openai.js', "const { buildDebugScreenshotPath } = require('./debug-artifacts');", "buildDebugScreenshotPath('注册', prefix)"],
        ['oauth_login.js', "const { buildDebugScreenshotPath } = require('./debug-artifacts');", "buildDebugScreenshotPath('上号', prefix)"],
        ['run_register_debug.js', "const { ensureDebugArtifactDir, buildDebugArtifactPath } = require('./debug-artifacts');", "buildDebugArtifactPath"]
    ];

    for (const [file, requireLine, usageLine] of expectations) {
        const source = readSource(file);
        assert.match(source, new RegExp(requireLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.match(source, new RegExp(usageLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
});
