const assert = require('assert');
const test = require('node:test');

function b64urlJson(value) {
    return Buffer.from(JSON.stringify(value))
        .toString('base64url');
}

function buildJwt(payload) {
    return `${b64urlJson({ alg: 'RS256', typ: 'JWT', kid: 'test' })}.${b64urlJson(payload)}.sig`;
}

function decodePayload(token) {
    const payload = String(token || '').split('.')[1] || '';
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

const converter = require('../public/format-converter.js');

function createElement(initial = {}) {
    const listeners = new Map();
    return {
        value: initial.value || '',
        textContent: initial.textContent || '',
        disabled: Boolean(initial.disabled),
        dataset: initial.dataset || {},
        files: initial.files || [],
        addEventListener(type, handler) {
            listeners.set(type, handler);
        },
        dispatch(type) {
            const handler = listeners.get(type);
            if (handler) handler({ type, target: this });
        }
    };
}

test('normalizeRecordsFromText parses CPA JSON and backfills id_token account claims', () => {
    const accessToken = buildJwt({
        exp: 1770000000,
        'https://api.openai.com/auth': {
            chatgpt_account_id: 'acct_alpha',
            chatgpt_user_id: 'user_alpha',
            organization_id: 'org_alpha',
            chatgpt_plan_type: 'plus'
        },
        'https://api.openai.com/profile': {
            email: 'alpha@example.com'
        }
    });
    const idToken = buildJwt({
        iss: 'https://auth.openai.com',
        sub: 'user_alpha',
        email: 'alpha@example.com'
    });

    const input = JSON.stringify({
        type: 'codex',
        email: 'alpha@example.com',
        account_id: 'acct_alpha',
        access_token: accessToken,
        refresh_token: 'refresh_alpha',
        id_token: idToken
    });

    const parsed = converter.normalizeRecordsFromText(input);
    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.pending, 1);
    assert.equal(parsed.records[0].chatgpt_account_id, 'acct_alpha');
    assert.equal(parsed.records[0].chatgpt_user_id, 'user_alpha');

    const patchedIdPayload = decodePayload(parsed.records[0].id_token);
    const patchedAuth = patchedIdPayload['https://api.openai.com/auth'];
    assert.equal(patchedAuth.chatgpt_account_id, 'acct_alpha');
    assert.equal(patchedAuth.account_id, 'acct_alpha');
    assert.equal(patchedAuth.chatgpt_user_id, 'user_alpha');
});

test('normalizeRecordsFromText supports codex JSONL and sub2api bundle JSON inputs', () => {
    const accessOne = buildJwt({
        exp: 1770000000,
        'https://api.openai.com/auth': {
            chatgpt_account_id: 'acct_one',
            chatgpt_user_id: 'user_one'
        },
        'https://api.openai.com/profile': {
            email: 'one@example.com'
        }
    });
    const accessTwo = buildJwt({
        exp: 1770000100,
        'https://api.openai.com/auth': {
            chatgpt_account_id: 'acct_two',
            chatgpt_user_id: 'user_two',
            organization_id: 'org_two'
        },
        'https://api.openai.com/profile': {
            email: 'two@example.com'
        }
    });
    const idOne = buildJwt({ iss: 'https://auth.openai.com', sub: 'user_one', email: 'one@example.com' });
    const idTwo = buildJwt({ iss: 'https://auth.openai.com', sub: 'user_two', email: 'two@example.com' });

    const codexJsonl = [
        JSON.stringify({
            email: 'one@example.com',
            chatgpt_account_id: 'acct_one',
            tokens: {
                access_token: accessOne,
                refresh_token: 'refresh_one',
                id_token: idOne
            }
        }),
        JSON.stringify({
            email: 'two@example.com',
            access_token: accessTwo,
            refresh_token: 'refresh_two',
            id_token: idTwo,
            account_id: 'acct_two'
        })
    ].join('\n');

    const parsedJsonl = converter.normalizeRecordsFromText(codexJsonl);
    assert.equal(parsedJsonl.shape, 'Codex JSONL');
    assert.equal(parsedJsonl.records.length, 2);
    assert.deepEqual(
        parsedJsonl.records.map((item) => item.email),
        ['one@example.com', 'two@example.com']
    );

    const subBundle = {
        exported_at: '2026-05-08T00:00:00.000Z',
        proxies: [],
        accounts: [{
            name: 'two@example.com',
            platform: 'openai',
            type: 'oauth',
            credentials: {
                access_token: accessTwo,
                refresh_token: 'refresh_two',
                id_token: idTwo,
                chatgpt_account_id: 'acct_two',
                chatgpt_user_id: 'user_two',
                client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
                organization_id: 'org_two',
                plan_type: 'plus'
            },
            extra: {
                email: 'two@example.com'
            }
        }]
    };

    const parsedBundle = converter.normalizeRecordsFromText(JSON.stringify(subBundle));
    assert.equal(parsedBundle.shape, 'SUB bundle JSON');
    assert.equal(parsedBundle.records.length, 1);
    assert.equal(parsedBundle.records[0].email, 'two@example.com');
    assert.equal(parsedBundle.records[0].organization_id, 'org_two');
});

test('buildOutput creates sub2api bundle JSON and CPA tar preview from normalized records', () => {
    const alphaAccess = buildJwt({
        exp: 1770000000,
        'https://api.openai.com/auth': {
            chatgpt_account_id: 'acct_alpha',
            chatgpt_user_id: 'user_alpha',
            organization_id: 'org_alpha',
            chatgpt_plan_type: 'plus'
        },
        'https://api.openai.com/profile': {
            email: 'alpha@example.com'
        }
    });
    const betaAccess = buildJwt({
        exp: 1770000200,
        'https://api.openai.com/auth': {
            chatgpt_account_id: 'acct_beta',
            chatgpt_user_id: 'user_beta',
            organization_id: 'org_beta',
            chatgpt_plan_type: 'plus'
        },
        'https://api.openai.com/profile': {
            email: 'beta@example.com'
        }
    });
    const alphaId = buildJwt({ iss: 'https://auth.openai.com', sub: 'user_alpha', email: 'alpha@example.com' });
    const betaId = buildJwt({ iss: 'https://auth.openai.com', sub: 'user_beta', email: 'beta@example.com' });

    const alpha = converter.normalizeRecordsFromText(JSON.stringify({
        email: 'alpha@example.com',
        account_id: 'acct_alpha',
        access_token: alphaAccess,
        refresh_token: 'refresh_alpha',
        id_token: alphaId
    })).records[0];
    const beta = converter.normalizeRecordsFromText(JSON.stringify({
        email: 'beta@example.com',
        account_id: 'acct_beta',
        access_token: betaAccess,
        refresh_token: 'refresh_beta',
        id_token: betaId
    })).records[0];

    const subResult = converter.buildOutput([alpha], 'to-sub');
    const subPayload = JSON.parse(subResult.text);
    assert.equal(subResult.mime, 'application/json;charset=utf-8');
    assert.equal(subPayload.accounts.length, 1);
    assert.equal(subPayload.accounts[0].name, 'alpha@example.com');
    assert.equal(subPayload.accounts[0].credentials.chatgpt_account_id, 'acct_alpha');
    assert.equal(subPayload.accounts[0].extra.privacy_mode, 'training_off');

    const cpaResult = converter.buildOutput([alpha, beta], 'to-cpa');
    assert.equal(cpaResult.mime, 'application/x-tar');
    assert.match(cpaResult.name, /^2_\d{8}_\d{6}\.tar$/);
    assert.ok(cpaResult.parts[0] instanceof Uint8Array);
    assert.match(cpaResult.text, /alpha@example\.com\.json/);
    assert.match(cpaResult.text, /beta@example\.com\.json/);
});

test('format converter only renders output after clicking the run button', () => {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const originalNavigator = global.navigator;

    const elements = {
        input: createElement(),
        mode: createElement({ value: 'to-cpa' }),
        file: createElement(),
        run: createElement(),
        clear: createElement(),
        copy: createElement({ disabled: true }),
        download: createElement({ disabled: true }),
        detect: createElement(),
        count: createElement(),
        backfill: createElement(),
        error: createElement(),
        output: createElement(),
        meta: createElement(),
        summary: createElement()
    };

    const payload = {
        type: 'codex',
        email: 'delta@example.com',
        account_id: 'acct_delta',
        access_token: buildJwt({
            exp: 1770000000,
            'https://api.openai.com/auth': {
                chatgpt_account_id: 'acct_delta',
                chatgpt_user_id: 'user_delta'
            },
            'https://api.openai.com/profile': {
                email: 'delta@example.com'
            }
        }),
        refresh_token: 'refresh_delta',
        id_token: buildJwt({ iss: 'https://auth.openai.com', sub: 'user_delta', email: 'delta@example.com' })
    };

    global.document = {
        getElementById(id) {
            return elements[{
                convertInput: 'input',
                convertMode: 'mode',
                convertFile: 'file',
                convertRunBtn: 'run',
                convertClearBtn: 'clear',
                convertCopyBtn: 'copy',
                convertDownloadBtn: 'download',
                convertDetect: 'detect',
                convertCount: 'count',
                convertBackfill: 'backfill',
                convertError: 'error',
                convertOutput: 'output',
                convertMeta: 'meta',
                convertSummary: 'summary'
            }[id]] || null;
        },
        body: {
            appendChild() {},
            removeChild() {}
        },
        createElement() {
            return createElement();
        }
    };
    global.window = { isSecureContext: false };
    global.navigator = {};

    try {
        converter.initFormatConverter();
        elements.input.value = JSON.stringify(payload);
        elements.input.dispatch('input');
        assert.equal(elements.output.textContent, '', 'output should stay empty until the run button is clicked');

        elements.mode.value = 'to-sub';
        elements.mode.dispatch('change');
        assert.equal(elements.output.textContent, '', 'changing mode alone should not render a preview');

        elements.run.dispatch('click');
        assert.match(elements.output.textContent, /delta@example\.com/);
    } finally {
        global.document = originalDocument;
        global.window = originalWindow;
        global.navigator = originalNavigator;
    }
});
