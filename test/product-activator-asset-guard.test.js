const assert = require('assert');
const path = require('path');
const test = require('node:test');

const productModulePath = path.join(__dirname, '..', 'product_activator.js');
const storeModulePath = path.join(__dirname, '..', 'mysql-store.js');
const runtimeLogModulePath = path.join(__dirname, '..', 'runtime-log.js');
const adminCtrlModulePath = path.join(__dirname, '..', 'admin-generation-control.js');
const oauthModulePath = path.join(__dirname, '..', 'oauth_login.js');

test('startProductCreation 在缺少手机号资产时应直接失败，且不应继续触发注册子进程', async () => {
    const childProcess = require('child_process');
    const originalFork = childProcess.fork;
    const touched = { forkCalled: false };

    const originalProduct = require.cache[require.resolve(productModulePath)];
    const originalStore = require.cache[require.resolve(storeModulePath)];
    const originalRuntimeLog = require.cache[require.resolve(runtimeLogModulePath)];
    const originalAdminCtrl = require.cache[require.resolve(adminCtrlModulePath)];
    const originalOauth = require.cache[require.resolve(oauthModulePath)];

    childProcess.fork = () => {
        touched.forkCalled = true;
        throw new Error('unexpected fork');
    };

    require.cache[require.resolve(storeModulePath)] = {
        exports: {
            getAppConfigValue: async () => '',
            getRuntimeAssets: async () => ({
                phone: { phone: '未配置', key: '', usage_count: 0 },
                card: { number: '4111111111111111', expiry: '12/30', cvc: '123', usage_count: 0 },
                proxy: ''
            })
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
        await assert.rejects(
            () => startProductCreation('CDK-TEST', () => { }),
            /系统未配置可用手机号资产/
        );
        assert.strictEqual(touched.forkCalled, false, '缺少手机号资产时不应继续 fork 注册子进程');
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
});
