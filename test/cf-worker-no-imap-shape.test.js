const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('registration and oauth flows no longer depend on legacy imap service', () => {
  const registerSource = read('register_openai.js');
  const oauthSource = read('oauth_login.js');

  assert.doesNotMatch(
    registerSource,
    /require\('\.\/imap-auth'\)/,
    'register flow should not import legacy imap auth module'
  );
  assert.doesNotMatch(
    oauthSource,
    /require\('\.\/imap-auth'\)/,
    'oauth flow should not import legacy imap auth module'
  );

  assert.doesNotMatch(
    registerSource,
    /imap\.chiyiyi\.cloud\/api\/admin\/all-messages/,
    'register flow should not poll the legacy imap message API'
  );
  assert.doesNotMatch(
    oauthSource,
    /imap\.chiyiyi\.cloud\/api\/admin\/all-messages/,
    'oauth flow should not poll the legacy imap message API'
  );

  assert.match(
    registerSource,
    /inboxEmail\.fetchLatestOpenAiOtp/,
    'register flow should use cf worker inbox api for otp fetch'
  );
  assert.match(
    oauthSource,
    /inboxEmail\.fetchLatestOpenAiOtp/,
    'oauth flow should use cf worker inbox api for otp fetch'
  );
});

test('product and server runtime no longer bootstrap legacy imap service', () => {
  const productSource = read('product_activator.js');
  const serverSource = read('server.js');

  assert.doesNotMatch(
    productSource,
    /require\('\.\/imap-auth'\)/,
    'product activator should not import legacy imap auth module'
  );
  assert.doesNotMatch(
    productSource,
    /IMAP_ADMIN_EMAIL_API/,
    'product activator should not create legacy imap keys'
  );

  assert.doesNotMatch(
    serverSource,
    /require\('\.\/imap-auth'\)/,
    'server should not import legacy imap auth module'
  );
  assert.doesNotMatch(
    serverSource,
    /initializeImapAuth\(/,
    'server startup should not pre-refresh the legacy imap service'
  );
  assert.doesNotMatch(
    serverSource,
    /imap\.chiyiyi\.cloud/,
    'server should not call legacy imap endpoints'
  );
});

test('new config defaults prefer cf worker inbox instead of legacy random/imap receive flow', () => {
  const storeSource = read('mysql-store.js');

  assert.match(
    storeSource,
    /'email_source',\s*'inbox'/,
    'default email_source should now prefer cf worker inbox mode'
  );
});
