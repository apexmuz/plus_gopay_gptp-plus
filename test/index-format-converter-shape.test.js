const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const htmlSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('homepage exposes a top-right standalone format converter entry instead of embedded tab content', () => {
    assert.doesNotMatch(
        htmlSource,
        /data-tab="convert"/,
        'homepage should no longer expose a convert tab'
    );

    assert.doesNotMatch(
        htmlSource,
        /id="convertSection"/,
        'homepage should no longer embed the converter section'
    );

    assert.match(
        htmlSource,
        /class="top-entry-link"[^>]*href="\/format-converter\.html"[^>]*>\s*格式转换\s*<\/a>/,
        'expected a standalone top-right converter entry link'
    );

    assert.match(
        cssSource,
        /\.top-entry-bar[\s\S]*justify-content:\s*flex-end/s,
        'expected a top entry bar aligned to the right'
    );
});
