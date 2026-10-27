const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../inject-danmu.js'), 'utf8');
function setup(providerIds, response = { ok: true, text: async () => '<i/>' }) {
  const requests = [], messages = [];
  const start = source.indexOf('    async function fetchDanmakuFromProvider(');
  const end = source.indexOf('    // URL/blob', start);
  const context = {
    fetchItemDetails: async () => ({ ProviderIds: providerIds }),
    throwIfAborted: s => { if (s.aborted) throw new DOMException('Aborted', 'AbortError'); },
    showDanmakuSourceToast: message => messages.push(message),
    getJellyfinApiUrl: path => '/base/' + path,
    fetchWithTimeout: async (url, options) => { requests.push({ url, options }); return response; },
    parseDanmakuData: () => ['comment'],
    isAbortError: e => e.name === 'AbortError',
    console: { warn() {} },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { context, requests, messages, run: signal => context.fetchDanmakuFromProvider('item', { Authorization: 'test' }, signal || new AbortController().signal) };
}
test('case insensitive provider key, direct episode ID, same server authentication', async () => {
  const s = setup({ dAnMuId: 'dandan:186900001' });
  assert.deepEqual(Array.from(await s.run()), ['comment']);
  assert.equal(s.requests[0].url, '/base/api/dandan/danmu/186900001/download');
  assert.equal(s.requests[0].options.headers.Authorization, 'test');
});
test('missing and invalid mappings never fall back to title search', async () => {
  for (const value of [undefined, '186900001', 'dandan:1/evil', 'dandan:0', 'other:1']) {
    const s = setup({ DanmuID: value });
    assert.equal((await s.run()).length, 0);
    assert.equal(s.requests.length, 0);
    assert.ok(s.messages[0].includes('暂无'));
  }
});
test('request errors keep playback available and show status', async () => {
  const s = setup({ DanmuID: 'dandan:1' }, { ok: false, status: 429 });
  assert.equal((await s.run()).length, 0);
  assert.ok(s.messages.at(-1).includes('失败'));
});
test('stale result after switching episode is discarded', async () => {
  const controller = new AbortController();
  const s = setup({ DanmuID: 'dandan:1' }, { ok: true, text: async () => { controller.abort(); return '<i/>'; } });
  await assert.rejects(s.run(controller.signal), { name: 'AbortError' });
});

test('reusing a video element with a new MSE source cancels the old playback', () => {
  const start = source.indexOf('    function scanPlaybackState()');
  const end = source.indexOf('    const observer = new MutationObserver', start);
  const video = { src: 'blob:new' };
  let cancelled = 0, initialized = 0;
  const context = {
    document: { querySelector: selector => selector.startsWith('video') ? video : {} },
    window: { location: { hash: '#/video', href: 'https://media/web/' } },
    activePlayback: { video, itemId: 'old', source: 'blob:old' },
    getCurrentItemId: () => null,
    cleanupDanmaku: () => { cancelled++; },
    initDanmaku: item => { assert.equal(item, video); initialized++; },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  context.scanPlaybackState();
  assert.equal(cancelled, 1);
  assert.equal(initialized, 1);
});
