const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const { postJson } = require('./helpers/http');

test('email login flow issues token and session', async (t) => {
  const serverContext = await startTestServer();
  t.after(() => serverContext.close());

  const requestRes = await postJson(`${serverContext.baseUrl}/api/auth/email/request-code`, {
    email: 'tester@example.com'
  });
  assert.strictEqual(requestRes.status, 200);
  const requestData = await requestRes.json();
  assert.ok(requestData.challengeId);
  assert.ok(requestData.code);

  const verifyRes = await postJson(`${serverContext.baseUrl}/api/auth/email/verify`, {
    challengeId: requestData.challengeId,
    code: requestData.code,
    displayName: '测试用户',
    gender: 'female',
    matchPreference: 'male'
  });
  assert.strictEqual(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.ok(verifyData.token);
  assert.ok(verifyData.user);
  assert.strictEqual(verifyData.user.email, 'tester@example.com');
  assert.strictEqual(verifyData.user.gender, 'female');
  assert.strictEqual(verifyData.user.matchPreference, 'male');

  const sessionRes = await fetch(`${serverContext.baseUrl}/api/auth/session`, {
    headers: {
      Authorization: `Bearer ${verifyData.token}`
    }
  });
  assert.strictEqual(sessionRes.status, 200);
  const sessionData = await sessionRes.json();
  assert.strictEqual(sessionData.user.id, verifyData.user.id);
  assert.strictEqual(sessionData.user.email, 'tester@example.com');
});

test('phone login flow works independently', async (t) => {
  const serverContext = await startTestServer();
  t.after(() => serverContext.close());

  const requestRes = await postJson(`${serverContext.baseUrl}/api/auth/phone/request-code`, {
    phone: '+8613712345678'
  });
  assert.strictEqual(requestRes.status, 200);
  const requestData = await requestRes.json();
  assert.ok(requestData.code);

  const verifyRes = await postJson(`${serverContext.baseUrl}/api/auth/phone/verify`, {
    challengeId: requestData.challengeId,
    code: requestData.code,
    displayName: 'Phone User',
    matchPreference: 'any'
  });
  assert.strictEqual(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.ok(verifyData.token);
  assert.strictEqual(verifyData.user.phone, '+8613712345678');
  assert.strictEqual(verifyData.user.matchPreference, 'any');
});

test('wechat login challenge confirms and returns session', async (t) => {
  const serverContext = await startTestServer();
  t.after(() => serverContext.close());

  const createRes = await postJson(`${serverContext.baseUrl}/api/auth/wechat/qrcode`, {
    displayName: '灵感旅人',
    gender: 'male'
  });
  assert.strictEqual(createRes.status, 200);
  const challenge = await createRes.json();
  assert.ok(challenge.token);
  assert.ok(challenge.qrData);

  const pollPending = await fetch(`${serverContext.baseUrl}/api/auth/wechat/poll?token=${challenge.token}`);
  assert.strictEqual(pollPending.status, 200);
  const pollPendingData = await pollPending.json();
  assert.strictEqual(pollPendingData.status, 'pending');

  const confirmRes = await postJson(`${serverContext.baseUrl}/api/auth/wechat/confirm`, {
    token: challenge.token,
    wechatId: 'wechat-abc123',
    displayName: '灵感旅人',
    gender: 'male',
    matchPreference: 'female'
  });
  assert.strictEqual(confirmRes.status, 200);
  const confirmData = await confirmRes.json();
  assert.strictEqual(confirmData.status, 'confirmed');

  const pollRes = await fetch(`${serverContext.baseUrl}/api/auth/wechat/poll?token=${challenge.token}`);
  assert.strictEqual(pollRes.status, 200);
  const pollData = await pollRes.json();
  assert.strictEqual(pollData.status, 'confirmed');
  assert.ok(pollData.token);
  assert.ok(pollData.user);
  assert.strictEqual(pollData.user.wechatId, 'wechat-abc123');

  const sessionRes = await fetch(`${serverContext.baseUrl}/api/auth/session`, {
    headers: {
      Authorization: `Bearer ${pollData.token}`
    }
  });
  assert.strictEqual(sessionRes.status, 200);
  const sessionData = await sessionRes.json();
  assert.strictEqual(sessionData.user.wechatId, 'wechat-abc123');
});
