const crypto = require('crypto');
const { hashValue, nowIso, addHours, isExpired, generateToken } = require('./utils');

class SessionManager {
  constructor(store, options = {}) {
    this.store = store;
    this.ttlHours = options.ttlHours || 24 * 7;
  }

  createSession(userId, extra = {}) {
    const token = generateToken(32);
    const tokenHash = hashValue(token);
    const createdAt = nowIso();
    const expiresAt = addHours(new Date(), extra.ttlHours || this.ttlHours).toISOString();

    this.store.transaction((state) => {
      // remove expired sessions first
      state.sessions = state.sessions.filter((session) => !isExpired(session.expiresAt));
      state.sessions.push({
        id: crypto.randomUUID(),
        userId,
        tokenHash,
        createdAt,
        expiresAt
      });
    });

    return { token, expiresAt };
  }

  verify(token) {
    if (!token) return null;
    const tokenHash = hashValue(token);
    const state = this.store.snapshot();
    const session = state.sessions.find((item) => item.tokenHash === tokenHash);
    if (!session) return null;
    if (isExpired(session.expiresAt)) {
      this.invalidateById(session.id);
      return null;
    }
    return session;
  }

  invalidate(token) {
    if (!token) return;
    const tokenHash = hashValue(token);
    this.store.transaction((state) => {
      state.sessions = state.sessions.filter((session) => session.tokenHash !== tokenHash);
    });
  }

  invalidateById(id) {
    this.store.transaction((state) => {
      state.sessions = state.sessions.filter((session) => session.id !== id);
    });
  }
}

module.exports = { SessionManager };
