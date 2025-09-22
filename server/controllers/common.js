const { parseAuthHeader, sendError } = require('../httpUtils');
const { sanitizeUser } = require('./auth');

function requireUser(req, res, context) {
  const token = parseAuthHeader(req);
  if (!token) {
    sendError(res, 401, '未授权');
    return null;
  }
  const session = context.sessionManager.verify(token);
  if (!session) {
    sendError(res, 401, '会话已失效');
    return null;
  }
  const state = context.store.snapshot();
  const user = state.users.find((item) => item.id === session.userId);
  if (!user) {
    sendError(res, 404, '用户不存在');
    return null;
  }
  return { token, session, user, state, sanitized: sanitizeUser(user) };
}

module.exports = {
  requireUser
};
