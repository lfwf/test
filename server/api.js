const { parseUrl, sendError } = require('./httpUtils');
const auth = require('./controllers/auth');
const profile = require('./controllers/profile');
const diary = require('./controllers/diary');
const match = require('./controllers/match');
const prompts = require('./controllers/prompts');

function createApiHandler(context) {
  return async (req, res) => {
    const url = parseUrl(req);
    try {
      if (req.method === 'POST' && url.pathname === '/api/auth/email/request-code') {
        await auth.requestEmailCode(req, res, context);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/email/verify') {
        await auth.verifyEmailCode(req, res, context);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/phone/request-code') {
        await auth.requestPhoneCode(req, res, context);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/phone/verify') {
        await auth.verifyPhoneCode(req, res, context);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/wechat/qrcode') {
        await auth.createWechatChallenge(req, res, context);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/wechat/confirm') {
        await auth.confirmWechatChallenge(req, res, context);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/auth/wechat/poll') {
        await auth.pollWechatChallenge(req, res, context);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/auth/session') {
        await auth.getSession(req, res, context);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/profile') {
        await profile.getProfile(req, res, context);
        return;
      }
      if (req.method === 'PUT' && url.pathname === '/api/profile') {
        await profile.updateProfile(req, res, context);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/diaries') {
        await diary.listDiaries(req, res, context);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/diaries') {
        await diary.createDiary(req, res, context);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/diaries/insights') {
        await diary.getInsights(req, res, context);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/match/request') {
        await match.requestMatch(req, res, context);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/match/reset') {
        await match.resetMatch(req, res, context);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/match/status') {
        await match.getStatus(req, res, context);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/match/partner-diaries') {
        await match.getPartnerDiaries(req, res, context);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/prompts/today') {
        await prompts.getToday(req, res, context);
        return;
      }

      sendError(res, 404, '接口不存在');
    } catch (err) {
      console.error('[api] error', err);
      if (!res.headersSent) {
        const statusCode = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
        sendError(res, statusCode, err.message || '服务器错误');
      } else {
        res.end();
      }
    }
  };
}

module.exports = { createApiHandler };
