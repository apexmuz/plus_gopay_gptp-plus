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

test('folder=inbox 返回空列表时，仍应回退到无 folder 查询以拿到真实 OTP', async () => {
    const targetEmail = 'u-folder@test.example';
    const server = await startServer((req, res) => {
        if (req.url.startsWith('/api/mails?')) {
            const url = new URL(req.url, 'http://127.0.0.1');
            const folder = url.searchParams.get('folder') || '';
            res.setHeader('Content-Type', 'application/json');

            if (folder === 'inbox') {
                res.end(JSON.stringify({ results: [], count: 0 }));
                return;
            }

            if (!folder) {
                res.end(JSON.stringify({
                    results: [{
                        id: 101,
                        address: targetEmail,
                        subject: 'Your temporary ChatGPT verification code',
                        raw: 'Subject: OTP\r\n\r\nEnter this temporary verification code to continue: 427086'
                    }],
                    count: 1
                }));
                return;
            }

            res.end(JSON.stringify({ results: [], count: 0 }));
            return;
        }

        res.statusCode = 404;
        res.end('not found');
    });

    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const code = await withMutedConsole(['log'], async () => inboxEmail.fetchLatestOpenAiOtp({
        baseUrl,
        jwt: 'jwt-test',
        address: targetEmail,
        maxRetries: 1
    }));

    assert.strictEqual(code, '427086');
    server.close();
});
