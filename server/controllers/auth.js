const crypto = require('crypto');
const { sendJson, sendError, readJsonBody, parseUrl, parseAuthHeader } = require('../httpUtils');
const {
  generateOtpCode,
  hashValue,
  nowIso,
  addMinutes,
  isExpired
} = require('../utils');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-]{5,20}$/;
const MAX_ATTEMPTS = 5;
const LOGIN_EXP_MINUTES = 10;
const WECHAT_EXP_MINUTES = 5;

const ALLOWED_GENDERS = new Set(['male', 'female', 'non-binary', 'secret']);
const ALLOWED_MATCH = new Set(['any', 'male', 'female', 'non-binary']);

function normalizeGender(value) {
  if (!value || typeof value !== 'string') return 'secret';
  const normalized = value.trim().toLowerCase();
  return ALLOWED_GENDERS.has(normalized) ? normalized : 'secret';
}

function normalizeMatchPreference(value) {
  if (!value || typeof value !== 'string') return 'any';
  const normalized = value.trim().toLowerCase();
  return ALLOWED_MATCH.has(normalized) ? normalized : 'any';
}

function applyProfile(user, payload = {}) {
  if (payload.displayName && typeof payload.displayName === 'string') {
    const trimmed = payload.displayName.trim();
    if (trimmed) {
      user.displayName = trimmed.slice(0, 60);
    }
  }
  if (payload.bio && typeof payload.bio === 'string') {
    user.bio = payload.bio.trim().slice(0, 280);
  }
  if (payload.gender) {
    user.gender = normalizeGender(payload.gender);
  }
  if (payload.matchPreference) {
    user.matchPreference = normalizeMatchPreference(payload.matchPreference);
  }
}

function cleanupLoginChallenges(state) {
  state.loginChallenges = state.loginChallenges.filter((challenge) => {
    if (!challenge.expiresAt) return true;
    return !isExpired(challenge.expiresAt);
  });
}

function cleanupWechatChallenges(state) {
  state.wechatChallenges = state.wechatChallenges.filter((challenge) => {
    if (challenge.status === 'confirmed') return true;
    return !isExpired(challenge.expiresAt);
  });
}

function sanitizeUser(user) {
  return {
    id: user.id,
    displayName: user.displayName,
    gender: user.gender || 'secret',
    matchPreference: user.matchPreference || 'any',
    email: user.email || null,
    phone: user.phone || null,
    wechatId: user.wechatId || null,
    bio: user.bio || '',
    timezone: user.timezone || null,
    writingGoal: typeof user.writingGoal === 'number' ? user.writingGoal : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt
  };
}

async function requestEmailCode(req, res, context) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, err.message || '无法解析请求');
    return;
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    sendError(res, 400, '请输入有效的邮箱地址');
    return;
  }

  const code = generateOtpCode();
  const challenge = {
    id: crypto.randomUUID(),
    identifier: email,
    channel: 'email',
    codeHash: hashValue(code),
    createdAt: nowIso(),
    expiresAt: addMinutes(new Date(), LOGIN_EXP_MINUTES).toISOString(),
    attempts: 0
  };

  context.store.transaction((state) => {
    cleanupLoginChallenges(state);
    state.loginChallenges = state.loginChallenges.filter(
      (item) => !(item.channel === 'email' && item.identifier === email)
    );
    state.loginChallenges.push(challenge);
  });

  sendJson(res, 200, {
    challengeId: challenge.id,
    code,
    expiresAt: challenge.expiresAt
  });
}

async function verifyEmailCode(req, res, context) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, err.message || '无法解析请求');
    return;
  }

  const challengeId = String(body.challengeId || '').trim();
  const code = String(body.code || '').trim();
  if (!challengeId || !code) {
    sendError(res, 400, '缺少验证码或挑战信息');
    return;
  }

  let result;
  try {
    result = context.store.transaction((state) => {
      cleanupLoginChallenges(state);
      const challenge = state.loginChallenges.find((item) => item.id === challengeId);
      if (!challenge || challenge.channel !== 'email') {
        const error = new Error('验证码不存在或已失效');
        error.statusCode = 400;
        throw error;
      }
      if (isExpired(challenge.expiresAt)) {
        state.loginChallenges = state.loginChallenges.filter((item) => item.id !== challengeId);
        const error = new Error('验证码已过期，请重新获取');
        error.statusCode = 400;
        throw error;
      }
      if (hashValue(code) !== challenge.codeHash) {
        challenge.attempts = (challenge.attempts || 0) + 1;
        const remaining = Math.max(0, MAX_ATTEMPTS - challenge.attempts);
        if (challenge.attempts >= MAX_ATTEMPTS) {
          state.loginChallenges = state.loginChallenges.filter((item) => item.id !== challengeId);
        }
        const error = new Error(
          remaining
            ? `验证码错误，还可以尝试${remaining}次`
            : '验证码已失效，请重新获取'
        );
        error.statusCode = 401;
        throw error;
      }

      const nowString = nowIso();
      const email = challenge.identifier;
      let user = state.users.find((item) => item.email === email);
      if (!user) {
        user = {
          id: crypto.randomUUID(),
          createdAt: nowString,
          updatedAt: nowString,
          lastLoginAt: nowString,
          displayName: email.split('@')[0],
          email,
          phone: null,
          wechatId: null,
          gender: 'secret',
          matchPreference: 'any',
          bio: ''
        };
        state.users.push(user);
      } else {
        user.updatedAt = nowString;
        user.lastLoginAt = nowString;
      }

      applyProfile(user, body);
      user.email = email;

      state.loginChallenges = state.loginChallenges.filter((item) => item.id !== challengeId);

      return { user: sanitizeUser(user) };
    });
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, status, err.message || '邮箱登录失败');
    return;
  }

  const session = context.sessionManager.createSession(result.user.id);
  sendJson(res, 200, {
    token: session.token,
    expiresAt: session.expiresAt,
    user: result.user
  });
}

async function requestPhoneCode(req, res, context) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, err.message || '无法解析请求');
    return;
  }

  const phone = String(body.phone || '').trim();
  if (!PHONE_REGEX.test(phone)) {
    sendError(res, 400, '请输入有效的手机号');
    return;
  }

  const code = generateOtpCode();
  const challenge = {
    id: crypto.randomUUID(),
    identifier: phone,
    channel: 'phone',
    codeHash: hashValue(code),
    createdAt: nowIso(),
    expiresAt: addMinutes(new Date(), LOGIN_EXP_MINUTES).toISOString(),
    attempts: 0
  };

  context.store.transaction((state) => {
    cleanupLoginChallenges(state);
    state.loginChallenges = state.loginChallenges.filter(
      (item) => !(item.channel === 'phone' && item.identifier === phone)
    );
    state.loginChallenges.push(challenge);
  });

  sendJson(res, 200, {
    challengeId: challenge.id,
    code,
    expiresAt: challenge.expiresAt
  });
}

async function verifyPhoneCode(req, res, context) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, err.message || '无法解析请求');
    return;
  }

  const challengeId = String(body.challengeId || '').trim();
  const code = String(body.code || '').trim();
  if (!challengeId || !code) {
    sendError(res, 400, '缺少验证码或挑战信息');
    return;
  }

  let result;
  try {
    result = context.store.transaction((state) => {
      cleanupLoginChallenges(state);
      const challenge = state.loginChallenges.find((item) => item.id === challengeId);
      if (!challenge || challenge.channel !== 'phone') {
        const error = new Error('验证码不存在或已失效');
        error.statusCode = 400;
        throw error;
      }
      if (isExpired(challenge.expiresAt)) {
        state.loginChallenges = state.loginChallenges.filter((item) => item.id !== challengeId);
        const error = new Error('验证码已过期，请重新获取');
        error.statusCode = 400;
        throw error;
      }
      if (hashValue(code) !== challenge.codeHash) {
        challenge.attempts = (challenge.attempts || 0) + 1;
        const remaining = Math.max(0, MAX_ATTEMPTS - challenge.attempts);
        if (challenge.attempts >= MAX_ATTEMPTS) {
          state.loginChallenges = state.loginChallenges.filter((item) => item.id !== challengeId);
        }
        const error = new Error(
          remaining
            ? `验证码错误，还可以尝试${remaining}次`
            : '验证码已失效，请重新获取'
        );
        error.statusCode = 401;
        throw error;
      }

      const nowString = nowIso();
      const phone = challenge.identifier;
      let user = state.users.find((item) => item.phone === phone);
      if (!user) {
        user = {
          id: crypto.randomUUID(),
          createdAt: nowString,
          updatedAt: nowString,
          lastLoginAt: nowString,
          displayName: `手机用户${phone.slice(-4)}`,
          email: null,
          phone,
          wechatId: null,
          gender: 'secret',
          matchPreference: 'any',
          bio: ''
        };
        state.users.push(user);
      } else {
        user.updatedAt = nowString;
        user.lastLoginAt = nowString;
      }

      applyProfile(user, body);
      user.phone = phone;

      state.loginChallenges = state.loginChallenges.filter((item) => item.id !== challengeId);

      return { user: sanitizeUser(user) };
    });
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, status, err.message || '手机号登录失败');
    return;
  }

  const session = context.sessionManager.createSession(result.user.id);
  sendJson(res, 200, {
    token: session.token,
    expiresAt: session.expiresAt,
    user: result.user
  });
}

async function createWechatChallenge(req, res, context) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (err) {
    body = {};
  }

  const nowString = nowIso();
  const token = crypto.randomUUID();
  const challenge = {
    id: crypto.randomUUID(),
    token,
    status: 'pending',
    createdAt: nowString,
    expiresAt: addMinutes(new Date(), WECHAT_EXP_MINUTES).toISOString(),
    metadata: {
      displayNameHint:
        typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 60) : '',
      genderHint: normalizeGender(body.gender)
    },
    sessionToken: null,
    sessionExpiresAt: null,
    userId: null,
    wechatId: null
  };

  context.store.transaction((state) => {
    cleanupWechatChallenges(state);
    state.wechatChallenges.push(challenge);
  });

  sendJson(res, 200, {
    token,
    qrData: `wechat-login:${token}`,
    expiresAt: challenge.expiresAt
  });
}

async function confirmWechatChallenge(req, res, context) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, err.message || '无法解析请求');
    return;
  }

  const token = String(body.token || '').trim();
  const wechatId = String(body.wechatId || '').trim() || null;
  if (!token) {
    sendError(res, 400, '缺少token');
    return;
  }
  if (!wechatId) {
    sendError(res, 400, '缺少微信标识');
    return;
  }

  let result;
  try {
    result = context.store.transaction((state) => {
      cleanupWechatChallenges(state);
      const challenge = state.wechatChallenges.find((item) => item.token === token);
      if (!challenge) {
        const error = new Error('登录请求不存在或已过期');
        error.statusCode = 404;
        throw error;
      }
      if (challenge.status === 'confirmed') {
        const user = state.users.find((item) => item.id === challenge.userId);
        if (!user) {
          const error = new Error('匹配用户不存在');
          error.statusCode = 404;
          throw error;
        }
        return { user: sanitizeUser(user), alreadyConfirmed: true };
      }
      if (isExpired(challenge.expiresAt)) {
        const error = new Error('二维码已过期，请重新扫码');
        error.statusCode = 400;
        throw error;
      }

      const nowString = nowIso();
      let user = state.users.find((item) => item.wechatId === wechatId);
      if (!user) {
        user = {
          id: crypto.randomUUID(),
          createdAt: nowString,
          updatedAt: nowString,
          lastLoginAt: nowString,
          displayName:
            typeof body.displayName === 'string' && body.displayName.trim()
              ? body.displayName.trim().slice(0, 60)
              : `微信用户${wechatId.slice(-4)}`,
          email: null,
          phone: null,
          wechatId,
          gender: normalizeGender(body.gender),
          matchPreference: normalizeMatchPreference(body.matchPreference),
          bio: typeof body.bio === 'string' ? body.bio.trim().slice(0, 280) : ''
        };
        state.users.push(user);
      } else {
        user.updatedAt = nowString;
        user.lastLoginAt = nowString;
      }

      applyProfile(user, body);
      user.wechatId = wechatId;

      challenge.status = 'confirmed';
      challenge.confirmedAt = nowString;
      challenge.userId = user.id;
      challenge.wechatId = wechatId;

      return { user: sanitizeUser(user) };
    });
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, status, err.message || '确认失败');
    return;
  }

  const session = context.sessionManager.createSession(result.user.id);
  context.store.transaction((state) => {
    const challenge = state.wechatChallenges.find((item) => item.token === token);
    if (challenge) {
      challenge.sessionToken = session.token;
      challenge.sessionExpiresAt = session.expiresAt;
    }
  });

  sendJson(res, 200, { status: 'confirmed' });
}

async function pollWechatChallenge(req, res, context) {
  const url = parseUrl(req);
  const token = String(url.searchParams.get('token') || '').trim();
  if (!token) {
    sendError(res, 400, '缺少token');
    return;
  }

  const state = context.store.snapshot();
  const challenge = state.wechatChallenges.find((item) => item.token === token);
  if (!challenge) {
    sendJson(res, 200, { status: 'not_found' });
    return;
  }

  if (challenge.status !== 'confirmed') {
    if (isExpired(challenge.expiresAt)) {
      sendJson(res, 200, { status: 'expired' });
    } else {
      sendJson(res, 200, { status: 'pending' });
    }
    return;
  }

  const user = state.users.find((item) => item.id === challenge.userId);
  if (!user || !challenge.sessionToken) {
    sendJson(res, 200, { status: 'pending' });
    return;
  }

  sendJson(res, 200, {
    status: 'confirmed',
    token: challenge.sessionToken,
    expiresAt: challenge.sessionExpiresAt,
    user: sanitizeUser(user)
  });
}

async function getSession(req, res, context) {
  const token = parseAuthHeader(req);
  if (!token) {
    sendError(res, 401, '未授权');
    return;
  }

  const session = context.sessionManager.verify(token);
  if (!session) {
    sendError(res, 401, '会话已失效');
    return;
  }

  const state = context.store.snapshot();
  const user = state.users.find((item) => item.id === session.userId);
  if (!user) {
    sendError(res, 404, '用户不存在');
    return;
  }

  sendJson(res, 200, {
    token,
    expiresAt: session.expiresAt,
    user: sanitizeUser(user)
  });
}

module.exports = {
  requestEmailCode,
  verifyEmailCode,
  requestPhoneCode,
  verifyPhoneCode,
  createWechatChallenge,
  confirmWechatChallenge,
  pollWechatChallenge,
  getSession,
  sanitizeUser,
  normalizeGender,
  normalizeMatchPreference
};
