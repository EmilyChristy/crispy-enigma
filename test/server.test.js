import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

async function setup(t) {
  const server = createApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const post = async (path, data, headers = {}) => {
    const response = await fetch(`${base}/api/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
    return { status: response.status, data: await response.json() };
  };
  return { base, post };
}

test('serves the app and engine with security headers, not arbitrary source files', async t => {
  const { base } = await setup(t);
  for (const path of ['/', '/app.js', '/style.css', '/game.js']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  }
  assert.equal((await fetch(`${base}/server.js`)).status, 404);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
});

test('ten players share a room, with capacity, authentication, and host-only controls', async t => {
  const { base, post } = await setup(t);
  const host = (await post('join', { name: 'Host', avatar: '✦' })).data;
  assert.match(host.code, /^[A-F0-9]{6}$/);
  const guest = (await post('join', { name: 'Guest', code: host.code.toLowerCase() })).data;
  for (let i = 2; i < 10; i++) assert.equal((await post('join', { name: `Pilot ${i}`, code: host.code })).status, 200);
  assert.equal((await post('join', { name: 'Extra', code: host.code })).status, 409);
  assert.equal((await post('action', { ...guest, action: 'start' })).status, 403);
  assert.equal((await post('action', { ...host, token: 'wrong', action: 'start' })).status, 401);
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(`${base}/api/events?id=${host.id}&token=${host.token}`, { signal: controller.signal });
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  async function nextState(predicate = () => true) {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end >= 0) {
        const message = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const state = JSON.parse(message.slice(6));
        if (predicate(state)) return state;
      } else {
        const chunk = await reader.read();
        assert.equal(chunk.done, false);
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    }
  }
  const lobby = await nextState();
  assert.equal(lobby.players.length, 10);
  assert.equal(lobby.host, host.id);
  assert.ok(!JSON.stringify(lobby).includes(host.token));
  assert.equal((await post('action', { ...host, action: 'start' })).status, 200);
  const started = await nextState(state => state.status === 'playing');
  assert.equal(started.level, 0);
  assert.equal(started.mode, 'courier');
  assert.equal(started.cells.length, 3);
  assert.equal(started.exitOpen, false);
  assert.ok(started.brief.includes('Carry'));
  assert.equal((await post('action', { ...guest, action: 'rewind' })).status, 403);
  assert.equal((await post('action', { ...host, action: 'rewind' })).status, 400);
  assert.equal((await post('input', { ...host, direction: 'down', sequence: 2 })).status, 200);
  assert.equal((await post('input', { ...host, direction: 'up', sequence: 1 })).status, 200);
  const moving = await nextState(state => state.players[0].direction === 'down');
  assert.equal(moving.players[0].direction, 'down');
  assert.equal((await post('action', { ...host, action: 'pause' })).status, 200);
  const paused = await nextState(state => state.status === 'paused');
  assert.ok(paused.players.every(player => player.direction === null));
  assert.equal((await post('input', { ...host, direction: 'right', sequence: 3 })).status, 200);
  assert.equal((await nextState(state => state.status === 'paused')).players[0].direction, null);
  assert.equal((await post('action', { ...host, action: 'leave' })).status, 200);
  assert.equal((await post('action', { ...guest, action: 'pause' })).status, 200);
  assert.equal((await post('join', { name: 'Late', code: guest.code })).status, 409);
});

test('invalid input, image data, unknown rooms, and cross-origin requests are handled safely', async t => {
  const { base, post } = await setup(t);
  assert.equal((await post('join', { name: '' })).status, 400);
  assert.equal((await post('join', { name: 'Pilot', code: 'ABCDEF' })).status, 404);
  assert.equal((await post('join', { name: 'Pilot' }, { Origin: 'https://other.invalid' })).status, 403);
  assert.equal((await post('join', null)).status, 400);
  assert.equal((await post('join', { name: 'Pilot', avatar: 'x'.repeat(17000) })).status, 413);
  const malformed = await fetch(`${base}/api/join`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await fetch(`${base}/api/events?id=missing&token=missing`)).status, 401);
});
