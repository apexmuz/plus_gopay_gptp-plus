const assert = require('assert');
const path = require('path');
const test = require('node:test');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

const productModulePath = path.join(__dirname, '..', 'product_activator.js');
const storeModulePath = path.join(__dirname, '..', 'mysql-store.js');
const runtimeLogModulePath = path.join(__dirname, '..', 'runtime-log.js');
const adminCtrlModulePath = path.join(__dirname, '..', 'admin-generation-control.js');
const oauthModulePath = path.join(__dirname, '..', 'oauth_login.js');

let fakePid = 1000;

function createFakeChild(onStart) {
    const child = new EventEmitter();
    child.pid = ++fakePid;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {
        child.killed = true;
    };

    process.nextTick(() => onStart(child));
    return child;
}

async function runScenario(emailSource) {
    const childProcess = require('child_process');
    const originalFork = childProcess.fork;

    const originalProduct = require.cache[require.resolve(productModulePath)];
    const originalStore = require.cache[require.resolve(storeModulePath)];
    const originalRuntimeLog = require.cache[require.resolve(runtimeLogModulePath)];
    const originalAdminCtrl = require.cache[require.resolve(adminCtrlModulePath)];
    const originalOauth = require.cache[require.resolve(oauthModulePath)];

    const captured = {
        reservePoolCalls: [],
        releasedPoolIds: [],
        registerEnv: null,
        oauthEnv: null
    };

    const poolSlot = {
        id: 42,
        email: 'pool-user@example.com',
        password: '',
        clientId: 'pool-client-id',
        refreshToken: 'pool-refresh-token'
    };

    childProcess.fork = (scriptPath, args, options = {}) => {
        const script = path.basename(scriptPath);

        if (script === 'register_openai.js') {
            captured.registerEnv = options.env;
            return createFakeChild((child) => {
                child.emit('message', {
                    type: 'result',
                    result: {
                        email: options.env.EMAIL_SOURCE === 'pool' ? poolSlot.email : 'runtime-user@example.com',
                        accessToken: 'access-token',
                        emailSource: options.env.EMAIL_SOURCE,
                        inboxJwt: options.env.INBOX_JWT || '',
                        inboxApiBase: options.env.INBOX_API_BASE || ''
                    }
                });
                child.emit('close', 0, null);
            });
        }

        if (script === 'index.js') {
            return createFakeChild((child) => {
                child.stdout.write('PAYMENT_SUCCESS\n');
                child.emit('close', 0, null);
            });
        }

        if (script === 'oauth_login.js') {
            captured.oauthEnv = options.env;
            return createFakeChild((child) => {
                child.emit('message', {
                    type: 'result',
                    result: {
                        fileName: 'result.json',
                        filePath: '/tmp/result.json'
                    }
                });
                child.emit('close', 0, null);
            });
        }

        throw new Error(`unexpected fork target: ${script}`);
    };

    require.cache[require.resolve(storeModulePath)] = {
        exports: {
            getRuntimeAssets: async () => ({
                phone: { phone: '15551234567', key: 'sms-key', usage_count: 0 },
                card: { number: '4111111111111111', expiry: '12/30', cvc: '123', usage_count: 0 },
                proxy: ''
            }),
            getActiveProxy: async () => '',
            getAppConfigValue: async (key, fallback = '') => {
                const map = {
                    email_source: emailSource,
                    pool_email_enabled: emailSource === 'pool' ? '1' : '0',
                    inbox_api_base: 'https://mail.example.com',
                    inbox_admin_password: 'admin-secret',
                    inbox_email_domain: 'mail.example.com',
                    inbox_email_domains: 'mail1.example.com\nmail2.example.com',
                    pool_email_imap_host: 'outlook.office365.com',
                    pool_email_include_junk: '1'
                };
                return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback;
            },
            reservePoolEmail: async (ownerKey) => {
                captured.reservePoolCalls.push(ownerKey);
                return emailSource === 'pool' ? { ...poolSlot } : null;
            },
            releasePoolEmailReservation: async (id) => {
                captured.releasedPoolIds.push(id);
            },
            reserveRuntimeAssets: async () => ({
                phoneAssetId: 1,
                cardAssetId: 2,
                phone: { phone: '15551234567', key: 'sms-key', usage_count: 0 },
                card: { number: '4111111111111111', expiry: '12/30', cvc: '123', usage_count: 0 },
                proxy: ''
            }),
            releaseRuntimeAssets: async () => { },
            upsertPendingProduct: async () => { },
            markProductReadyByEmail: async () => { },
            incrementAssetSuccessCount: async () => { },
            deletePhoneAsset: async () => { }
        }
    };
    require.cache[require.resolve(runtimeLogModulePath)] = { exports: { push() { } } };
    require.cache[require.resolve(adminCtrlModulePath)] = {
        exports: {
            sleep: async () => { },
            sleepWithStop: async () => true
        }
    };
    require.cache[require.resolve(oauthModulePath)] = { exports: { runFullProtocolFlow: async () => ({}) } };
    delete require.cache[require.resolve(productModulePath)];

    try {
        const { startProductCreation } = require(productModulePath);
        const result = await startProductCreation('CDK-TEST', () => { }, { singleRun: true, jobKey: 'job-email-source-test' });
        assert.strictEqual(result.success, true, 'expected product flow to finish successfully in stubbed scenario');
        return captured;
    } finally {
        childProcess.fork = originalFork;
        delete require.cache[require.resolve(productModulePath)];

        if (originalProduct) require.cache[require.resolve(productModulePath)] = originalProduct;
        else delete require.cache[require.resolve(productModulePath)];

        if (originalStore) require.cache[require.resolve(storeModulePath)] = originalStore;
        else delete require.cache[require.resolve(storeModulePath)];

        if (originalRuntimeLog) require.cache[require.resolve(runtimeLogModulePath)] = originalRuntimeLog;
        else delete require.cache[require.resolve(runtimeLogModulePath)];

        if (originalAdminCtrl) require.cache[require.resolve(adminCtrlModulePath)] = originalAdminCtrl;
        else delete require.cache[require.resolve(adminCtrlModulePath)];

        if (originalOauth) require.cache[require.resolve(oauthModulePath)] = originalOauth;
        else delete require.cache[require.resolve(oauthModulePath)];
    }
}

test('startProductCreation 在 inbox 模式下应把 worker 凭证透传给注册与协议子进程', async () => {
    const captured = await runScenario('inbox');

    assert.strictEqual(captured.reservePoolCalls.length, 0, 'inbox 模式不应预留邮箱池');
    assert.strictEqual(captured.registerEnv?.EMAIL_SOURCE, 'inbox');
    assert.strictEqual(captured.oauthEnv?.EMAIL_SOURCE, 'inbox');
    assert.strictEqual(captured.registerEnv?.INBOX_API_BASE, 'https://mail.example.com');
    assert.strictEqual(captured.oauthEnv?.INBOX_API_BASE, 'https://mail.example.com');
});

test('startProductCreation 在 pool 模式下应预留邮箱池，并把 pool 凭证继续透传给协议子进程', async () => {
    const captured = await runScenario('pool');

    assert.strictEqual(captured.reservePoolCalls.length, 1, 'pool 模式应先预留一个邮箱池邮箱');
    assert.strictEqual(captured.registerEnv?.EMAIL_SOURCE, 'pool');
    assert.strictEqual(captured.registerEnv?.POOL_EMAIL, 'pool-user@example.com');
    assert.strictEqual(captured.registerEnv?.POOL_EMAIL_CLIENT_ID, 'pool-client-id');
    assert.strictEqual(captured.registerEnv?.POOL_EMAIL_REFRESH_TOKEN, 'pool-refresh-token');

    assert.strictEqual(captured.oauthEnv?.EMAIL_SOURCE, 'pool');
    assert.strictEqual(captured.oauthEnv?.POOL_EMAIL, 'pool-user@example.com', '协议阶段也应使用同一个 pool 邮箱取 OTP');
    assert.strictEqual(captured.oauthEnv?.POOL_EMAIL_CLIENT_ID, 'pool-client-id');
    assert.strictEqual(captured.oauthEnv?.POOL_EMAIL_REFRESH_TOKEN, 'pool-refresh-token');
});

test('startProductCreation 遇到已删除的 random 配置时应回退到 inbox，而不是继续保留 random 分支', async () => {
    const captured = await runScenario('random');

    assert.strictEqual(captured.reservePoolCalls.length, 0, 'random 已删除，不应再走邮箱池预留');
    assert.strictEqual(captured.registerEnv?.EMAIL_SOURCE, 'inbox');
    assert.strictEqual(captured.oauthEnv?.EMAIL_SOURCE, 'inbox');
    assert.strictEqual(captured.registerEnv?.INBOX_API_BASE, 'https://mail.example.com');
    assert.strictEqual(captured.oauthEnv?.INBOX_API_BASE, 'https://mail.example.com');
});
