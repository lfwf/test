const crypto = require('crypto');
const { sendJson, sendError, readJsonBody } = require('../httpUtils');
const { requireUser } = require('./common');
const { sanitizeUser, normalizeMatchPreference } = require('./auth');
const { nowIso } = require('../utils');
const { sanitizeDiary } = require('./diary');

function preferenceMatches(preference, gender) {
  if (preference === 'any') return true;
  if (!gender || gender === 'secret') return false;
  return preference === gender;
}

function findActiveMatch(state, userId) {
  return state.matches.find(
    (match) => match.status === 'active' && (match.userAId === userId || match.userBId === userId)
  );
}

function resolvePartner(state, match, userId) {
  if (!match) return null;
  const partnerId = match.userAId === userId ? match.userBId : match.userAId;
  return state.users.find((user) => user.id === partnerId) || null;
}

async function getStatus(req, res, context) {
  const auth = requireUser(req, res, context);
  if (!auth) return;

  const match = findActiveMatch(auth.state, auth.user.id);
  if (!match) {
    sendJson(res, 200, {
      status: 'idle',
      preference: auth.user.matchPreference || 'any'
    });
    return;
  }

  const partner = resolvePartner(auth.state, match, auth.user.id);
  sendJson(res, 200, {
    status: 'matched',
    since: match.createdAt,
    partner: partner ? sanitizeUser(partner) : null
  });
}

async function requestMatch(req, res, context) {
  const auth = requireUser(req, res, context);
  if (!auth) return;

  if (!auth.user.gender || auth.user.gender === 'secret') {
    sendError(res, 400, '请先在个人资料中设置性别，以便匹配');
    return;
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (err) {
    body = {};
  }

  const desiredPreference = body.matchPreference
    ? normalizeMatchPreference(body.matchPreference)
    : auth.user.matchPreference || 'any';
  const forceNew = Boolean(body.forceNew);
  const nowString = nowIso();

  let result;
  try {
    result = context.store.transaction((state) => {
      const user = state.users.find((item) => item.id === auth.user.id);
      if (!user) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        throw error;
      }
      user.matchPreference = desiredPreference;
      user.updatedAt = nowString;

      const currentMatch = findActiveMatch(state, user.id);
      if (currentMatch && !forceNew) {
        const partner = resolvePartner(state, currentMatch, user.id);
        return { status: 'matched', match: currentMatch, partner };
      }

      if (currentMatch && forceNew) {
        currentMatch.status = 'ended';
        currentMatch.endedAt = nowString;
      }

      state.matchRequests = state.matchRequests.filter((request) => request.userId !== user.id);

      // try to find a candidate
      const candidate = state.matchRequests.find((request) => {
        if (request.userId === user.id) return false;
        if (!preferenceMatches(desiredPreference, request.gender)) return false;
        const candidateUser = state.users.find((item) => item.id === request.userId);
        if (!candidateUser) return false;
        if (!candidateUser.gender || candidateUser.gender === 'secret') return false;
        const candidatePreference = request.preference || candidateUser.matchPreference || 'any';
        if (!preferenceMatches(candidatePreference, user.gender)) {
          return false;
        }
        return true;
      });

      if (candidate) {
        const partnerUser = state.users.find((item) => item.id === candidate.userId);
        const match = {
          id: crypto.randomUUID(),
          userAId: user.id,
          userBId: candidate.userId,
          createdAt: nowString,
          status: 'active'
        };
        state.matches.push(match);
        state.matchRequests = state.matchRequests.filter((request) => request.id !== candidate.id);
        return { status: 'matched', match, partner: partnerUser };
      }

      const request = {
        id: crypto.randomUUID(),
        userId: user.id,
        gender: user.gender,
        preference: desiredPreference,
        createdAt: nowString
      };
      state.matchRequests.push(request);
      return { status: 'searching' };
    });
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, status, err.message || '匹配失败');
    return;
  }

  if (result.status === 'matched') {
    sendJson(res, 200, {
      status: 'matched',
      since: result.match.createdAt,
      partner: result.partner ? sanitizeUser(result.partner) : null
    });
  } else {
    sendJson(res, 200, {
      status: 'searching'
    });
  }
}

async function resetMatch(req, res, context) {
  const auth = requireUser(req, res, context);
  if (!auth) return;

  const nowString = nowIso();
  context.store.transaction((state) => {
    state.matchRequests = state.matchRequests.filter((item) => item.userId !== auth.user.id);
    const match = findActiveMatch(state, auth.user.id);
    if (match) {
      match.status = 'ended';
      match.endedAt = nowString;
    }
  });

  sendJson(res, 200, { status: 'idle' });
}

async function getPartnerDiaries(req, res, context) {
  const auth = requireUser(req, res, context);
  if (!auth) return;

  const match = findActiveMatch(auth.state, auth.user.id);
  if (!match) {
    sendJson(res, 200, { diaries: [] });
    return;
  }

  const partner = resolvePartner(auth.state, match, auth.user.id);
  if (!partner) {
    sendJson(res, 200, { diaries: [] });
    return;
  }

  const diaries = auth.state.diaries
    .filter((entry) => entry.userId === partner.id && entry.shareWithMatch)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(sanitizeDiary);

  sendJson(res, 200, {
    partner: sanitizeUser(partner),
    diaries
  });
}

module.exports = {
  getStatus,
  requestMatch,
  resetMatch,
  getPartnerDiaries
};
