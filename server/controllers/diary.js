const crypto = require('crypto');
const { sendJson, sendError, readJsonBody } = require('../httpUtils');
const { requireUser } = require('./common');
const { nowIso } = require('../utils');

const ALLOWED_MOODS = new Set(['sunny', 'reflective', 'stormy', 'hopeful', 'calm', 'nostalgic']);

function sanitizeDiary(entry) {
  return {
    id: entry.id,
    title: entry.title,
    content: entry.content,
    mood: entry.mood,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    shareWithMatch: Boolean(entry.shareWithMatch),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    entryDate: entry.entryDate,
    promptId: entry.promptId || null
  };
}

function ensureMood(value) {
  if (!value || typeof value !== 'string') return 'reflective';
  const normalized = value.trim().toLowerCase();
  return ALLOWED_MOODS.has(normalized) ? normalized : 'reflective';
}

function normalizeTags(input) {
  if (!Array.isArray(input)) return [];
  const set = new Set();
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().toLowerCase();
    if (!trimmed) continue;
    set.add(trimmed.slice(0, 30));
  }
  return Array.from(set);
}

function calculateStreak(entries) {
  const uniqueDates = new Set(entries.map((entry) => entry.entryDate.split('T')[0]));
  const today = new Date();
  let streak = 0;
  const dayMillis = 24 * 60 * 60 * 1000;
  let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  while (true) {
    const key = cursor.toISOString().split('T')[0];
    if (uniqueDates.has(key)) {
      streak += 1;
      cursor = new Date(cursor.getTime() - dayMillis);
    } else {
      break;
    }
  }
  return streak;
}

async function listDiaries(req, res, context) {
  const auth = requireUser(req, res, context);
  if (!auth) return;

  const entries = auth.state.diaries
    .filter((entry) => entry.userId === auth.user.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(sanitizeDiary);

  sendJson(res, 200, { diaries: entries });
}

async function createDiary(req, res, context) {
  const auth = requireUser(req, res, context);
  if (!auth) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, err.message || '无法解析请求');
    return;
  }

  if (!body || typeof body.content !== 'string' || !body.content.trim()) {
    sendError(res, 400, '日记内容不能为空');
    return;
  }

  const title = typeof body.title === 'string' && body.title.trim()
    ? body.title.trim().slice(0, 120)
    : body.content.trim().slice(0, 30) + '...';
  const mood = ensureMood(body.mood);
  const tags = normalizeTags(body.tags);
  const shareWithMatch = Boolean(body.shareWithMatch);
  const nowString = nowIso();

  const entryDate = (() => {
    if (typeof body.entryDate === 'string') {
      const date = new Date(body.entryDate);
      if (!Number.isNaN(date.getTime())) {
        return new Date(date.getTime()).toISOString();
      }
    }
    return nowString;
  })();

  const diary = {
    id: crypto.randomUUID(),
    userId: auth.user.id,
    title,
    content: body.content.trim(),
    mood,
    tags,
    shareWithMatch,
    createdAt: nowString,
    updatedAt: nowString,
    entryDate,
    promptId: typeof body.promptId === 'string' ? body.promptId : null
  };

  context.store.transaction((state) => {
    state.diaries.push(diary);
    const user = state.users.find((item) => item.id === auth.user.id);
    if (user) {
      user.updatedAt = nowString;
    }
  });

  sendJson(res, 201, { diary: sanitizeDiary(diary) });
}

async function getInsights(req, res, context) {
  const auth = requireUser(req, res, context);
  if (!auth) return;

  const entries = auth.state.diaries.filter((entry) => entry.userId === auth.user.id);
  const totalEntries = entries.length;
  const moodCounts = {};
  let shareable = 0;
  for (const entry of entries) {
    const mood = ensureMood(entry.mood);
    moodCounts[mood] = (moodCounts[mood] || 0) + 1;
    if (entry.shareWithMatch) shareable += 1;
  }

  const streak = calculateStreak(entries);

  sendJson(res, 200, {
    totalEntries,
    shareableEntries: shareable,
    moods: moodCounts,
    currentStreak: streak
  });
}

module.exports = {
  listDiaries,
  createDiary,
  getInsights,
  sanitizeDiary
};
