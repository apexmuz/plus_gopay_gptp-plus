const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

function read(file) {
    return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('runtime code should only keep inbox and pool email modes', () => {
    const productSource = read('product_activator.js');
    const registerSource = read('register_openai.js');
    const storeSource = read('mysql-store.js');

    assert.doesNotMatch(productSource, /['\"]random['\"]/, 'product activator should not keep random mode branches');
    assert.doesNotMatch(registerSource, /emailSource === 'random'/, 'register flow should not keep a random branch');
    assert.doesNotMatch(storeSource, /\['random',\s*'pool',\s*'inbox'\]/, 'config sanitization should no longer accept random mode');
    assert.doesNotMatch(storeSource, /random_email_domain/, 'store layer should no longer expose random_email_domain config');

    assert.match(productSource, /\['pool',\s*'inbox'\]/, 'product activator should only allow pool/inbox');
    assert.match(registerSource, /const usePoolImap = \(emailSource === 'pool'\) && \(hasOauth \|\| hasPlainPwd\);/, 'register flow should still support pool mode');
});

test('ui and docs should no longer expose random mode or imap.chiyiyi.cloud links', () => {
    const adminHtml = read('public/admin.html');
    const publicIndex = read('public/index.html');
    const readme = read('README.md');
    const envExample = read('.env.example');
    const imapAuth = read('imap-auth.js');

    assert.doesNotMatch(adminHtml, /email_source_random|自定义随机邮箱|random_email_domain/, 'admin UI should remove random mode controls');
    assert.doesNotMatch(adminHtml, /imap\.chiyiyi\.cloud/, 'admin UI should not link to legacy imap.chiyiyi.cloud');
    assert.doesNotMatch(publicIndex, /imap\.chiyiyi\.cloud/, 'public UI should not link to legacy imap.chiyiyi.cloud');
    assert.doesNotMatch(readme, /随机域名|OpenAI 自有随机域名|RANDOM_EMAIL_DOMAIN/, 'README should no longer document random mode');
    assert.doesNotMatch(envExample, /RANDOM_EMAIL_DOMAIN/, '.env.example should no longer expose random mode env');
    assert.doesNotMatch(imapAuth, /imap\.chiyiyi\.cloud/, 'legacy imap-auth helper should be removed or emptied');
});
