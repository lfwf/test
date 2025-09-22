const { sendJson, sendError, readJsonBody } = require('../httpUtils');
const { requireUser } = require('./common');
const { normalizeGender, normalizeMatchPreference, sanitizeUser } = require('./auth');
const { nowIso } = require('../utils');

async function getProfile(req, res, context) {
  const auth = requireUser(req, res, context);
  if (!auth) return;

  sendJson(res, 200, {
    user: auth.sanitized
  });
}

async function updateProfile(req, res, context) {
  const auth = requireUser(req, res, context);
  if (!auth) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, err.message || '无法解析请求');
    return;
  }

  const updates = {};
  if (typeof body.displayName === 'string') {
    const trimmed = body.displayName.trim();
    if (!trimmed) {
      sendError(res, 400, '昵称不能为空');
      return;
    }
    updates.displayName = trimmed.slice(0, 60);
  }
  if (typeof body.bio === 'string') {
    updates.bio = body.bio.trim().slice(0, 280);
  }
  if (body.gender) {
    updates.gender = normalizeGender(body.gender);
  }
  if (body.matchPreference) {
    updates.matchPreference = normalizeMatchPreference(body.matchPreference);
  }
  if (typeof body.timezone === 'string') {
    updates.timezone = body.timezone.trim().slice(0, 80);
  }
  if (typeof body.writingGoal === 'number') {
    updates.writingGoal = Math.max(0, Math.min(365, Math.floor(body.writingGoal)));
  }

  const nowString = nowIso();

  const result = context.store.transaction((state) => {
    const user = state.users.find((item) => item.id === auth.user.id);
    if (!user) {
      const error = new Error('用户不存在');
      error.statusCode = 404;
      throw error;
    }
    if (updates.displayName !== undefined) user.displayName = updates.displayName;
    if (updates.bio !== undefined) user.bio = updates.bio;
    if (updates.gender !== undefined) user.gender = updates.gender;
    if (updates.matchPreference !== undefined) user.matchPreference = updates.matchPreference;
    if (updates.timezone !== undefined) user.timezone = updates.timezone;
    if (updates.writingGoal !== undefined) user.writingGoal = updates.writingGoal;
    user.updatedAt = nowString;
    return { user };
  });

  const updated = sanitizeUser(result.user);
  sendJson(res, 200, {
    user: updated
  });
}

module.exports = {
  getProfile,
  updateProfile
};
