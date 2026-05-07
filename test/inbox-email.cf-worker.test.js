const http = require('http');
const assert = require('assert');
const test = require('node:test');

const inboxEmail = require('../inbox-email');
const { withMutedConsole } = require('./helpers/mute-console');

function startServer(handler) {
    return new Promise((resolve) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function requestJson(server, path, { method = 'GET', headers = {}, body = null } = {}) {
    const { port } = server.address();
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });
        req.on('error', reject);
        if (body !== null) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

test('cf worker inbox creates mailbox and fetches otp', async () => {
    const messages = [
        {
            id: 12,
            address: 'abc@test.example',
            subject: 'OpenAI verification code',
            raw: 'Subject: OpenAI verification code\r\n\r\nEnter this temporary verification code to continue: 123456'
        }
    ];

    const server = await startServer((req, res) => {
        if (req.url === '/admin/new_address' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                assert.strictEqual(req.headers['x-admin-auth'], 'admin-pass');
                const parsed = JSON.parse(body || '{}');
                assert.strictEqual(parsed.enablePrefix, true);
                assert.strictEqual(parsed.name.length > 0, true);
                assert.strictEqual(parsed.domain, 'test.example');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    address: 'abc@test.example',
                    jwt: 'mailbox-jwt',
                    address_id: 99
                }));
            });
            return;
        }

        if (req.url.startsWith('/api/mails')) {
            assert.strictEqual(req.headers.authorization, 'Bearer mailbox-jwt');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ results: messages }));
            return;
        }

        if (req.url === '/admin/delete_address/99') {
            res.statusCode = 204;
            res.end();
            return;
        }

        res.statusCode = 404;
        res.end('not found');
    });

    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    inboxEmail.configure({
        baseUrl,
        adminPassword: 'admin-pass',
        domains: ['test.example']
    });

    const created = await inboxEmail.createAddress({ preferredDomain: 'test.example' });
    assert.strictEqual(created.email, 'abc@test.example');
    assert.strictEqual(created.mailboxToken, 'mailbox-jwt');
    assert.strictEqual(created.apiBase, baseUrl);

    const otp = await withMutedConsole(['log'], async () => inboxEmail.fetchLatestOpenAiOtp({
        baseUrl,
        jwt: created.mailboxToken,
        address: created.email,
        maxRetries: 1
    }));
    assert.strictEqual(otp, '123456');

    const deleted = await inboxEmail.deleteMailbox(created.email);
    assert.strictEqual(deleted, true);

    server.close();
});
