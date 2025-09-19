const { sendJson } = require('../httpUtils');
const { requireUser } = require('./common');

function selectPrompt(prompts, seed) {
  if (!prompts.length) return null;
  let hash = 0;
  for (const char of seed) {
    hash = (hash + char.charCodeAt(0) * 31) % 2147483647;
  }
  const index = hash % prompts.length;
  return prompts[index];
}

async function getToday(req, res, context) {
  const auth = requireUser(req, res, context);
  if (!auth) return;

  const today = new Date().toISOString().split('T')[0];
  const prompts = auth.state.prompts || [];
  const prompt = selectPrompt(prompts, `${today}:${auth.user.id}`);

  if (!prompt) {
    sendJson(res, 200, {
      date: today,
      prompt: {
        id: 'default',
        title: '写下此刻最真实的情绪',
        description: '描述一下此刻在你脑海里盘旋的情绪与画面。'
      }
    });
    return;
  }

  sendJson(res, 200, {
    date: today,
    prompt
  });
}

module.exports = {
  getToday
};
