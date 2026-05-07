const DEFAULT_PROXY_PROBE_URL = 'http://api.ipify.org/?format=text';
const DEFAULT_PROXY_PROBE_ATTEMPTS = 3;
const DEFAULT_PROXY_PROBE_TIMEOUT_MS = 15000;
const DEFAULT_PROXY_PROBE_RETRY_DELAY_MS = 2000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeProbeErrorMessage(error) {
    return String(error?.message || error || '未知异常')
        .replace(/^apiRequestContext\.get:\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isProxyAuthFailure(message) {
    return /代理认证失败|proxy authentication|required|407|ERR_INVALID_AUTH_CREDENTIALS/i.test(String(message || ''));
}

function isProxyBalanceFailure(statusCode, bodyText = '') {
    if (Number(statusCode) === 402) {
        return true;
    }
    return /余额|balance|quota|insufficient|credit/i.test(String(bodyText || ''));
}

async function probeCheckoutProxy(request, {
    url = DEFAULT_PROXY_PROBE_URL,
    maxAttempts = DEFAULT_PROXY_PROBE_ATTEMPTS,
    timeoutMs = DEFAULT_PROXY_PROBE_TIMEOUT_MS,
    retryDelayMs = DEFAULT_PROXY_PROBE_RETRY_DELAY_MS,
    onAttemptFailure = null
} = {}) {
    let lastSummary = '未知异常';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const probeResponse = await request.get(url, { timeout: timeoutMs });
            if (probeResponse.ok()) {
                const ip = String(await probeResponse.text()).trim();
                return { ip, attempts: attempt, status: Number(probeResponse.status?.() || 200) };
            }

            const statusCode = Number(probeResponse.status?.() || 0);
            const bodyText = String(await probeResponse.text().catch(() => '') || '').trim();

            if (statusCode === 401 || statusCode === 407) {
                throw new Error(`代理认证失败: HTTP ${statusCode}`);
            }
            if (isProxyBalanceFailure(statusCode, bodyText)) {
                throw new Error(`账号余额异常: HTTP ${statusCode || 'unknown'}`);
            }

            lastSummary = `HTTP ${statusCode || 'unknown'}`;
            if (attempt < maxAttempts) {
                if (onAttemptFailure) {
                    await onAttemptFailure({
                        attempt,
                        maxAttempts,
                        error: new Error(lastSummary),
                        nextDelayMs: retryDelayMs
                    });
                }
                await sleep(retryDelayMs);
                continue;
            }
        } catch (error) {
            const summary = normalizeProbeErrorMessage(error);
            if (isProxyAuthFailure(summary)) {
                throw new Error(`代理认证失败: ${summary}`);
            }
            if (isProxyBalanceFailure(0, summary)) {
                throw new Error(`账号余额异常: ${summary}`);
            }

            lastSummary = summary || lastSummary;
            if (attempt < maxAttempts) {
                if (onAttemptFailure) {
                    await onAttemptFailure({
                        attempt,
                        maxAttempts,
                        error,
                        nextDelayMs: retryDelayMs
                    });
                }
                await sleep(retryDelayMs);
                continue;
            }
        }

        throw new Error(`代理或网络持续超时: 连续 ${maxAttempts} 次探测失败，最后一次=${lastSummary}`);
    }

    throw new Error(`代理或网络持续超时: 连续 ${maxAttempts} 次探测失败，最后一次=${lastSummary}`);
}

module.exports = {
    probeCheckoutProxy,
    normalizeProbeErrorMessage
};
