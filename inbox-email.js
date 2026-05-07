const { normalizeExcludedCodes, isCodeExcluded } = require('./otp-code-utils');

const DEFAULT_API_BASE = 'https://temp-email-api.jzqkwl.com';
const DEFAULT_POLL_INTERVAL_SECONDS = 3;
const MAILBOX_QUERY_LIMIT = 30;
const MAILBOX_FOLDER_CANDIDATES = ['inbox', 'junk', 'spam', 'junkemail'];

let _config = {
    baseUrl: '',
    adminPassword: '',
    domains: []
};

let _credentials = new Map();

function trimBaseUrl(raw) {
    return String(raw || DEFAULT_API_BASE).trim().replace(/\/+$/, '') || DEFAULT_API_BASE;
}

function normalizeDomain(raw) {
    return String(raw || '').trim().replace(/^https?:\/\//i, '').replace(/^@/, '').replace(/\/+$/, '').toLowerCase();
}

function parseDomainsText(domainsText) {
    return String(domainsText || '')
        .replace(/,/g, '\n')
        .split(/\r?\n/)
        .map((item) => normalizeDomain(item))
        .filter(Boolean);
}

function configure({ baseUrl = '', adminPassword = '', domains = [] } = {}) {
    _config = {
        baseUrl: trimBaseUrl(baseUrl || DEFAULT_API_BASE),
        adminPassword: String(adminPassword || '').trim(),
        domains: Array.isArray(domains) ? domains.map((d) => normalizeDomain(d)).filter(Boolean) : parseDomainsText(domains)
    };
}

function _effectiveConfig() {
    return _config;
}

function _chooseDomain(preferredDomain = '') {
    const preferred = normalizeDomain(preferredDomain);
    if (preferred) {
        return preferred;
    }
    const domains = _effectiveConfig().domains || [];
    if (!domains.length) {
        return '';
    }
    return domains[Math.floor(Math.random() * domains.length)];
}

function _registerCredentials(email, payload) {
    _credentials.set(String(email || '').trim().toLowerCase(), {
        email: String(email || '').trim().toLowerCase(),
        mailboxToken: String(payload.mailboxToken || ''),
        apiBase: trimBaseUrl(payload.apiBase || ''),
        addressId: payload.addressId ?? null,
        domain: normalizeDomain(payload.domain || '')
    });
}

async function _requestJson(url, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    try {
        const res = await fetch(url, {
            method,
            headers,
            body,
            signal: controller.signal
        });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (_) {
            data = text;
        }
        return { status: res.status, data };
    } finally {
        clearTimeout(timer);
    }
}

function _adminHeaders(adminPasswordOverride = '') {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    const adminPassword = String(adminPasswordOverride || _effectiveConfig().adminPassword || '').trim();
    if (adminPassword) {
        headers['x-admin-auth'] = adminPassword;
    }
    return headers;
}

function _mailHeaders(mailboxToken) {
    return {
        Accept: 'application/json',
        Authorization: `Bearer ${mailboxToken}`
    };
}

// 把 quoted-printable 编码 (=XX / =\r\n) 还原成普通文本，并去掉 HTML 标签。
// 验证码邮件原 raw 里 header 包含 X-Mailgun-Sending-Ip-Pool / Message-Id 等带连续数字的串，
// 必须先剥到"渲染后正文"再做 OTP 匹配，否则 6 位数字 fallback 会误抓 mailgun pool id。
function _stripEmailToVisibleText(input) {
    let text = String(input || '');
    if (!text) return '';

    // 1) 切到 body：第一个空行之后才是 body；找不到就保持原文（小心别在 header 里乱抓）
    const bodyStart = text.indexOf('\r\n\r\n');
    const body = bodyStart >= 0 ? text.slice(bodyStart + 4) : text;

    // 2) quoted-printable 解码：=XX 还原成对应字符；=\r\n / =\n 是软换行直接删
    const joined = body.replace(/=\r?\n/g, '');
    const bytes = [];
    for (let i = 0; i < joined.length; i += 1) {
        const ch = joined[i];
        if (ch === '=' && /[0-9A-Fa-f]{2}/.test(joined.slice(i + 1, i + 3))) {
            try {
                bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
            } catch (_) {
                // ignore malformed quoted-printable bytes
            }
            i += 2;
            continue;
        }
        bytes.push(joined.charCodeAt(i));
    }
    let decoded = Buffer.from(bytes).toString('utf8');

    // 3) 去 HTML 标签 + 折叠空白
    decoded = decoded
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&#(\d+);/g, (_, n) => {
            try { return String.fromCharCode(Number(n)); } catch (_) { return ''; }
        })
        .replace(/\s+/g, ' ')
        .trim();

    return decoded;
}

function _extractOtpCode(content) {
    const text = String(content || '');
    if (!text) return '';
    // 显式带"verification code/code is/use code"等上下文的 OTP 匹配
    // 不再使用全文 6 位数字 fallback：邮件 header / mailgun id / message-id 里都有 6 位连续数字段，
    // 兜底只会抓错。OpenAI 邮件正文里 OTP 一定在以下文案附近出现。
    const patterns = [
        /temporary verification code to continue:?\s*(\d{6})\b/i,
        /OpenAI verification code[^0-9]{0,30}(\d{6})\b/i,
        /verification code[^0-9]{0,30}(\d{6})\b/i,
        /verify your email[^0-9]{0,30}(\d{6})\b/i,
        /Use code[^0-9]{0,10}(\d{6})\b/i,
        /Your ChatGPT code is\s*(\d{6})\b/i,
        /ChatGPT code is\s*(\d{6})\b/i,
        // 中文邮件兜底（部分账号会触发本地化模板）
        /验证码[^0-9]{0,10}(\d{6})\b/,
        // 日文模板：この一時検証コードを入力して続行してください: 123456
        /一時(?:検証|認証)コード[^0-9]{0,20}(\d{6})\b/,
        /Code[:\s]+(\d{6})\b/i
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1];
    }
    return '';
}

function _collectMessageTextParts(value, parts = [], depth = 0) {
    if (value == null || value === '' || depth > 4) return parts;
    if (Array.isArray(value)) {
        for (const item of value) _collectMessageTextParts(item, parts, depth + 1);
        return parts;
    }
    if (typeof value === 'object') {
        const preferredKeys = [
            'verification_code', 'verificationCode', 'otp', 'otp_code', 'otpCode', 'code',
            'subject', 'text', 'plain', 'plain_text', 'plainText', 'body', 'body_text',
            'bodyText', 'body_html', 'bodyHtml', 'html', 'snippet', 'preview', 'raw',
            'content', 'value', 'address', 'folder', 'mailbox'
        ];
        const seen = new Set();
        for (const key of preferredKeys) {
            if (key in value) {
                seen.add(key);
                _collectMessageTextParts(value[key], parts, depth + 1);
            }
        }
        for (const [key, item] of Object.entries(value)) {
            if (seen.has(key)) continue;
            _collectMessageTextParts(item, parts, depth + 1);
        }
        return parts;
    }
    const text = String(value || '').trim();
    if (text) parts.push(text);
    return parts;
}

function _extractOtpCodeFromMessage(message) {
    const payload = { ...(message || {}) };

    // 1) 显式字段最优先（CF Worker 后端如果直接给出结构化字段就用它）
    for (const key of ['verification_code', 'verificationCode', 'otp', 'otp_code', 'otpCode', 'code']) {
        const candidate = String(payload[key] || '').trim();
        if (/^\d{6}$/.test(candidate)) return candidate;
    }

    // 2) 优先在"可见正文"里搜：raw 邮件 → 切 body → 解 QP → 剥 HTML → 折空白
    const rawText = String(payload.raw || payload.body || payload.body_html || payload.html || '');
    if (rawText) {
        const visible = _stripEmailToVisibleText(rawText);
        const codeFromVisible = _extractOtpCode(visible);
        if (codeFromVisible) return codeFromVisible;
    }

    // 3) 如果后端只给 plain/text/snippet 等纯文本字段，直接尝试匹配
    for (const key of ['text', 'plain', 'plain_text', 'plainText', 'body_text', 'bodyText', 'snippet', 'preview']) {
        const candidate = String(payload[key] || '').trim();
        if (candidate) {
            const c = _extractOtpCode(candidate);
            if (c) return c;
        }
    }

    // 4) 最后只在 subject 里再找一次（subject 也可能带 "Code: 123456" 类型）
    const subject = String(payload.subject || '');
    if (subject) {
        const c = _extractOtpCode(subject);
        if (c) return c;
    }

    return '';
}

async function createAddress({ baseUrl, adminPassword = '', name = '', domain = '', enablePrefix = true, preferredDomain = '' } = {}) {
    const apiBase = trimBaseUrl(baseUrl || _effectiveConfig().baseUrl || DEFAULT_API_BASE);
    const chosenDomain = normalizeDomain(domain || preferredDomain || _chooseDomain());
    const effectiveAdminPassword = String(adminPassword || _effectiveConfig().adminPassword || '').trim();
    if (!apiBase) throw new Error('CF Worker 地址未配置');
    if (!effectiveAdminPassword) throw new Error('CF Worker 管理员密码未配置');
    if (!chosenDomain) throw new Error('CF Worker 域名未配置');

    const payload = {
        enablePrefix: Boolean(enablePrefix),
        name: String(name || '').trim() || `u${Math.random().toString(36).slice(2, 10)}`,
        domain: chosenDomain
    };

    const { status, data } = await _requestJson(`${apiBase}/admin/new_address`, {
        method: 'POST',
        headers: _adminHeaders(effectiveAdminPassword),
        body: JSON.stringify(payload),
        timeoutMs: 15000
    });

    if (status !== 200 || !data || typeof data !== 'object' || !data.address || !data.jwt) {
        const err = typeof data === 'string' ? data : JSON.stringify(data || {});
        throw new Error(`创建临时邮箱失败: HTTP ${status} body=${err}`);
    }

    const email = String(data.address).toLowerCase();
    const mailboxToken = String(data.jwt);
    _registerCredentials(email, {
        mailboxToken,
        apiBase,
        addressId: data.address_id,
        domain: chosenDomain
    });

    return {
        email,
        address: email,
        mailboxToken,
        jwt: mailboxToken,
        apiBase,
        address_id: data.address_id,
        addressId: data.address_id,
        domain: chosenDomain
    };
}

async function verifyMailboxReady(email, { baseUrl = '', jwt = '', proxies = null } = {}) {
    const creds = _credentials.get(String(email || '').trim().toLowerCase()) || {};
    const apiBase = trimBaseUrl(baseUrl || creds.apiBase || _effectiveConfig().baseUrl || DEFAULT_API_BASE);
    const mailboxToken = String(jwt || creds.mailboxToken || '').trim();
    if (!apiBase || !mailboxToken) return false;
    const { status } = await _requestJson(`${apiBase}/api/mails?limit=1&offset=0`, {
        method: 'GET',
        headers: _mailHeaders(mailboxToken),
        timeoutMs: 15000
    });
    return status === 200;
}

async function _fetchMailPage(apiBase, mailboxToken, folder = '') {
    const params = new URLSearchParams({ limit: String(MAILBOX_QUERY_LIMIT), offset: '0' });
    if (folder) params.set('folder', folder);
    const { status, data } = await _requestJson(`${apiBase}/api/mails?${params.toString()}`, {
        method: 'GET',
        headers: _mailHeaders(mailboxToken),
        timeoutMs: 15000
    });
    if (status !== 200) {
        return { ok: false, statusCode: status, messages: [] };
    }
    return { ok: true, statusCode: status, messages: Array.isArray(data?.results) ? data.results : [] };
}

function _extractCodeFromMessages(messages, email, seenIds, excludedSet = null) {
    for (const message of messages || []) {
        if (!message || typeof message !== 'object') continue;
        let messageId = String(message.id || message.createdAt || '').trim();
        if (!messageId) {
            messageId = JSON.stringify(message);
        }
        if (seenIds.has(messageId)) continue;
        seenIds.add(messageId);
        const recipient = String(message.address || '').trim().toLowerCase();
        if (recipient && recipient !== String(email || '').trim().toLowerCase()) {
            continue;
        }
        const code = _extractOtpCodeFromMessage(message);
        if (code && (!excludedSet || !isCodeExcluded(code, excludedSet))) return code;
    }
    return '';
}

async function fetchLatestOpenAiOtp({
    baseUrl,
    jwt,
    address = '',
    maxRetries = 24,
    excludeCode = '',
    onNoNewCodeFor30Seconds = null,
    onBeforePoll = null
} = {}) {
    if (!jwt) throw new Error('缺少邮箱 JWT，无法拉取邮件');
    const apiBase = trimBaseUrl(baseUrl || _effectiveConfig().baseUrl || DEFAULT_API_BASE);
    const mailboxToken = String(jwt || '').trim();
    const seenIds = new Set();
    let lastResendAt = 0;
    const excludedSet = normalizeExcludedCodes(excludeCode);

    console.log(`📨 [Inbox] 正在为 ${address || '(未知地址)'} 通过 ${apiBase} 获取验证码...`);

    for (let i = 0; i < maxRetries; i += 1) {
        if (i === 0 || (i + 1) % 5 === 0 || i + 1 === maxRetries) {
            console.log(`📨 [Inbox] 轮询中 ${i + 1}/${maxRetries}...`);
        }
        if (onBeforePoll) {
            const recovered = await onBeforePoll(i + 1);
            if (recovered) {
                console.log('📨 [Inbox] 页面已恢复，继续等待新验证码...');
            }
        }

        try {
            let inboxPage = await _fetchMailPage(apiBase, mailboxToken, 'inbox');
            if (inboxPage.ok) {
                let code = _extractCodeFromMessages(inboxPage.messages, address, seenIds, excludedSet);
                if (code) return code;
                for (const folder of MAILBOX_FOLDER_CANDIDATES.slice(1)) {
                    const folderPage = await _fetchMailPage(apiBase, mailboxToken, folder);
                    if (folderPage.ok) {
                        code = _extractCodeFromMessages(folderPage.messages, address, seenIds, excludedSet);
                        if (code) return code;
                    }
                }

                // 某些 CF Worker 部署虽然支持 folder 参数，但新邮件只会出现在默认聚合视图，
                // `folder=inbox` / `junk` 查询会返回 200 + 空列表。此时必须再回退查一次无 folder 的总视图，
                // 否则会把“邮件已到达但不在命名文件夹”误判成超时。
                const fallbackPage = await _fetchMailPage(apiBase, mailboxToken, '');
                if (fallbackPage.ok) {
                    code = _extractCodeFromMessages(fallbackPage.messages, address, seenIds, excludedSet);
                    if (code) return code;
                }
            } else {
                inboxPage = await _fetchMailPage(apiBase, mailboxToken, '');
                if (inboxPage.ok) {
                    const code = _extractCodeFromMessages(inboxPage.messages, address, seenIds, excludedSet);
                    if (code) return code;
                }
            }
        } catch (err) {
            console.error(`⚠️  [Inbox] 本次轮询失败: ${err.message}`);
        }

        if (excludedSet.size > 0 && onNoNewCodeFor30Seconds && (i + 1) % Math.ceil(30 / DEFAULT_POLL_INTERVAL_SECONDS) === 0) {
            const now = Date.now();
            if (now - lastResendAt >= 28000) {
                lastResendAt = now;
                await onNoNewCodeFor30Seconds();
            }
        }

        await new Promise((resolve) => setTimeout(resolve, Math.max(1, DEFAULT_POLL_INTERVAL_SECONDS) * 1000));
    }

    throw new Error('获取验证码超时');
}

async function deleteMailbox(email, { baseUrl = '', adminPassword = '', jwt = '', addressId = null } = {}) {
    const creds = _credentials.get(String(email || '').trim().toLowerCase()) || {};
    const apiBase = trimBaseUrl(baseUrl || creds.apiBase || _effectiveConfig().baseUrl || DEFAULT_API_BASE);
    const mailboxId = String(addressId ?? creds.addressId ?? '').trim();
    const effectiveAdminPassword = String(adminPassword || _effectiveConfig().adminPassword || '').trim();
    if (!apiBase || !mailboxId || !effectiveAdminPassword) return false;

    const tryMethods = [
        ['DELETE', `${apiBase}/admin/delete_address/${mailboxId}`],
        ['POST', `${apiBase}/admin/delete_address/${mailboxId}`]
    ];
    for (const [method, url] of tryMethods) {
        try {
            const { status } = await _requestJson(url, {
                method,
                headers: _adminHeaders(effectiveAdminPassword),
                timeoutMs: 15000
            });
            if ([200, 204, 404].includes(status)) {
                _credentials.delete(String(email || '').trim().toLowerCase());
                return true;
            }
        } catch (_) { }
    }
    return false;
}

function cleanupEmail(email) {
    _credentials.delete(String(email || '').trim().toLowerCase());
}

function snapshotState() {
    return {
        config: JSON.parse(JSON.stringify(_config)),
        credentials: Array.from(_credentials.entries())
    };
}

function restoreState(snapshot = {}) {
    const config = snapshot.config || {};
    _config = {
        baseUrl: trimBaseUrl(config.baseUrl || config.base_url || DEFAULT_API_BASE),
        adminPassword: String(config.adminPassword || config.admin_password || '').trim(),
        domains: Array.isArray(config.domains) ? config.domains.map((d) => normalizeDomain(d)).filter(Boolean) : []
    };
    _credentials = new Map(Array.isArray(snapshot.credentials) ? snapshot.credentials : []);
}

configure();

module.exports = {
    DEFAULT_API_BASE,
    configure,
    parseDomainsText,
    createAddress,
    verifyMailboxReady,
    fetchLatestOpenAiOtp,
    deleteMailbox,
    cleanupEmail,
    snapshotState,
    restoreState,
    trimBaseUrl
};
