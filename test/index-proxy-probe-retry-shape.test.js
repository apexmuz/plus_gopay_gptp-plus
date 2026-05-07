const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('checkout 阶段应使用共享代理探测重试 helper，而不是单次 request.get 后直接退出', () => {
    assert.match(source, /probeCheckoutProxy/);
    assert.match(source, /await probeCheckoutProxy\(context\.request/);
});
