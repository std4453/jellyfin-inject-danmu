const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBridge, toXml } = require('../bridge.cjs');

async function withBridge(options, run) {
    const server = createBridge(options);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const get = path => fetch(`http://127.0.0.1:${server.address().port}${path}`);
    try { await run(get); }
    finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const path = id => `/api/dandan/danmu/${id}/download`;
const comments = [{ cid: 1, p: '12.5,1,16711680,user', m: 'A < B & C' }];

test('converts dandanplay fields into valid escaped XML', () => {
    const xml = toXml(comments.concat([{ p: '-1,1,0,x', m: 'invalid' }, null]));
    assert.match(xml, /p="12.5,1,25,16711680,0,0,user,1"/);
    assert.match(xml, /A &lt; B &amp; C/);
    assert.doesNotMatch(xml, /invalid/);
    assert.throws(() => toXml(undefined));
});
test('serves only the known route and coalesces concurrent requests', async () => {
    let calls = 0;
    await withBridge({ load: async () => { calls++; await new Promise(r => setTimeout(r, 10)); return comments; } }, async get => {
        assert.equal((await get('/api/dandan/danmu/1x/download')).status, 404);
        const result = await Promise.all([get(path('1')), get(path('1'))]);
        assert.ok(result.every(r => r.status === 200));
        assert.match(await result[0].text(), /A &lt; B/);
        await get(path('1'));
        assert.equal(calls, 1);
    });
});
test('does not cache errors and retries the next request', async () => {
    let calls = 0;
    await withBridge({ load: async () => { if (++calls === 1) throw new Error('offline'); return comments; } }, async get => {
        assert.equal((await get(path('1'))).status, 502);
        assert.equal((await get(path('1'))).status, 200);
        assert.equal(calls, 2);
    });
});
test('expires cached comments and limits cache bytes', async () => {
    let clock = 0, calls = 0;
    await withBridge({ load: async () => { calls++; return comments; }, now: () => clock, ttl: 10 }, async get => {
        await get(path('1')); await get(path('1')); assert.equal(calls, 1);
        clock = 11; await get(path('1')); assert.equal(calls, 2);
    });
    calls = 0;
    await withBridge({ load: async () => { calls++; return comments; }, maxBytes: 1 }, async get => {
        await get(path('1')); await get(path('1')); assert.equal(calls, 2);
    });
});
test('rejects excess different IDs without extra upstream calls', async () => {
    let release, calls = 0;
    const held = new Promise(resolve => { release = resolve; });
    await withBridge({ load: async () => { calls++; await held; return comments; } }, async get => {
        const requests = [1, 2, 3, 4].map(id => get(path(id)));
        while (calls < 4) await new Promise(r => setTimeout(r, 1));
        assert.equal((await get(path(5))).status, 429);
        release(); await Promise.all(requests); assert.equal(calls, 4);
    });
});
