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

test('fetchLatestOpenAiOtp 排除已尝试过的验证码（数组形式）', async () => {
    let pollCount = 0;
    const messages = [
        // 邮箱里只剩两条邮件：旧码 706949 + 新码 999999
        {
            id: 1,
            address: 'u@x.example',
            subject: 'OpenAI verification code',
            raw: 'Subject: OpenAI verification code\r\n\r\nEnter this temporary verification code to continue: 706949'
        },
        {
            id: 2,
            address: 'u@x.example',
            subject: 'OpenAI verification code',
            raw: 'Subject: OpenAI verification code\r\n\r\nEnter this temporary verification code to continue: 999999'
        }
    ];

    const server = await startServer((req, res) => {
        if (req.url.startsWith('/api/mails')) {
            pollCount += 1;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ results: messages }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });

    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const code = await withMutedConsole(['log'], async () => inboxEmail.fetchLatestOpenAiOtp({
        baseUrl,
        jwt: 'jwt-test',
        address: 'u@x.example',
        maxRetries: 1,
        // 模拟多次失败后重试时传入的数组
        excludeCode: ['706949', '151582']
    }));

    assert.strictEqual(code, '999999', '应跳过两个已尝试过的旧码并返回新码');
    server.close();
});

test('fetchLatestOpenAiOtp 仍兼容 excludeCode 为字符串', async () => {
    const messages = [
        {
            id: 10,
            address: 'u2@x.example',
            subject: 'OpenAI verification code',
            raw: 'Subject: OpenAI verification code\r\n\r\nEnter this temporary verification code to continue: 111111'
        },
        {
            id: 11,
            address: 'u2@x.example',
            subject: 'OpenAI verification code',
            raw: 'Subject: OpenAI verification code\r\n\r\nEnter this temporary verification code to continue: 222222'
        }
    ];

    const server = await startServer((req, res) => {
        if (req.url.startsWith('/api/mails')) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ results: messages }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });

    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const code = await withMutedConsole(['log'], async () => inboxEmail.fetchLatestOpenAiOtp({
        baseUrl,
        jwt: 'jwt-test',
        address: 'u2@x.example',
        maxRetries: 1,
        excludeCode: '111111'
    }));

    assert.strictEqual(code, '222222');
    server.close();
});
