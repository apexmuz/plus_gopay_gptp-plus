(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
        return;
    }
    root.FormatConverter = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DEFAULT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
    const DEFAULT_PRIVACY_MODE = 'training_off';
    const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

    function firstText(...values) {
        for (const value of values) {
            const text = String(value ?? '').trim();
            if (text) return text;
        }
        return '';
    }

    function coerceTs(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
        const text = String(value ?? '').trim();
        if (!text) return 0;
        if (/^-?\d+$/.test(text)) return Math.max(0, parseInt(text, 10));
        const parsed = Date.parse(text);
        return Number.isNaN(parsed) ? 0 : Math.max(0, Math.trunc(parsed / 1000));
    }

    function looksLikeEmail(value) {
        const text = String(value ?? '').trim();
        if (!text || /\s/.test(text)) return false;
        const parts = text.split('@');
        return parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1]);
    }

    function encodeBase64UrlFromBytes(bytes) {
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(bytes).toString('base64url');
        }
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function encodeBase64UrlJson(value) {
        const raw = JSON.stringify(value);
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(raw, 'utf8').toString('base64url');
        }
        return encodeBase64UrlFromBytes(textEncoder.encode(raw));
    }

    function decodeBase64UrlToText(value) {
        const normalized = String(value ?? '').replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(padded, 'base64').toString('utf8');
        }
        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
        return textDecoder.decode(bytes);
    }

    function decodeJwtPayload(token) {
        try {
            const parts = String(token ?? '').split('.');
            if (parts.length < 2) return {};
            const parsed = JSON.parse(decodeBase64UrlToText(parts[1]));
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }

    function extractAuth(payload) {
        const value = payload?.['https://api.openai.com/auth'];
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    function extractProfile(payload) {
        const value = payload?.['https://api.openai.com/profile'];
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    function extractAccountIdFromAuth(auth) {
        const accountId = firstText(auth?.chatgpt_account_id, auth?.account_id);
        if (accountId) return accountId;
        const userLink = firstText(auth?.chatgpt_account_user_id);
        if (userLink.includes('__')) return userLink.split('__').pop().trim();
        return '';
    }

    function extractOrganizationId(idAuth, accessAuth) {
        const orgId = firstText(idAuth?.organization_id, accessAuth?.organization_id);
        if (orgId) return orgId;
        const pools = [idAuth?.organizations, accessAuth?.organizations];
        for (const organizations of pools) {
            if (!Array.isArray(organizations)) continue;
            for (const item of organizations) {
                const value = firstText(item?.id);
                if (value) return value;
            }
        }
        return '';
    }

    function sanitizeFilename(name, fallback) {
        const cleaned = String(name ?? '').trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_');
        return cleaned || fallback;
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function pad3(value) {
        return String(value).padStart(3, '0');
    }

    function utc8Date(date) {
        return new Date(date.getTime() + 8 * 60 * 60 * 1000);
    }

    function toIso8(date) {
        const shifted = utc8Date(date);
        return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:${pad2(shifted.getUTCSeconds())}.${pad3(shifted.getUTCMilliseconds())}+08:00`;
    }

    function formatExportTimestamp(date = new Date()) {
        const shifted = utc8Date(date);
        return `${shifted.getUTCFullYear()}${pad2(shifted.getUTCMonth() + 1)}${pad2(shifted.getUTCDate())}_${pad2(shifted.getUTCHours())}${pad2(shifted.getUTCMinutes())}${pad2(shifted.getUTCSeconds())}`;
    }

    function exportFileName(count, ext, timestamp = formatExportTimestamp()) {
        const safeCount = Math.max(1, parseInt(count, 10) || 1);
        return `${safeCount}_${timestamp}.${ext}`;
    }

    function compatSeeds(accountId, userId, email) {
        const seed = (firstText(accountId, userId, email, 'unknown').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'unknown');
        return {
            org: `org-${seed}`,
            proj: `proj_${seed}`,
            sid: `compat_session_${seed}`
        };
    }

    function buildCompatIdToken(args) {
        const accountId = firstText(args.accountId);
        const raw = firstText(args.idToken);
        if (!accountId) return raw;
        const idPayload = decodeJwtPayload(raw);
        const accessPayload = decodeJwtPayload(args.accessToken);
        const basePayload = Object.keys(idPayload).length ? idPayload : accessPayload;
        if (!Object.keys(basePayload).length) return raw;

        const auth = { ...extractAuth(basePayload) };
        const profile = extractProfile(basePayload);
        const email = firstText(profile.email, basePayload.email, args.email);
        const userId = firstText(args.userId, auth.chatgpt_user_id, auth.user_id, basePayload.sub);
        const seeds = compatSeeds(accountId, userId, email);
        const organizationId = firstText(args.organizationId, auth.organization_id, seeds.org);
        const projectId = firstText(args.projectId, auth.project_id, seeds.proj);

        auth.chatgpt_account_id = firstText(auth.chatgpt_account_id, auth.account_id, accountId);
        auth.account_id = firstText(auth.account_id, auth.chatgpt_account_id, accountId);
        if (userId) {
            auth.chatgpt_user_id = firstText(auth.chatgpt_user_id, auth.user_id, userId);
            auth.user_id = firstText(auth.user_id, auth.chatgpt_user_id, userId);
        }
        auth.chatgpt_plan_type = firstText(auth.chatgpt_plan_type, args.planType, 'free');
        auth.organization_id = firstText(auth.organization_id, organizationId);
        auth.project_id = firstText(auth.project_id, projectId);
        if (!Array.isArray(auth.organizations) || !auth.organizations.length) {
            auth.organizations = [{ id: organizationId, is_default: true, role: 'owner', title: 'Personal' }];
        }
        if (!Array.isArray(auth.groups)) auth.groups = [];
        if (!('completed_platform_onboarding' in auth)) auth.completed_platform_onboarding = false;
        if (!('is_org_owner' in auth)) auth.is_org_owner = true;
        if (!('localhost' in auth)) auth.localhost = true;

        const payload = { ...basePayload, 'https://api.openai.com/auth': auth };
        if (email && !firstText(payload.email)) payload.email = email;
        if (!('email_verified' in payload)) payload.email_verified = true;
        if (!firstText(payload.iss)) payload.iss = 'https://auth.openai.com';
        if (!payload.aud) payload.aud = [DEFAULT_CLIENT_ID];
        if (!firstText(payload.auth_provider)) payload.auth_provider = 'password';
        const authTime = coerceTs(payload.pwd_auth_time || payload.auth_time || payload.rat || payload.iat);
        if (authTime && !coerceTs(payload.auth_time)) payload.auth_time = authTime;
        const sid = firstText(payload.sid, payload.session_id, seeds.sid);
        if (sid && !firstText(payload.sid)) payload.sid = sid;
        if (sid && !firstText(payload.session_id)) payload.session_id = sid;
        if (!firstText(payload.sub) && userId) payload.sub = userId;
        if (!firstText(payload.jti)) payload.jti = `compat-${(firstText(args.accessToken, raw, accountId, userId, email).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || 'compat')}`;
        if (!firstText(payload.name) && email) payload.name = email.split('@')[0] || 'OpenAI User';

        return `${encodeBase64UrlJson({ alg: 'RS256', typ: 'JWT', kid: 'compat' })}.${encodeBase64UrlJson(payload)}.${encodeBase64UrlFromBytes((typeof Buffer !== 'undefined' ? Buffer.from('compat_signature_for_local_parsing_only') : textEncoder.encode('compat_signature_for_local_parsing_only')))}`;
    }

    function ensureIdTokenClaims(args) {
        const token = firstText(args.idToken);
        const accountId = firstText(args.accountId);
        if (!accountId) return token;
        const payload = decodeJwtPayload(token);
        if (!Object.keys(payload).length) return buildCompatIdToken(args);

        const auth = { ...extractAuth(payload) };
        const existingChatgpt = firstText(auth.chatgpt_account_id);
        const existingAccount = firstText(auth.account_id);
        if (existingChatgpt && existingAccount) return token;

        const resolved = firstText(existingChatgpt, existingAccount, accountId);
        auth.chatgpt_account_id = firstText(existingChatgpt, resolved);
        auth.account_id = firstText(existingAccount, resolved);
        if (args.userId) {
            auth.chatgpt_user_id = firstText(auth.chatgpt_user_id, auth.user_id, args.userId);
            auth.user_id = firstText(auth.user_id, auth.chatgpt_user_id, args.userId);
        }
        if (args.organizationId && !firstText(auth.organization_id)) auth.organization_id = args.organizationId;
        if (args.projectId && !firstText(auth.project_id)) auth.project_id = args.projectId;
        if (args.planType && !firstText(auth.chatgpt_plan_type)) auth.chatgpt_plan_type = args.planType;

        const updated = { ...payload, 'https://api.openai.com/auth': auth };
        const parts = token.split('.');
        const head = parts[0] || encodeBase64UrlJson({ alg: 'RS256', typ: 'JWT', kid: 'compat' });
        const signatureSeed = typeof Buffer !== 'undefined'
            ? Buffer.from('compat_signature_for_local_parsing_only')
            : textEncoder.encode('compat_signature_for_local_parsing_only');
        const signature = parts[2] || encodeBase64UrlFromBytes(signatureSeed);
        return `${head}.${encodeBase64UrlJson(updated)}.${signature}`;
    }

    function finalizeRecord(record) {
        const item = { ...record };
        item.chatgpt_account_id = firstText(item.chatgpt_account_id, item.account_id);
        item.project_id = firstText(item.project_id, item.workspace_id);
        item.workspace_id = firstText(item.workspace_id, item.project_id);
        if (!item.client_id) item.client_id = DEFAULT_CLIENT_ID;
        if (!item.privacy_mode) item.privacy_mode = DEFAULT_PRIVACY_MODE;
        if (!('openai_oauth_responses_websockets_v2_enabled' in item)) item.openai_oauth_responses_websockets_v2_enabled = false;
        if (!item.openai_oauth_responses_websockets_v2_mode) item.openai_oauth_responses_websockets_v2_mode = 'off';
        item.id_token = ensureIdTokenClaims({
            idToken: firstText(item.id_token),
            accessToken: firstText(item.access_token),
            accountId: firstText(item.chatgpt_account_id),
            userId: firstText(item.chatgpt_user_id),
            organizationId: firstText(item.organization_id),
            projectId: firstText(item.project_id, item.workspace_id),
            email: firstText(item.email, item.account_claims_email),
            planType: firstText(item.plan_type, 'free')
        });
        return item;
    }

    function normalizeRecord(item) {
        if (!item || typeof item !== 'object' || Array.isArray(item) || Array.isArray(item.accounts)) return null;

        let email = '';
        let password = '';
        let loginIdentity = '';
        let phone = '';
        let accessToken = '';
        let refreshToken = '';
        let idToken = '';
        let sessionToken = '';
        let clientId = '';
        let chatgptAccountId = '';
        let chatgptUserId = '';
        let organizationId = '';
        let projectId = '';
        let workspaceId = '';
        let createdAt = 0;
        let lastUsed = 0;
        let status = '';
        let source = '';
        let disabled = false;
        let accountClaimsEmail = '';
        let privacyMode = '';
        let wsEnabled = null;
        let wsMode = '';

        if (item.tokens && typeof item.tokens === 'object' && !Array.isArray(item.tokens)) {
            const tokens = item.tokens;
            email = firstText(item.email);
            accessToken = firstText(tokens.access_token);
            refreshToken = firstText(tokens.refresh_token);
            idToken = firstText(tokens.id_token);
            chatgptAccountId = firstText(item.chatgpt_account_id, item.account_id);
            createdAt = coerceTs(item.created_at);
            lastUsed = coerceTs(item.last_used);
            source = 'codex_input';
        } else if (item.credentials && typeof item.credentials === 'object' && !Array.isArray(item.credentials)) {
            const credentials = item.credentials;
            const extra = item.extra && typeof item.extra === 'object' && !Array.isArray(item.extra) ? item.extra : {};
            email = firstText(extra.email, credentials.email, item.name);
            accessToken = firstText(credentials.access_token);
            refreshToken = firstText(credentials.refresh_token);
            idToken = firstText(credentials.id_token);
            sessionToken = firstText(credentials.session_token);
            clientId = firstText(credentials.client_id, DEFAULT_CLIENT_ID);
            chatgptAccountId = firstText(credentials.chatgpt_account_id, credentials.account_id, item.chatgpt_account_id, item.account_id);
            chatgptUserId = firstText(credentials.chatgpt_user_id);
            organizationId = firstText(credentials.organization_id);
            projectId = firstText(credentials.project_id);
            workspaceId = firstText(projectId);
            createdAt = coerceTs(item.created_at);
            lastUsed = coerceTs(item.last_used);
            status = firstText(item.status);
            source = firstText(item.notes, 'sub_bundle_input');
            disabled = Boolean(item.disabled);
            accountClaimsEmail = firstText(extra.email);
            privacyMode = firstText(extra.privacy_mode);
            wsEnabled = extra.openai_oauth_responses_websockets_v2_enabled;
            wsMode = firstText(extra.openai_oauth_responses_websockets_v2_mode);
        } else {
            email = firstText(item.email);
            password = firstText(item.password);
            loginIdentity = firstText(item.login_identity);
            phone = firstText(item.phone);
            accessToken = firstText(item.access_token);
            refreshToken = firstText(item.refresh_token);
            idToken = firstText(item.id_token);
            sessionToken = firstText(item.session_token);
            clientId = firstText(item.client_id, DEFAULT_CLIENT_ID);
            chatgptAccountId = firstText(item.chatgpt_account_id, item.account_id);
            chatgptUserId = firstText(item.chatgpt_user_id);
            organizationId = firstText(item.organization_id);
            projectId = firstText(item.project_id);
            workspaceId = firstText(item.workspace_id, projectId);
            createdAt = coerceTs(item.created_at);
            lastUsed = coerceTs(item.last_used);
            status = firstText(item.status);
            source = firstText(item.source, 'unified_input');
            disabled = Boolean(item.disabled);
            accountClaimsEmail = firstText(item.account_claims_email);
            privacyMode = firstText(item.privacy_mode);
            wsEnabled = item.openai_oauth_responses_websockets_v2_enabled;
            wsMode = firstText(item.openai_oauth_responses_websockets_v2_mode);
        }

        if (!email) return null;

        const idPayload = decodeJwtPayload(idToken);
        const accessPayload = decodeJwtPayload(accessToken);
        const idAuth = extractAuth(idPayload);
        const accessAuth = extractAuth(accessPayload);
        const accessProfile = extractProfile(accessPayload);

        const record = {
            version: parseInt(item.version || 1, 10) || 1,
            platform: firstText(item.platform, 'chatgpt'),
            email,
            password,
            login_identity: firstText(loginIdentity),
            phone: firstText(phone),
            access_token: accessToken,
            refresh_token: refreshToken,
            id_token: idToken,
            session_token: sessionToken,
            client_id: firstText(clientId, DEFAULT_CLIENT_ID),
            chatgpt_account_id: firstText(chatgptAccountId, extractAccountIdFromAuth(idAuth), extractAccountIdFromAuth(accessAuth)),
            chatgpt_user_id: firstText(chatgptUserId, idAuth.chatgpt_user_id, idAuth.user_id, idAuth.chatgpt_account_user_id, accessAuth.chatgpt_user_id, accessAuth.user_id, accessAuth.chatgpt_account_user_id),
            organization_id: firstText(organizationId, extractOrganizationId(idAuth, accessAuth)),
            project_id: firstText(projectId, workspaceId, idAuth.project_id, accessAuth.project_id),
            workspace_id: firstText(workspaceId, projectId, idAuth.project_id, accessAuth.project_id),
            created_at: createdAt,
            last_used: lastUsed,
            status,
            source,
            disabled,
            account_claims_email: firstText(accountClaimsEmail, idPayload.email, accessProfile.email),
            plan_type: firstText(item.plan_type, idAuth.chatgpt_plan_type, accessAuth.chatgpt_plan_type, 'free'),
            privacy_mode: firstText(privacyMode, DEFAULT_PRIVACY_MODE),
            openai_oauth_responses_websockets_v2_enabled: wsEnabled !== null ? Boolean(wsEnabled) : false,
            openai_oauth_responses_websockets_v2_mode: firstText(wsMode, 'off')
        };

        if (record.login_identity && !record.phone && !looksLikeEmail(record.login_identity)) {
            record.phone = record.login_identity;
        }

        return finalizeRecord(record);
    }

    function parseInputItems(text) {
        const trimmed = String(text ?? '').trim();
        if (!trimmed) return { items: [], shape: '空输入' };
        let root = null;
        try {
            root = JSON.parse(trimmed);
        } catch {
            root = null;
        }

        const items = [];
        let shape = 'JSONL';

        if (root && typeof root === 'object' && !Array.isArray(root)) {
            if (Array.isArray(root.accounts)) {
                items.push(...root.accounts.filter((value) => value && typeof value === 'object' && !Array.isArray(value)));
                shape = 'SUB bundle JSON';
            } else {
                items.push(root);
                shape = root.tokens ? 'Codex JSON' : 'Unified JSON';
            }
        } else if (Array.isArray(root)) {
            items.push(...root.filter((value) => value && typeof value === 'object' && !Array.isArray(value)));
            shape = items[0]?.tokens ? 'Codex JSON 数组' : 'JSON 数组';
        } else {
            for (const rawLine of trimmed.split(/\r?\n/)) {
                const line = rawLine.trim();
                if (!line || line.startsWith('#')) continue;
                const parsed = JSON.parse(line);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    if (Array.isArray(parsed.accounts)) {
                        items.push(...parsed.accounts.filter((value) => value && typeof value === 'object' && !Array.isArray(value)));
                        shape = 'SUB bundle JSONL';
                    } else {
                        items.push(parsed);
                    }
                }
            }
            if (items[0]?.tokens) shape = 'Codex JSONL';
            else if (items[0]?.credentials) shape = 'SUB 账号 JSONL';
            else shape = 'Unified JSONL';
        }

        return { items, shape };
    }

    function normalizeRecordsFromText(text) {
        const { items, shape } = parseInputItems(text);
        const recordMap = new Map();
        let pending = 0;

        for (const item of items) {
            const beforeAuth = extractAuth(decodeJwtPayload(firstText(item?.id_token, item?.credentials?.id_token, item?.tokens?.id_token)));
            const hadClaims = Boolean(firstText(beforeAuth.chatgpt_account_id) && firstText(beforeAuth.account_id));
            const record = normalizeRecord(item);
            if (!record) continue;
            const afterAuth = extractAuth(decodeJwtPayload(record.id_token));
            const hasClaims = Boolean(firstText(afterAuth.chatgpt_account_id) && firstText(afterAuth.account_id));
            if (!hadClaims && hasClaims && firstText(record.chatgpt_account_id)) pending += 1;
            recordMap.set(record.email.trim().toLowerCase(), record);
        }

        return { records: [...recordMap.values()], shape, pending };
    }

    function buildCpaPayload(record) {
        const item = finalizeRecord(record);
        const exp = coerceTs(decodeJwtPayload(item.access_token).exp);
        return {
            type: 'codex',
            email: item.email,
            expired: exp ? toIso8(new Date(exp * 1000)) : '',
            id_token: item.id_token,
            account_id: firstText(item.chatgpt_account_id),
            disabled: Boolean(item.disabled),
            access_token: item.access_token,
            last_refresh: toIso8(new Date()),
            refresh_token: item.refresh_token
        };
    }

    function buildSubAccount(record) {
        const item = finalizeRecord(record);
        let expiresAt = coerceTs(decodeJwtPayload(item.access_token).exp);
        if (!expiresAt) expiresAt = Math.trunc(Date.now() / 1000) + 863999;
        return {
            name: item.email,
            platform: 'openai',
            type: 'oauth',
            credentials: {
                access_token: item.access_token,
                chatgpt_account_id: item.chatgpt_account_id,
                chatgpt_user_id: item.chatgpt_user_id,
                client_id: firstText(item.client_id, DEFAULT_CLIENT_ID),
                email: item.email,
                expires_at: expiresAt,
                id_token: item.id_token,
                organization_id: item.organization_id,
                plan_type: firstText(item.plan_type, 'free'),
                refresh_token: item.refresh_token
            },
            extra: {
                email: item.email,
                openai_oauth_responses_websockets_v2_enabled: Boolean(item.openai_oauth_responses_websockets_v2_enabled),
                openai_oauth_responses_websockets_v2_mode: firstText(item.openai_oauth_responses_websockets_v2_mode, 'off'),
                privacy_mode: firstText(item.privacy_mode, DEFAULT_PRIVACY_MODE)
            },
            concurrency: 10,
            priority: 1,
            rate_multiplier: 1,
            auto_pause_on_expired: true
        };
    }

    function writeTarText(buffer, offset, text) {
        const bytes = typeof Buffer !== 'undefined' ? Buffer.from(String(text ?? '')) : textEncoder.encode(String(text ?? ''));
        for (let index = 0; index < bytes.length && offset + index < buffer.length; index += 1) {
            buffer[offset + index] = bytes[index];
        }
    }

    function octal(value, length) {
        const text = Math.max(0, Math.trunc(value)).toString(8);
        return `${text}`.padStart(length - 1, '0') + '\0';
    }

    function tarChecksum(header) {
        let sum = 0;
        for (const byte of header) sum += byte;
        return `${sum.toString(8).padStart(6, '0')}\0 `;
    }

    function createTarArchive(files) {
        const blocks = [];
        for (const file of files) {
            const name = sanitizeFilename(file.name, 'account.json').slice(0, 99);
            const bytes = file.bytes instanceof Uint8Array
                ? file.bytes
                : new Uint8Array(typeof Buffer !== 'undefined' ? Buffer.from(String(file.text ?? ''), 'utf8') : textEncoder.encode(String(file.text ?? '')));
            const header = new Uint8Array(512);
            writeTarText(header, 0, name);
            writeTarText(header, 100, '0000777\0');
            writeTarText(header, 108, '0000000\0');
            writeTarText(header, 116, '0000000\0');
            writeTarText(header, 124, octal(bytes.length, 12));
            writeTarText(header, 136, octal(Math.trunc(Date.now() / 1000), 12));
            writeTarText(header, 148, '        ');
            writeTarText(header, 156, '0');
            writeTarText(header, 257, 'ustar\0');
            writeTarText(header, 263, '00');
            writeTarText(header, 148, tarChecksum(header));
            blocks.push(header, bytes);
            const pad = (512 - (bytes.length % 512)) % 512;
            if (pad) blocks.push(new Uint8Array(pad));
        }
        blocks.push(new Uint8Array(1024));
        const total = blocks.reduce((size, block) => size + block.length, 0);
        const output = new Uint8Array(total);
        let offset = 0;
        for (const block of blocks) {
            output.set(block, offset);
            offset += block.length;
        }
        return output;
    }

    function buildOutput(records, mode) {
        if (!Array.isArray(records) || !records.length) {
            throw new Error('当前输入里没有解析出有效记录。');
        }

        if (mode === 'normalize') {
            const lines = records.map((record) => JSON.stringify(record));
            const text = `${lines.join('\n')}${lines.length ? '\n' : ''}`;
            return {
                text,
                parts: [text],
                name: exportFileName(records.length, 'jsonl'),
                mime: 'application/json;charset=utf-8',
                summary: `已标准化 ${records.length} 条记录，输出 unified JSONL。`,
                shape: '输出为 unified JSONL，保留显式账号字段并移除无关映射。'
            };
        }

        if (mode === 'to-cpa') {
            const payloads = records.map(buildCpaPayload);
            if (payloads.length === 1) {
                const text = JSON.stringify(payloads[0], null, 2);
                return {
                    text,
                    parts: [text],
                    name: exportFileName(1, 'json'),
                    mime: 'application/json;charset=utf-8',
                    summary: '已生成 1 个 CPA JSON。',
                    shape: '输出为单个 CPA JSON 文件。'
                };
            }
            const files = payloads.map((payload) => ({
                name: `${sanitizeFilename(payload.email, 'account')}.json`,
                text: JSON.stringify(payload, null, 2)
            }));
            const tarBytes = createTarArchive(files);
            return {
                text: ['CPA tar 包内文件：', ...files.map((file) => `- ${file.name}`)].join('\n'),
                parts: [tarBytes],
                name: exportFileName(payloads.length, 'tar'),
                mime: 'application/x-tar',
                summary: `已生成 ${payloads.length} 个账号的 CPA tar 包。`,
                shape: '多个账号导出为 tar，包内每个账号各自独立 JSON。'
            };
        }

        if (mode === 'to-sub') {
            const bundle = {
                exported_at: new Date().toISOString(),
                proxies: [],
                accounts: records.map(buildSubAccount)
            };
            const text = JSON.stringify(bundle, null, 2);
            return {
                text,
                parts: [text],
                name: exportFileName(bundle.accounts.length, 'json'),
                mime: 'application/json;charset=utf-8',
                summary: `已生成 1 个 sub2api bundle，包含 ${bundle.accounts.length} 个账号。`,
                shape: '输出为 sub2api bundle JSON，包含完整 credentials 与 extra 信息。'
            };
        }

        throw new Error(`不支持的模式：${mode}`);
    }

    function setText(target, text) {
        if (target) target.textContent = text;
    }

    async function copyText(text) {
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof window !== 'undefined' && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        if (typeof document === 'undefined') return;
        const input = document.createElement('textarea');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
    }

    function initFormatConverter() {
        if (typeof document === 'undefined') return null;

        const elements = {
            input: document.getElementById('convertInput'),
            mode: document.getElementById('convertMode'),
            file: document.getElementById('convertFile'),
            run: document.getElementById('convertRunBtn'),
            clear: document.getElementById('convertClearBtn'),
            copy: document.getElementById('convertCopyBtn'),
            download: document.getElementById('convertDownloadBtn'),
            detect: document.getElementById('convertDetect'),
            count: document.getElementById('convertCount'),
            backfill: document.getElementById('convertBackfill'),
            error: document.getElementById('convertError'),
            output: document.getElementById('convertOutput'),
            meta: document.getElementById('convertMeta'),
            summary: document.getElementById('convertSummary')
        };

        if (!elements.input || !elements.mode) return null;
        if (elements.input.dataset.converterBound === '1') return elements;
        elements.input.dataset.converterBound = '1';

        const state = {
            text: '',
            name: '',
            mime: 'text/plain;charset=utf-8',
            parts: []
        };

        function resetOutput(summaryText) {
            invalidateOutput(summaryText);
        }

        function invalidateOutput(summaryText) {
            state.text = '';
            state.name = '';
            state.parts = [];
            state.mime = 'text/plain;charset=utf-8';
            setText(elements.output, '');
            setText(elements.meta, '尚未生成');
            setText(elements.summary, summaryText || '支持 JSON、JSONL、sub2api、CPA 输入。');
            if (elements.copy) elements.copy.disabled = true;
            if (elements.download) elements.download.disabled = true;
        }

        function updateDetection() {
            const raw = elements.input.value;
            if (!raw.trim()) {
                setText(elements.detect, '等待输入');
                setText(elements.count, '0');
                setText(elements.backfill, '0');
                setText(elements.error, '');
                invalidateOutput('支持 JSON、JSONL、sub2api、CPA 输入。');
                return;
            }

            invalidateOutput('支持 JSON、JSONL、sub2api、CPA 输入。');
            try {
                const parsed = normalizeRecordsFromText(raw);
                setText(elements.detect, parsed.shape);
                setText(elements.count, String(parsed.records.length));
                setText(elements.backfill, String(parsed.pending));
                setText(elements.error, '');
            } catch (error) {
                setText(elements.detect, '解析失败');
                setText(elements.count, '0');
                setText(elements.backfill, '0');
                setText(elements.error, error instanceof Error ? error.message : String(error));
            }
        }

        function renderOutput(result) {
            state.text = result.text;
            state.name = result.name;
            state.mime = result.mime;
            state.parts = result.parts || [result.text];
            setText(elements.output, result.text);
            setText(elements.meta, `${result.name} · ${result.text.length.toLocaleString()} 字符预览`);
            setText(elements.summary, result.summary);
            setText(elements.error, '');
            if (elements.copy) elements.copy.disabled = !result.text;
            if (elements.download) elements.download.disabled = !result.parts?.length;
        }

        async function loadFile(file) {
            const text = await file.text();
            elements.input.value = text;
            updateDetection();
        }

        elements.input.addEventListener('input', updateDetection);
        elements.mode.addEventListener('change', () => {
            invalidateOutput('支持 JSON、JSONL、sub2api、CPA 输入。');
        });
        if (elements.file) {
            elements.file.addEventListener('change', async () => {
                const [file] = elements.file.files || [];
                if (!file) return;
                await loadFile(file);
            });
        }
        if (elements.run) {
            elements.run.addEventListener('click', () => {
                try {
                    const parsed = normalizeRecordsFromText(elements.input.value);
                    renderOutput(buildOutput(parsed.records, elements.mode.value));
                } catch (error) {
                    setText(elements.error, error instanceof Error ? error.message : String(error));
                }
            });
        }
        if (elements.clear) {
            elements.clear.addEventListener('click', () => {
                elements.input.value = '';
                if (elements.file) elements.file.value = '';
                updateDetection();
            });
        }
        if (elements.copy) {
            elements.copy.addEventListener('click', async () => {
                if (!state.text) return;
                await copyText(state.text);
                setText(elements.summary, '已复制当前预览内容。');
            });
        }
        if (elements.download) {
            elements.download.addEventListener('click', () => {
                if (!state.parts.length || typeof document === 'undefined') return;
                const blob = new Blob(state.parts, { type: state.mime });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = state.name || 'converted.txt';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            });
        }

        updateDetection();
        return elements;
    }

    return {
        normalizeRecordsFromText,
        buildOutput,
        initFormatConverter
    };
});
