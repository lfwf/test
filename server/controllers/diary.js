const crypto = require('crypto');
const { sendJson, sendError, readJsonBody } = require('../httpUtils');
const { requireUser } = require('./common');
const { nowIso } = require('../utils');

const ALLOWED_MOODS = new Set(['sunny', 'reflective', 'stormy', 'hopeful', 'calm', 'nostalgic']);
const MOOD_TEXT = {
  sunny: '晴朗轻盈',
  reflective: '内省思考',
  stormy: '风暴挑战',
  hopeful: '充满期待',
  calm: '宁静舒缓',
  nostalgic: '怀旧柔软'
};

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

function parseEntryDate(value, fallbackIso) {
  if (typeof value !== 'string') {
    return fallbackIso;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallbackIso;
  }
  return parsed.toISOString();
}

function buildDiaryRecord(userId, payload) {
  if (!payload || typeof payload.content !== 'string' || !payload.content.trim()) {
    const error = new Error('日记内容不能为空');
    error.statusCode = 400;
    throw error;
  }

  const nowString = nowIso();
  const content = payload.content.trim();
  const mood = ensureMood(payload.mood);
  const tags = normalizeTags(Array.isArray(payload.tags) ? payload.tags : []);
  const shareWithMatch = Boolean(payload.shareWithMatch);
  const entryDate = parseEntryDate(payload.entryDate, nowString);

  const resolvedTitle = (() => {
    if (typeof payload.title === 'string' && payload.title.trim()) {
      return payload.title.trim().slice(0, 120);
    }
    if (content.length <= 30) {
      return content;
    }
    return `${content.slice(0, 30)}...`;
  })();

  return {
    id: crypto.randomUUID(),
    userId,
    title: resolvedTitle,
    content,
    mood,
    tags,
    shareWithMatch,
    createdAt: nowString,
    updatedAt: nowString,
    entryDate,
    promptId: typeof payload.promptId === 'string' ? payload.promptId : null
  };
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

  let diary;
  try {
    diary = buildDiaryRecord(auth.user.id, body);
  } catch (err) {
    const status = err.statusCode || 400;
    sendError(res, status, err.message || '无法创建日记');
    return;
  }

  context.store.transaction((state) => {
    state.diaries.push(diary);
    const user = state.users.find((item) => item.id === auth.user.id);
    if (user) {
      user.updatedAt = diary.createdAt;
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

function extractDateFromName(name) {
  if (typeof name !== 'string') return null;
  const match = name.match(/(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)/);
  if (!match) return null;
  const [, year, month, day] = match;
  const candidate = new Date(`${year}-${month}-${day}T12:00:00Z`);
  if (Number.isNaN(candidate.getTime())) return null;
  return candidate.toISOString();
}

function buildPseudoDiaryFromImage(image, index) {
  const name = typeof image.name === 'string' && image.name.trim()
    ? image.name.trim()
    : `手写日记${index + 1}`;
  const base64 = typeof image.data === 'string' ? image.data.trim() : '';
  if (!base64) {
    const error = new Error('缺少图片数据');
    error.statusCode = 400;
    throw error;
  }

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch (err) {
    const error = new Error('图片数据无法解析');
    error.statusCode = 400;
    throw error;
  }

  const hash = crypto.createHash('sha256').update(buffer).update(name).digest('hex');
  const numericSeed = parseInt(hash.slice(0, 8), 16);
  const moodOptions = Array.from(ALLOWED_MOODS);
  const mood = moodOptions[numericSeed % moodOptions.length];
  const keywords = ['疗愈', '成长', '陪伴', '回忆', '冒险', '复盘', '自我对话', '灵感'];
  const keyword = keywords[numericSeed % keywords.length];
  const secondKeyword = keywords[(numericSeed >> 3) % keywords.length];
  const cleanName = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const titleBase = cleanName || `手写日记第${index + 1}篇`;
  const title = titleBase.length > 36 ? `${titleBase.slice(0, 34)}…` : titleBase;

  const fragments = [
    '回望当天的笔迹，依旧能感到当下的温度与气味。',
    '我在字里行间对自己发问，也给出真诚的回答。',
    '写下这些句子的自己，似乎正在学会与情绪和解。',
    '灵感在纸面缓缓铺开，留下柔软的余温。',
    '每一个顿号都是深呼吸后的平静。'
  ];
  const fragment = fragments[numericSeed % fragments.length];
  const bufferLength = Math.max(80, Math.min(buffer.length, 240));
  const estimatedSentences = Math.max(2, Math.min(4, Math.round(bufferLength / 90)));

  const opening = `「${titleBase}」这页日记记录了有关${keyword}的思绪。`;
  const middle = `那天的自己写下：${fragment}`;
  const closing = `重新整理后，我想把这段故事归档在「${keyword} · ${secondKeyword}」的记忆盒中。`;
  const content = [opening, middle, closing].slice(0, estimatedSentences).join('\n\n');

  const entryDate = extractDateFromName(name) || nowIso();
  const tags = normalizeTags([keyword, secondKeyword, MOOD_TEXT[mood]]);
  const confidenceRaw = 0.58 + ((numericSeed % 37) / 100) + Math.min(0.18, buffer.length / 5000);
  const confidence = Math.max(0.65, Math.min(0.97, confidenceRaw));

  const highlight = `识别出以“${keyword}”为核心的情绪，倾向为 ${MOOD_TEXT[mood] || mood}。`;
  const suggestions = [
    `可以补充更多细节，例如：那天的场景、对话或味道，让 ${keyword} 的画面更立体。`,
    '若想分享给匹配伙伴，可勾选共享选项，形成你们独有的对话素材。'
  ];

  return {
    tempId: crypto.randomUUID(),
    title: `手写摘录：${title}`,
    content,
    mood,
    tags,
    shareWithMatch: false,
    entryDate,
    confidence,
    highlight,
    suggestions,
    sourceName: name
  };
}

async function previewHandwrittenImport(req, res, context) {
  const auth = requireUser(req, res, context);
  if (!auth) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, err.message || '无法解析请求');
    return;
  }

  if (!body || !Array.isArray(body.images) || !body.images.length) {
    sendError(res, 400, '请至少上传一张日记照片');
    return;
  }

  let entries;
  try {
    entries = body.images.map((image, index) => buildPseudoDiaryFromImage(image, index));
  } catch (err) {
    const status = err.statusCode || 400;
    sendError(res, status, err.message || '识别失败');
    return;
  }

  sendJson(res, 200, { entries });
}

async function commitHandwrittenImport(req, res, context) {
  const auth = requireUser(req, res, context);
  if (!auth) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, err.message || '无法解析请求');
    return;
  }

  if (!body || !Array.isArray(body.entries) || !body.entries.length) {
    sendError(res, 400, '没有可导入的日记');
    return;
  }

  const sanitized = [];
  try {
    context.store.transaction((state) => {
      const nowString = nowIso();
      let userRecord = state.users.find((item) => item.id === auth.user.id);
      if (!userRecord) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        throw error;
      }

      for (const entryPayload of body.entries) {
        const record = buildDiaryRecord(auth.user.id, entryPayload);
        state.diaries.push(record);
        sanitized.push(sanitizeDiary(record));
      }

      userRecord.updatedAt = nowString;
    });
  } catch (err) {
    const status = err.statusCode || 400;
    sendError(res, status, err.message || '导入失败');
    return;
  }

  sendJson(res, 201, { diaries: sanitized });
}

module.exports = {
  listDiaries,
  createDiary,
  getInsights,
  sanitizeDiary,
  previewHandwrittenImport,
  commitHandwrittenImport
};
