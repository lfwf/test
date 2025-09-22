const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const { postJson, putJson, getJson } = require('./helpers/http');

async function createEmailUser(baseUrl, email, profile = {}) {
  const requestRes = await postJson(`${baseUrl}/api/auth/email/request-code`, { email });
  const requestData = await requestRes.json();
  const verifyRes = await postJson(`${baseUrl}/api/auth/email/verify`, {
    challengeId: requestData.challengeId,
    code: requestData.code,
    ...profile
  });
  const verifyData = await verifyRes.json();
  return verifyData;
}

test('diary creation, insights and daily prompt work', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const login = await createEmailUser(server.baseUrl, 'writer@example.com', {
    displayName: '灵感收集者'
  });
  const token = login.token;

  const updateRes = await putJson(`${server.baseUrl}/api/profile`, {
    displayName: '灵感收集者',
    bio: '记录灵魂的余温',
    gender: 'male',
    matchPreference: 'female'
  }, token);
  assert.strictEqual(updateRes.status, 200);

  const diaryRes = await postJson(`${server.baseUrl}/api/diaries`, {
    title: '星空下的自白',
    content: '今夜的风很轻，像是在提醒我不要忘记初心。',
    mood: 'hopeful',
    tags: ['星空', '初心'],
    shareWithMatch: true
  }, token);
  assert.strictEqual(diaryRes.status, 201);

  const diaryRes2 = await postJson(`${server.baseUrl}/api/diaries`, {
    content: '对自己诚实，是我给出的承诺。',
    mood: 'reflective',
    shareWithMatch: false
  }, token);
  assert.strictEqual(diaryRes2.status, 201);

  const listRes = await getJson(`${server.baseUrl}/api/diaries`, token);
  assert.strictEqual(listRes.status, 200);
  const listData = await listRes.json();
  assert.strictEqual(listData.diaries.length, 2);

  const insightRes = await getJson(`${server.baseUrl}/api/diaries/insights`, token);
  assert.strictEqual(insightRes.status, 200);
  const insights = await insightRes.json();
  assert.strictEqual(insights.totalEntries, 2);
  assert.strictEqual(insights.shareableEntries, 1);
  assert.ok(insights.moods.hopeful >= 1);

  const promptRes = await getJson(`${server.baseUrl}/api/prompts/today`, token);
  assert.strictEqual(promptRes.status, 200);
  const promptData = await promptRes.json();
  assert.ok(promptData.prompt);
  assert.ok(promptData.prompt.title);
});

test('matching pairs users and shares diaries', async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const alice = await createEmailUser(server.baseUrl, 'alice@example.com', {
    displayName: 'Alice'
  });
  const bob = await createEmailUser(server.baseUrl, 'bob@example.com', {
    displayName: 'Bob'
  });

  await putJson(`${server.baseUrl}/api/profile`, {
    gender: 'female',
    matchPreference: 'male',
    bio: '期待与灵魂共鸣'
  }, alice.token);

  await putJson(`${server.baseUrl}/api/profile`, {
    gender: 'male',
    matchPreference: 'female',
    bio: '寻找志同道合的伙伴'
  }, bob.token);

  await postJson(`${server.baseUrl}/api/diaries`, {
    content: '星海里的答案要和人分享才有意义。',
    mood: 'sunny',
    shareWithMatch: true
  }, alice.token);

  await postJson(`${server.baseUrl}/api/diaries`, {
    content: '今天学会了慢下来听自己的心跳。',
    mood: 'calm',
    shareWithMatch: true
  }, bob.token);

  const aliceMatch = await postJson(`${server.baseUrl}/api/match/request`, {
    matchPreference: 'male'
  }, alice.token);
  const aliceMatchData = await aliceMatch.json();
  assert.strictEqual(aliceMatchData.status, 'searching');

  const bobMatch = await postJson(`${server.baseUrl}/api/match/request`, {
    matchPreference: 'female'
  }, bob.token);
  const bobMatchData = await bobMatch.json();
  assert.strictEqual(bobMatchData.status, 'matched');
  assert.ok(bobMatchData.partner);
  assert.strictEqual(bobMatchData.partner.displayName, 'Alice');

  const aliceStatusRes = await getJson(`${server.baseUrl}/api/match/status`, alice.token);
  const aliceStatus = await aliceStatusRes.json();
  assert.strictEqual(aliceStatus.status, 'matched');
  assert.ok(aliceStatus.partner);

  const alicePartnerDiariesRes = await getJson(`${server.baseUrl}/api/match/partner-diaries`, alice.token);
  const alicePartnerDiaries = await alicePartnerDiariesRes.json();
  assert.ok(Array.isArray(alicePartnerDiaries.diaries));
  assert.strictEqual(alicePartnerDiaries.diaries.length, 1);

  const resetRes = await postJson(`${server.baseUrl}/api/match/reset`, {}, alice.token);
  assert.strictEqual(resetRes.status, 200);
  const statusAfterReset = await getJson(`${server.baseUrl}/api/match/status`, alice.token);
  const resetData = await statusAfterReset.json();
  assert.strictEqual(resetData.status, 'idle');
});
