const assert = require('assert');
const test = require('node:test');
const http = require('http');
const inboxEmail = require('../inbox-email');
const { withMutedConsole } = require('./helpers/mute-console');

const REAL_OPENAI_RAW = `Received: from v5102.v5375b7fa.use4.send.mailgun.net (159.112.244.102)\r
\tby cloudflare-email.net (cloudflare) id 5T5arIXeEl8H\r
\tfor <u5k7x5ts0@lovelymira.com>; Thu, 07 May 2026 03:46:09 +0000\r
DKIM-Signature: a=rsa-sha256; v=1; c=relaxed/relaxed; d=tm1.openai.com; q=dns/txt; s=pdk1; t=1778125569; x=1778132769;\r
X-Mailgun-Sending-Ip-Pool: 682375dbe1a722357625a2dd\r
Message-Id: <20260507034609.7635683216bfe013@tm1.openai.com>\r
From: OpenAI <otp@tm1.openai.com>\r
To: u5k7x5ts0@lovelymira.com\r
Subject: Your temporary ChatGPT verification code\r
Content-Transfer-Encoding: quoted-printable\r
Content-Type: text/html; charset="utf-8"\r
\r
<html><body><p>Enter this temporary verification code to continue: 427086</p>\r
<p>Please ignore this email if this wasn=E2=80=99t you trying to create a ChatG=\r
PT account.</p></body></html>`;

const REAL_OPENAI_RAW_JA = `Received: from o14.ptr1360.openai.com (159.183.120.121)\r
\tby cloudflare-email.net (cloudflare) id UeXFN86HWnQe\r
\tfor <u8u01j18g@lovelymira.com>; Thu, 07 May 2026 07:33:47 +0000\r
From: OpenAI <otp@tm.openai.com>\r
To: u8u01j18g@lovelymira.com\r
Subject: ChatGPT =?UTF-8?B?44Gu5LiA5pmC55qE44Gq6KqN6Ki844Kz44O844OJ?=\r
Content-Transfer-Encoding: quoted-printable\r
Content-Type: text/html; charset=utf-8\r
\r
<html><body><p>ChatGPT =E3=81=AE=E4=B8=80=E6=99=82=E7=9A=84=E3=81=AA=E8=AA=8D=\r
=E8=A8=BC=E3=82=B3=E3=83=BC=E3=83=89</p><p>=E3=81=93=E3=81=AE=E4=B8=80=E6=99=82=\r
=E6=A4=9C=E8=A8=BC=E3=82=B3=E3=83=BC=E3=83=89=E3=82=92=E5=85=A5=E5=8A=9B=E3=81=\r
=97=E3=81=A6=E7=B6=9A=E8=A1=8C=E3=81=97=E3=81=A6=E3=81=8F=E3=81=A0=E3=81=95=E3=\r
=81=84: 059907</p><p>ChatGPT =E3=82=A2=E3=82=AB=E3=82=A6=E3=83=B3=E3=83=88=E3=82=\r
=92=E4=BD=9C=E6=88=90=E3=81=97=E3=82=88=E3=81=86=E3=81=A8=E3=81=97=E3=81=A6=E3=\r
=81=84=E3=81=AA=E3=81=84=E5=A0=B4=E5=90=88=E3=81=AF=E3=80=81=E3=81=93=E3=81=AE=\r
=E3=83=A1=E3=83=BC=E3=83=AB=E3=81=AF=E7=84=A1=E8=A6=96=E3=81=97=E3=81=A6=E3=81=\r
=8F=E3=81=A0=E3=81=95=E3=81=84=E3=80=82</p></body></html>`;

function startServer(handler) {
    return new Promise((resolve) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

test('真实 OpenAI 邮件 raw header 含 mailgun pool id 时，必须取正文里的 OTP（427086）而不是 header 中的 6 位 hex 前缀（682375）', async () => {
    const messages = [{
        id: 1,
        address: 'u5k7x5ts0@lovelymira.com',
        subject: 'Your temporary ChatGPT verification code',
        raw: REAL_OPENAI_RAW
    }];

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
        address: 'u5k7x5ts0@lovelymira.com',
        maxRetries: 1
    }));
    assert.strictEqual(code, '427086', '应忽略 header 中 X-Mailgun pool id 的 6 位 hex 前缀，从可见正文取真实 OTP');
    server.close();
});

test('地址不匹配的邮件不能被错认为本邮箱的验证码', async () => {
    const messages = [{
        id: 7,
        address: 'someoneelse@lovelymira.com',
        subject: 'Your temporary ChatGPT verification code',
        raw: 'Subject: x\r\n\r\nEnter this temporary verification code to continue: 999999'
    }];

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
    let timedOut = false;
    try {
        await withMutedConsole(['log'], async () => inboxEmail.fetchLatestOpenAiOtp({
            baseUrl,
            jwt: 'jwt-test',
            address: 'me@lovelymira.com',
            maxRetries: 1
        }));
    } catch (e) {
        timedOut = /获取验证码超时/.test(e.message);
    }
    assert.ok(timedOut, '当邮件 address 不是本邮箱时不能取它的验证码');
    server.close();
});

test('真实 OpenAI 日文邮件模板也必须能提取 OTP（059907）', async () => {
    const messages = [{
        id: 8,
        address: 'u8u01j18g@lovelymira.com',
        subject: 'ChatGPT の一時的な認証コード',
        raw: REAL_OPENAI_RAW_JA
    }];

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
        address: 'u8u01j18g@lovelymira.com',
        maxRetries: 1
    }));
    assert.strictEqual(code, '059907');
    server.close();
});
