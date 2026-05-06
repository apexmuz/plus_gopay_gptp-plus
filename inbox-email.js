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

function _extractOtpCode(content) {
    const text = String(content || '');
    if (!text) return '';
    const patterns = [
        /OpenAI verification code[^0-9]{0,20}(\d{6})/i,
        /verification code[^0-9]{0,20}(\d{6})/i,
        /verify your email[^0-9]{0,20}(\d{6})/i,
        /Use code[^0-9]{0,20}(\d{6})/i,
        /Your ChatGPT code is\s*(\d{6})/i,
        /ChatGPT code is\s*(\d{6})/i,
        /temporary verification code to continue:\s*(\d{6})/i,
        /(?<!\d)(\d{6})(?!\d)/
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
    for (const key of ['verification_code', 'verificationCode', 'otp', 'otp_code', 'otpCode', 'code']) {
        const candidate = String(payload[key] || '').trim();
        if (/^\d{6}$/.test(candidate)) return candidate;
    }
    return _extractOtpCode(_collectMessageTextParts(payload).join('\n'));
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

function _extractCodeFromMessages(messages, email, seenIds) {
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
        if (code) return code;
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
                let code = _extractCodeFromMessages(inboxPage.messages, address, seenIds);
                if (code && code !== excludeCode) return code;
                for (const folder of MAILBOX_FOLDER_CANDIDATES.slice(1)) {
                    const folderPage = await _fetchMailPage(apiBase, mailboxToken, folder);
                    if (folderPage.ok) {
                        code = _extractCodeFromMessages(folderPage.messages, address, seenIds);
                        if (code && code !== excludeCode) return code;
                    }
                }
            } else {
                inboxPage = await _fetchMailPage(apiBase, mailboxToken, '');
                if (inboxPage.ok) {
                    const code = _extractCodeFromMessages(inboxPage.messages, address, seenIds);
                    if (code && code !== excludeCode) return code;
                }
            }
        } catch (err) {
            console.error(`⚠️  [Inbox] 本次轮询失败: ${err.message}`);
        }

        if (excludeCode && onNoNewCodeFor30Seconds && (i + 1) % Math.ceil(30 / DEFAULT_POLL_INTERVAL_SECONDS) === 0) {
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
