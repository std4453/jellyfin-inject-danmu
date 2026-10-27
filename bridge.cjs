const http = require('node:http');
const https = require('node:https');
const HttpsProxyAgent = require('https-proxy-agent');

const escapeXml = value => String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]));

function toXml(comments) {
    if (!Array.isArray(comments)) throw new Error('Invalid comment response');
    const entries = comments.flatMap(comment => {
        if (!comment || typeof comment.p !== 'string' || typeof comment.m !== 'string') return [];
        const [timeText, modeText, colorText, user = ''] = comment.p.split(',');
        const time = Number(timeText), mode = Number(modeText), color = Number(colorText);
        if (!Number.isFinite(time) || time < 0 || ![1, 4, 5, 6].includes(mode)) return [];
        const rgb = Number.isFinite(color) ? Math.max(0, Math.min(0xffffff, Math.trunc(color))) : 0xffffff;
        return [`<d p="${time},${mode},25,${rgb},0,0,${escapeXml(user)},${escapeXml(comment.cid)}">${escapeXml(comment.m)}</d>`];
    });
    return `<?xml version="1.0" encoding="UTF-8"?><i>${entries.join('')}</i>`;
}

function loadComments(id) {
    const url = new URL('https://api.danmaku.weeblify.app/ddp/v1');
    url.searchParams.set('path', `/v2/comment/${id}?withRelated=true&chConvert=1`);
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    return new Promise((resolve, reject) => {
        const request = https.get(url, { agent: proxy ? new HttpsProxyAgent(proxy) : undefined }, response => {
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error('Upstream request failed'));
                return;
            }
            let bytes = 0;
            const chunks = [];
            response.on('data', chunk => {
                bytes += chunk.length;
                if (bytes > 4 * 1024 * 1024) request.destroy(new Error('Upstream response too large'));
                else chunks.push(chunk);
            });
            response.on('error', reject);
            response.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')).comments); }
                catch (error) { reject(error); }
            });
        });
        const timer = setTimeout(() => request.destroy(new Error('Upstream timeout')), 9000);
        request.on('error', reject);
        request.on('close', () => clearTimeout(timer));
    });
}

// 仅监听 Pod 内回环地址，所有外部请求必须先经过 nginx 的 Jellyfin 鉴权。
function createBridge({ load = loadComments, now = Date.now, ttl = 300000, maxBytes = 16 * 1024 * 1024 } = {}) {
    const cache = new Map(), pending = new Map();
    let bytes = 0;
    function remember(id, xml) {
        const size = Buffer.byteLength(xml);
        if (size > maxBytes) return;
        while (cache.size && (bytes + size > maxBytes || cache.size >= 64)) {
            const key = cache.keys().next().value;
            bytes -= cache.get(key).size;
            cache.delete(key);
        }
        cache.set(id, { xml, size, expires: now() + ttl });
        bytes += size;
    }
    return http.createServer(async (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        if (request.url === '/health') { response.end('ok'); return; }
        const match = /^\/api\/dandan\/danmu\/([1-9]\d{0,15})\/download$/i.exec(request.url || '');
        if (request.method !== 'GET' || !match) { response.writeHead(404).end(); return; }
        const id = match[1];
        try {
            let cached = cache.get(id);
            if (cached && cached.expires <= now()) { bytes -= cached.size; cache.delete(id); cached = undefined; }
            let xml = cached?.xml;
            if (xml === undefined) {
                if (!pending.has(id)) {
                    if (pending.size >= 4) { response.writeHead(429).end('请求较多，请稍后重试'); return; }
                    pending.set(id, Promise.resolve().then(() => load(id)).then(toXml).then(result => {
                        remember(id, result); return result;
                    }).finally(() => pending.delete(id)));
                }
                xml = await pending.get(id);
            }
            response.setHeader('Content-Type', 'application/xml; charset=utf-8');
            response.end(xml);
        } catch {
            response.writeHead(502).end('弹幕暂时无法获取，请稍后重试');
        }
    });
}

module.exports = { toXml, createBridge };
if (require.main === module) {
    createBridge().listen(3000, '127.0.0.1', () => console.log('Danmaku bridge listening on loopback port 3000'));
}
