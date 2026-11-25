import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../infrastructure/monitor/worker.mjs';

test('monitor notifies transitions, bypasses stale health URLs and retries failed delivery', async () => {
  const original = globalThis.fetch;
  let state = null, healthy = true, delivery = true, messages = 0;
  const env = {
    TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_ID: 'test',
    MONITOR_STATE: {get: async () => state, put: async (key, value) => {state = value;}}
  };
  globalThis.fetch = async (url, options) => {
    if (url.startsWith('https://halic-mind-source.onrender.com/health')) {
      assert.match(url, /\?monitor=\d+/);
      return Response.json({status: healthy ? 'ok' : 'unavailable'}, {status: healthy ? 200 : 503});
    }
    assert.equal(url, 'https://api.telegram.org/bottest/sendMessage');
    assert.equal(JSON.parse(options.body).chat_id, 'test');
    messages++;
    return Response.json({ok: delivery}, {status: delivery ? 200 : 503});
  };
  async function run() {
    let result;
    await worker.scheduled({}, env, {waitUntil: p => {result = p;}});
    await result;
  }
  try {
    await run(); assert.equal(state, 'up'); assert.equal(messages, 1);
    await run(); assert.equal(messages, 1);
    healthy = false; await run(); assert.equal(state, 'down'); assert.equal(messages, 2);
    healthy = true; delivery = false;
    await assert.rejects(run()); assert.equal(state, 'down');
    delivery = true; await run(); assert.equal(state, 'up'); assert.equal(messages, 4);
  } finally {globalThis.fetch = original;}
});
