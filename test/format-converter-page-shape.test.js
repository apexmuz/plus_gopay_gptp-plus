const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const htmlSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'format-converter.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('format converter page keeps top-right title, fixed stats row, and wider desktop shell', () => {
    assert.match(
        htmlSource,
        /<div class="top-entry-bar top-entry-bar-between">[\s\S]*返回首页[\s\S]*top-entry-title[\s\S]*格式转换/s,
        'expected top bar to show 返回首页 on the left and 格式转换标题 on the right'
    );

    assert.doesNotMatch(
        htmlSource,
        /本地转换/,
        'expected the local-convert badge text to be removed'
    );

    assert.match(
        cssSource,
        /\.top-entry-title[\s\S]*text-align:\s*right/s,
        'expected a dedicated top-right title style'
    );

    assert.match(
        htmlSource,
        /<div class="convert-toolbar convert-toolbar-inline">[\s\S]*id="convertMode"[\s\S]*id="convertFileTrigger"/s,
        'expected mode select and file button to live in one inline toolbar row'
    );

    assert.match(
        cssSource,
        /#convertFileTrigger[\s\S]*background:\s*var\(--surface\)/s,
        'expected choose-file button to use white surface background'
    );

    assert.match(
        cssSource,
        /#convertFileTrigger[\s\S]*border:\s*1px\s+solid\s+var\(--glass-border\)/s,
        'expected choose-file button to use bordered style'
    );

    assert.match(
        cssSource,
        /#convertMode\s*\{[^}]*width:\s*auto[^}]*min-width:\s*160px[^}]*\}/s,
        'expected the mode select to use a content-fit width instead of stretching too wide'
    );

    assert.match(
        cssSource,
        /\.convert-toolbar-inline\s*\{[^}]*grid-template-columns:\s*auto\s+auto[^}]*justify-content:\s*start[^}]*\}/s,
        'expected the mode select and file import controls to stay left-aligned together after shrinking the select width'
    );

    assert.match(
        cssSource,
        /\.convert-stats\s*\{[\s\S]*flex-wrap:\s*nowrap/s,
        'expected stats area to keep a fixed horizontal layout after file selection'
    );

    assert.match(
        cssSource,
        /\.convert-stat\s*\{[\s\S]*flex:\s*0\s+0\s+auto/s,
        'expected each stat card to keep its default fixed width instead of stretching into stacked rows'
    );

    assert.match(
        cssSource,
        /\.convert-stat\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*justify-content:\s*space-between[^}]*\}/s,
        'expected each stat card label and value to stay on the same row'
    );

    assert.match(
        cssSource,
        /\.glass-container\.is-convert-mode\s*\{[\s\S]*max-width:\s*1456px/s,
        'expected the shared convert container width to expand to about 1.3x on desktop'
    );

    assert.match(
        cssSource,
        /\.converter-page-card\s*\{[\s\S]*max-width:\s*1456px/s,
        'expected converter page shell to expand to about 1.3x its previous desktop width'
    );

    assert.match(
        cssSource,
        /\.convert-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/s,
        'expected input and output panels to use equal-width columns'
    );

    assert.match(
        cssSource,
        /\.convert-textarea\s*\{[^}]*max-width:\s*640px[^}]*\}/s,
        'expected the input textarea to cap at a comfortable fixed width'
    );

    assert.match(
        cssSource,
        /\.convert-output\s*\{[^}]*max-width:\s*640px[^}]*\}/s,
        'expected the output preview to match the same comfortable width'
    );

    assert.match(
        cssSource,
        /\.converter-page-shell\s*\{[^}]*padding:\s*32px\s+1\.8rem[^}]*\}/s,
        'expected the white card to keep 1.8rem side spacing'
    );

    assert.match(
        cssSource,
        /\.converter-page-card\s*\{[^}]*width:\s*min\(1456px,\s*calc\(100vw\s*-\s*3\.6rem\)\)[^}]*\}/s,
        'expected the white card to keep a fixed width independent of content'
    );
});
