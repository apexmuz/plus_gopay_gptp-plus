const http = require('http');
const net = require('net');

function parseProxyUrl(proxyValue) {
    if (!proxyValue) return null;
    try {
        const parsed = new URL(proxyValue);
        return {
            protocol: parsed.protocol.replace(':', '').toLowerCase(),
            host: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : undefined,
            username: decodeURIComponent(parsed.username || ''),
            password: decodeURIComponent(parsed.password || '')
        };
    } catch (_) {
        return null;
    }
}

function needsPlaywrightProxyBridge(proxyValue) {
    const parsed = parseProxyUrl(proxyValue);
    if (!parsed) return false;
    if (!parsed.protocol.startsWith('socks')) return false;
    return Boolean(parsed.username || parsed.password);
}

async function createSocksTunnel(upstream, destination, createConnection = null) {
    const socksCreateConnection = createConnection || require('socks').SocksClient.createConnection;
    const result = await socksCreateConnection({
        proxy: {
            host: upstream.host,
            port: upstream.port,
            type: upstream.protocol === 'socks4' ? 4 : 5,
            userId: upstream.username || undefined,
            password: upstream.password || undefined
        },
        command: 'connect',
        destination
    });
    return result.socket;
}

async function startLocalPlaywrightProxyBridge(proxyValue, options = {}) {
    const upstream = parseProxyUrl(proxyValue);
    if (!upstream) {
        throw new Error('代理 URL 无效，无法创建本地桥接');
    }
    if (!upstream.protocol.startsWith('socks')) {
        throw new Error('仅支持为 socks 代理创建本地桥接');
    }
    if (!upstream.host || !upstream.port) {
        throw new Error('socks 代理缺少 host 或 port');
    }

    const createConnection = typeof options.createConnection === 'function'
        ? options.createConnection
        : null;

    const sockets = new Set();

    const server = http.createServer();

    server.on('request', (req, res) => {
        const target = req.url ? new URL(req.url) : null;
        if (!target || !target.hostname) {
            res.writeHead(400);
            res.end('Bad Request');
            return;
        }

        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', async () => {
            let upstreamSocket = null;
            try {
                upstreamSocket = await createSocksTunnel(upstream, {
                    host: target.hostname,
                    port: Number(target.port || (target.protocol === 'https:' ? 443 : 80))
                }, createConnection);
                sockets.add(upstreamSocket);

                const headers = Object.entries(req.headers || {})
                    .filter(([key]) => !/^proxy-/i.test(String(key)))
                    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`)
                    .join('');

                upstreamSocket.write(`${req.method} ${target.pathname || '/'}${target.search || ''} HTTP/1.1\r\nHost: ${target.host}\r\n${headers}\r\n`);
                if (chunks.length) {
                    upstreamSocket.write(Buffer.concat(chunks));
                }

                upstreamSocket.pipe(res);
                upstreamSocket.on('close', () => sockets.delete(upstreamSocket));
                upstreamSocket.on('error', () => {
                    sockets.delete(upstreamSocket);
                    if (!res.headersSent) {
                        res.writeHead(502);
                    }
                    res.end();
                });
            } catch (error) {
                if (upstreamSocket) {
                    sockets.delete(upstreamSocket);
                    upstreamSocket.destroy();
                }
                if (!res.headersSent) {
                    res.writeHead(502);
                }
                res.end(String(error?.message || error || 'Proxy bridge error'));
            }
        });
    });

    server.on('connect', async (req, clientSocket, head) => {
        const [host, portRaw] = String(req.url || '').split(':');
        const port = Number(portRaw || 443);
        let upstreamSocket = null;
        try {
            upstreamSocket = await createSocksTunnel(upstream, { host, port }, createConnection);
            sockets.add(upstreamSocket);

            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            if (head && head.length) {
                upstreamSocket.write(head);
            }

            clientSocket.pipe(upstreamSocket);
            upstreamSocket.pipe(clientSocket);

            const cleanup = () => {
                sockets.delete(upstreamSocket);
                clientSocket.destroy();
                upstreamSocket.destroy();
            };

            clientSocket.on('error', cleanup);
            upstreamSocket.on('error', cleanup);
            clientSocket.on('close', cleanup);
            upstreamSocket.on('close', cleanup);
        } catch (error) {
            if (upstreamSocket) {
                sockets.delete(upstreamSocket);
                upstreamSocket.destroy();
            }
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            clientSocket.destroy();
        }
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    return {
        server,
        sockets,
        upstream,
        localProxyUrl: `http://127.0.0.1:${address.port}`
    };
}

async function stopLocalPlaywrightProxyBridge(bridge) {
    if (!bridge) return;
    for (const socket of bridge.sockets || []) {
        socket.destroy();
    }
    await new Promise((resolve) => {
        if (!bridge.server) return resolve();
        bridge.server.close(() => resolve());
    });
}

module.exports = {
    parseProxyUrl,
    needsPlaywrightProxyBridge,
    startLocalPlaywrightProxyBridge,
    stopLocalPlaywrightProxyBridge
};
