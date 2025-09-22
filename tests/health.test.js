const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../server/app');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

test('GET /api/health returns ok', async (t) => {
  const server = createApp();
  const address = await listen(server);
  t.after(() => close(server));

  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  assert.strictEqual(response.status, 200);

  const body = await response.json();
  assert.deepStrictEqual(body, { status: 'ok' });
});
