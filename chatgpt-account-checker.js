const axios = require('axios');

const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 15_000;

function buildBaseHeaders() {
    return {
        'User-Agent': DEFAULT_UA,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://chatgpt.com',
        'Referer': 'https://chatgpt.com/'
    };
}

function bearerHeaders(accessToken) {
    return {
        ...buildBaseHeaders(),
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    };
}

function detectBanned(text) {
    const lower = String(text || '').toLowerCase();
    return lower.includes('account_deactivated')
        || lower.includes('deactivated')
        || lower.includes('disabled');
}

async function refreshAccessTokenViaSession(sessionToken) {
    if (!sessionToken || typeof sessionToken !== 'string') {
        throw new Error('该账号未导入 sessionToken，无法刷新');
    }

    const response = await axios.get('https://chatgpt.com/api/auth/session', {
        timeout: DEFAULT_TIMEOUT_MS,
        validateStatus: () => true,
        headers: {
            ...buildBaseHeaders(),
            'Cookie': `__Secure-next-auth.session-token=${sessionToken}`
        }
    });

    if (response.status !== 200) {
        const snippet = typeof response.data === 'string'
            ? response.data.slice(0, 200)
            : JSON.stringify(response.data || {}).slice(0, 200);
        throw new Error(`auth/session HTTP ${response.status}: ${snippet}`);
    }

    const data = typeof response.data === 'object' ? response.data : (() => {
        try { return JSON.parse(String(response.data || '{}')); }
        catch (_) { return {}; }
    })();

    const accessToken = data.accessToken || '';
    if (!accessToken) {
        throw new Error('auth/session 响应未包含 accessToken（sessionToken 可能已失效）');
    }

    return {
        accessToken,
        expires: data.expires || null,
        email: data.user && data.user.email ? String(data.user.email) : ''
    };
}

async function checkAvailability(accessToken) {
    if (!accessToken) return { availability: 'expired_token', error: '缺少 accessToken' };

    try {
        const response = await axios.get('https://chatgpt.com/backend-api/me', {
            timeout: DEFAULT_TIMEOUT_MS,
            validateStatus: () => true,
            headers: bearerHeaders(accessToken)
        });

        const status = response.status;
        const bodyText = typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data || {});

        if (status === 200) {
            if (detectBanned(bodyText)) {
                return { availability: 'banned', error: bodyText.slice(0, 200) };
            }
            return { availability: 'available' };
        }
        if (status === 401) {
            return { availability: 'expired_token', error: bodyText.slice(0, 200) };
        }
        if (status === 403 || detectBanned(bodyText)) {
            return { availability: 'banned', error: bodyText.slice(0, 200) };
        }
        return { availability: 'unknown', error: `HTTP ${status}: ${bodyText.slice(0, 200)}` };
    } catch (err) {
        return { availability: 'unknown', error: err && err.message ? err.message : String(err) };
    }
}

async function checkFreeTrial(accessToken) {
    if (!accessToken) {
        return { hasFreeTrial: false, statusHint: 'expired_token', error: '缺少 accessToken' };
    }

    try {
        const response = await axios.post(
            'https://chatgpt.com/backend-api/payments/checkout',
            {
                entry_point: 'all_plans_pricing_modal',
                plan_name: 'chatgptplusplan',
                billing_details: { country: 'US', currency: 'USD' },
                promo_campaign: { promo_campaign_id: 'plus-1-month-free', is_coupon_from_query_param: false },
                check_card_proxy: true
            },
            {
                timeout: DEFAULT_TIMEOUT_MS,
                validateStatus: () => true,
                headers: bearerHeaders(accessToken)
            }
        );

        const status = response.status;
        const bodyText = typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data || {});

        if (status === 200) {
            const data = typeof response.data === 'object'
                ? response.data
                : (() => { try { return JSON.parse(bodyText); } catch (_) { return {}; } })();
            const sessionId = data.checkout_session_id
                || (bodyText.match(/cs_live_[A-Za-z0-9]+/) || [])[0]
                || '';
            if (sessionId) {
                return { hasFreeTrial: true };
            }
            if (/not_eligible|permission|Offer not found/i.test(bodyText)) {
                return { hasFreeTrial: false };
            }
            return { hasFreeTrial: false, error: '响应缺少 checkout_session_id' };
        }
        if (status === 401) {
            return { hasFreeTrial: false, statusHint: 'expired_token', error: bodyText.slice(0, 200) };
        }
        if (status === 403 || detectBanned(bodyText)) {
            return { hasFreeTrial: false, statusHint: 'banned', error: bodyText.slice(0, 200) };
        }
        if (/not_eligible|permission|Offer not found/i.test(bodyText)) {
            return { hasFreeTrial: false };
        }
        return { hasFreeTrial: false, error: `HTTP ${status}: ${bodyText.slice(0, 200)}` };
    } catch (err) {
        return { hasFreeTrial: false, error: err && err.message ? err.message : String(err) };
    }
}

module.exports = {
    refreshAccessTokenViaSession,
    checkAvailability,
    checkFreeTrial
};
