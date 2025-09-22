(() => {
  const state = {
    token: null,
    user: null,
    diaries: [],
    insights: null,
    match: null,
    partner: null,
    partnerDiaries: [],
    prompt: null
  };

  let emailChallenge = null;
  let phoneChallenge = null;
  let currentWechat = null;
  let wechatPollTimer = null;

  const elements = {
    authSection: document.getElementById('auth-section'),
    dashboard: document.getElementById('dashboard'),
    dashboardTabs: document.getElementById('dashboard-tabs'),
    viewButtons: document.querySelectorAll('[data-view-target]'),
    viewContainers: document.querySelectorAll('.dashboard-view'),
    dashboardGreeting: document.getElementById('dashboard-greeting'),
    dashboardSubtitle: document.getElementById('dashboard-subtitle'),
    toast: document.getElementById('toast'),
    emailRequestForm: document.getElementById('email-request-form'),
    emailVerifyForm: document.getElementById('email-verify-form'),
    emailCodeDisplay: document.getElementById('email-code-display'),
    phoneRequestForm: document.getElementById('phone-request-form'),
    phoneVerifyForm: document.getElementById('phone-verify-form'),
    phoneCodeDisplay: document.getElementById('phone-code-display'),
    wechatGenerate: document.getElementById('wechat-generate'),
    wechatQr: document.getElementById('wechat-qr'),
    wechatToken: document.getElementById('wechat-token'),
    wechatSimulator: document.getElementById('wechat-simulator'),
    wechatConfirm: document.getElementById('wechat-confirm'),
    profileForm: document.getElementById('profile-form'),
    diaryForm: document.getElementById('diary-form'),
    diaryList: document.getElementById('diary-list'),
    diaryInsights: document.getElementById('diary-insights'),
    promptContent: document.getElementById('prompt-content'),
    matchStatus: document.getElementById('match-status'),
    matchRequest: document.getElementById('match-request'),
    matchReset: document.getElementById('match-reset'),
    partnerDiaries: document.getElementById('partner-diaries'),
    overviewLatest: document.getElementById('overview-latest')
  };

  let activeView = 'overview';

  function switchView(view) {
    if (!view) return;
    activeView = view;
    Array.from(elements.viewContainers || []).forEach((section) => {
      if (!section) return;
      section.classList.toggle('active', section.dataset.view === view);
    });
    Array.from(elements.viewButtons || []).forEach((button) => {
      if (!button) return;
      button.classList.toggle('active', button.dataset.viewTarget === view);
    });
  }

  function updateDashboardMeta() {
    if (!elements.dashboardGreeting || !elements.dashboardSubtitle) {
      return;
    }
    const name = state.user && state.user.displayName ? state.user.displayName : '灵魂旅人';
    elements.dashboardGreeting.textContent = `${name} 的灵感空间`;
    let message = '在「概览、写日记、灵魂匹配、个人资料」之间切换，轻松掌握节奏。';
    if (state.insights && typeof state.insights.totalEntries === 'number') {
      const total = state.insights.totalEntries;
      const streak = state.insights.currentStreak || 0;
      if (total > 0) {
        message = `已记录 ${total} 篇日记，连续 ${streak} 天。保持节奏，继续加油。`;
      }
    }
    if (state.match) {
      if (state.match.status === 'matched') {
        const partnerName = state.match.partner && state.match.partner.displayName
          ? state.match.partner.displayName
          : '同频伙伴';
        message = `你与 ${partnerName} 正在共享灵感，记得常去看看彼此的日记。`;
      } else if (state.match.status === 'searching') {
        message = '匹配正在进行中，稍候片刻让缘分悄悄靠近。';
      }
    }
    elements.dashboardSubtitle.textContent = message;
  }

  function toast(message, type = 'info') {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.className = type === 'info' ? '' : type;
    elements.toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      elements.toast.style.display = 'none';
    }, 3200);
  }

  async function authFetch(url, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const init = Object.assign({}, options, { headers });
    return fetch(url, init);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return char;
      }
    });
  }

  function showDashboard() {
    elements.authSection.classList.add('hidden');
    elements.dashboard.classList.remove('hidden');
    switchView('overview');
    updateDashboardMeta();
  }

  function showAuth() {
    elements.dashboard.classList.add('hidden');
    elements.authSection.classList.remove('hidden');
  }

  async function handleEmailRequest(event) {
    event.preventDefault();
    const input = document.getElementById('email-input');
    if (!input.value) return;
    try {
      const response = await fetch('/api/auth/email/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input.value.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '发送失败');
      emailChallenge = { id: data.challengeId, email: input.value.trim() };
      elements.emailCodeDisplay.textContent = `验证码（演示用）：${data.code}`;
      toast('验证码已生成，请查看提示', 'success');
    } catch (err) {
      toast(err.message || '发送失败', 'error');
    }
  }

  async function handleEmailVerify(event) {
    event.preventDefault();
    if (!emailChallenge) {
      toast('请先获取验证码', 'error');
      return;
    }
    const code = document.getElementById('email-code').value.trim();
    const displayName = document.getElementById('email-name').value.trim();
    const gender = document.getElementById('email-gender').value;
    const preference = document.getElementById('email-preference').value;
    try {
      const response = await fetch('/api/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: emailChallenge.id,
          code,
          displayName,
          gender,
          matchPreference: preference
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '登录失败');
      await onLogin(data);
      toast('邮箱登录成功，欢迎回来', 'success');
    } catch (err) {
      toast(err.message || '登录失败', 'error');
    }
  }

  async function handlePhoneRequest(event) {
    event.preventDefault();
    const phone = document.getElementById('phone-input').value.trim();
    if (!phone) return;
    try {
      const response = await fetch('/api/auth/phone/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '发送失败');
      phoneChallenge = { id: data.challengeId, phone };
      elements.phoneCodeDisplay.textContent = `验证码（演示用）：${data.code}`;
      toast('验证码已发送', 'success');
    } catch (err) {
      toast(err.message || '发送失败', 'error');
    }
  }

  async function handlePhoneVerify(event) {
    event.preventDefault();
    if (!phoneChallenge) {
      toast('请先获取验证码', 'error');
      return;
    }
    const code = document.getElementById('phone-code').value.trim();
    const displayName = document.getElementById('phone-name').value.trim();
    try {
      const response = await fetch('/api/auth/phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: phoneChallenge.id,
          code,
          displayName
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '登录失败');
      await onLogin(data);
      toast('手机号登录成功', 'success');
    } catch (err) {
      toast(err.message || '登录失败', 'error');
    }
  }

  function renderPseudoQr(token) {
    elements.wechatQr.innerHTML = '';
    const size = 12;
    let hash = 0;
    for (let i = 0; i < size * size; i += 1) {
      hash = (hash * 131 + token.charCodeAt(i % token.length)) % 9973;
      const cell = document.createElement('div');
      cell.className = 'qr-cell' + (hash % 2 ? ' active' : '');
      elements.wechatQr.appendChild(cell);
    }
  }

  function clearWechatPolling() {
    if (wechatPollTimer) {
      clearInterval(wechatPollTimer);
      wechatPollTimer = null;
    }
  }

  async function generateWechat() {
    clearWechatPolling();
    elements.wechatQr.classList.add('hidden');
    elements.wechatSimulator.classList.add('hidden');
    elements.wechatToken.textContent = '';
    try {
      const response = await fetch('/api/auth/wechat/qrcode', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '生成失败');
      currentWechat = data;
      elements.wechatQr.classList.remove('hidden');
      elements.wechatSimulator.classList.remove('hidden');
      elements.wechatToken.textContent = `调试 token：${data.token}`;
      renderPseudoQr(data.token);
      toast('微信二维码已生成，点击“模拟扫码确认”完成登录', 'info');
      wechatPollTimer = setInterval(() => pollWechat(data.token), 2000);
    } catch (err) {
      toast(err.message || '生成失败', 'error');
    }
  }

  async function pollWechat(token) {
    try {
      const response = await fetch(`/api/auth/wechat/poll?token=${encodeURIComponent(token)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '轮询失败');
      if (data.status === 'confirmed') {
        clearWechatPolling();
        await onLogin(data);
        toast('微信登录成功', 'success');
      } else if (data.status === 'expired') {
        clearWechatPolling();
        toast('二维码已过期，请重新生成', 'error');
      }
    } catch (err) {
      clearWechatPolling();
      toast(err.message || '轮询失败', 'error');
    }
  }

  async function confirmWechat() {
    if (!currentWechat) {
      toast('请先生成二维码', 'error');
      return;
    }
    const nicknameInput = document.getElementById('wechat-nickname');
    const genderInput = document.getElementById('wechat-gender');
    const nickname = nicknameInput.value.trim() || '微信旅人';
    const gender = genderInput.value;
    try {
      const response = await fetch('/api/auth/wechat/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: currentWechat.token,
          wechatId: `wechat-${Math.random().toString(36).slice(2, 10)}`,
          displayName: nickname,
          gender,
          matchPreference: 'any'
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '确认失败');
      toast('已模拟扫码，请等待桌面端自动登录', 'success');
    } catch (err) {
      toast(err.message || '确认失败', 'error');
    }
  }

  async function onLogin(payload) {
    state.token = payload.token;
    state.user = payload.user;
    localStorage.setItem('soulsync_token', state.token);
    showDashboard();
    renderProfile();
    await Promise.all([loadPrompt(), loadDiaries(), loadInsights(), loadMatch()]);
  }

  function renderProfile() {
    if (!state.user) return;
    document.getElementById('profile-name').value = state.user.displayName || '';
    document.getElementById('profile-gender').value = state.user.gender || 'secret';
    document.getElementById('profile-preference').value = state.user.matchPreference || 'any';
    document.getElementById('profile-bio').value = state.user.bio || '';
    updateDashboardMeta();
  }

  async function loadPrompt() {
    try {
      const response = await authFetch('/api/prompts/today');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '加载失败');
      state.prompt = data.prompt;
      renderPrompt();
    } catch (err) {
      const message = err && err.message ? err.message : '暂时无法加载提示';
      elements.promptContent.innerHTML = `<p class="hint">${escapeHtml(message)}</p>`;
    }
  }

  function renderPrompt() {
    if (!state.prompt) return;
    elements.promptContent.innerHTML = `
      <h4>${escapeHtml(state.prompt.title)}</h4>
      <p>${escapeHtml(state.prompt.description)}</p>
      <small class="hint">灵感主题：${escapeHtml(state.prompt.mood || 'mood')}</small>
    `;
  }

  async function loadDiaries() {
    try {
      const response = await authFetch('/api/diaries');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '加载失败');
      state.diaries = data.diaries || [];
      renderDiaries();
    } catch (err) {
      const message = err && err.message ? err.message : '暂时无法加载日记';
      if (elements.diaryList) {
        elements.diaryList.innerHTML = `<p class="hint">${escapeHtml(message)}</p>`;
      }
      if (elements.overviewLatest) {
        elements.overviewLatest.innerHTML = `<p class="hint">${escapeHtml(message)}</p>`;
      }
    }
  }

  function renderDiaries() {
    if (!state.diaries.length) {
      elements.diaryList.innerHTML = '<p class="hint">还没有日记，写下第一篇吧。</p>';
      if (elements.overviewLatest) {
        elements.overviewLatest.innerHTML = '<p class="hint">写下你的第一篇日记，最新内容会出现在这里。</p>';
      }
      return;
    }
    elements.diaryList.innerHTML = '';
    state.diaries.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'diary-item';
      const tags = (entry.tags || [])
        .map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`)
        .join('');
      const shareText = entry.shareWithMatch ? '<span class="tag">共享</span>' : '';
      const moodTag = `<span class="tag">${escapeHtml(entry.mood)}</span>`;
      item.innerHTML = `
        <h4>${escapeHtml(entry.title || '无题日记')}</h4>
        <p>${escapeHtml(entry.content)}</p>
        <div>${shareText}${moodTag}${tags}</div>
        <small class="hint">${new Date(entry.createdAt).toLocaleString()}</small>
      `;
      elements.diaryList.appendChild(item);
    });
    if (elements.overviewLatest) {
      const latest = state.diaries[0];
      if (latest) {
        const excerpt = latest.content.length > 120
          ? `${latest.content.slice(0, 120)}…`
          : latest.content;
        const moodTag = `<span class="tag">${escapeHtml(latest.mood)}</span>`;
        const shareTag = latest.shareWithMatch ? '<span class="tag">共享</span>' : '';
        const tagList = (latest.tags || [])
          .map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`)
          .join('');
        elements.overviewLatest.innerHTML = `
          <p class="hint">最近更新</p>
          <h4>${escapeHtml(latest.title || '无题日记')}</h4>
          <p>${escapeHtml(excerpt)}</p>
          <div class="latest-meta">${shareTag}${moodTag}${tagList}</div>
          <small class="hint">${new Date(latest.createdAt).toLocaleString()}</small>
        `;
      }
    }
  }

  async function loadInsights() {
    try {
      const response = await authFetch('/api/diaries/insights');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '加载失败');
      state.insights = data;
      renderInsights();
    } catch (err) {
      if (elements.diaryInsights) {
        const message = err && err.message ? err.message : '暂时无法获取数据';
        elements.diaryInsights.innerHTML = `<p class="hint">${escapeHtml(message)}</p>`;
      }
      updateDashboardMeta();
    }
  }

  function renderInsights() {
    if (!elements.diaryInsights) return;
    if (!state.insights) {
      elements.diaryInsights.innerHTML = '<p class="hint">记录几天后，这里会看到你的写作统计。</p>';
      updateDashboardMeta();
      return;
    }
    const total = state.insights.totalEntries || 0;
    const streak = state.insights.currentStreak || 0;
    const shareable = state.insights.shareableEntries || 0;
    const moodSegments = Object.entries(state.insights.moods || {})
      .map(([mood, count]) => `${escapeHtml(mood)} × ${count}`);
    const moodText = moodSegments.length ? moodSegments.join(' · ') : '暂无心情记录';
    elements.diaryInsights.innerHTML = `
      <div class="insight-stats">
        <div class="insight-card">
          <span class="insight-value">${total}</span>
          <span class="insight-label">累计日记</span>
        </div>
        <div class="insight-card">
          <span class="insight-value">${streak}</span>
          <span class="insight-label">连续天数</span>
        </div>
        <div class="insight-card">
          <span class="insight-value">${shareable}</span>
          <span class="insight-label">共享篇数</span>
        </div>
      </div>
      <p class="hint insight-moods">心情分布：${moodText}</p>
    `;
    updateDashboardMeta();
  }

  async function loadMatch() {
    try {
      const response = await authFetch('/api/match/status');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '加载失败');
      state.match = data;
      renderMatch();
      if (data.status === 'matched') {
        await loadPartnerDiaries();
      } else {
        renderPartnerDiaries();
      }
    } catch (err) {
      if (elements.matchStatus) {
        elements.matchStatus.textContent = err.message || '暂时无法加载匹配状态';
      }
      updateDashboardMeta();
    }
  }

  function renderMatch() {
    if (!state.match) {
      updateDashboardMeta();
      return;
    }
    if (state.match.status === 'matched') {
      const partnerName = state.match.partner && state.match.partner.displayName
        ? escapeHtml(state.match.partner.displayName)
        : '神秘伙伴';
      elements.matchStatus.innerHTML = `<span class="status-pill">已匹配</span> 已与 <strong>${partnerName}</strong> 互通心事。`;
    } else if (state.match.status === 'searching') {
      elements.matchStatus.innerHTML = '<span class="status-pill searching">匹配中</span> 正在寻找与你共鸣的灵魂...';
    } else {
      elements.matchStatus.textContent = '准备好遇见同频的心了吗？更新资料后发起匹配试试。';
    }
    updateDashboardMeta();
  }

  async function loadPartnerDiaries() {
    try {
      const response = await authFetch('/api/match/partner-diaries');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '加载失败');
      state.partner = data.partner || null;
      state.partnerDiaries = data.diaries || [];
      renderPartnerDiaries();
    } catch (err) {
      const message = err && err.message ? err.message : '暂时无法获取对方日记';
      elements.partnerDiaries.innerHTML = `<p class="hint">${escapeHtml(message)}</p>`;
    }
  }

  function renderPartnerDiaries() {
    if (!state.partner || !state.partnerDiaries.length) {
      elements.partnerDiaries.innerHTML = '<p class="hint">匹配成功后，对方共享的日记会出现在这里。</p>';
      return;
    }
    const partnerName = state.partner && state.partner.displayName
      ? escapeHtml(state.partner.displayName)
      : '神秘伙伴';
    const header = `<p class="hint">来自 <strong>${partnerName}</strong> 的心事：</p>`;
    const items = state.partnerDiaries
      .map((entry) => `
        <div class="diary-item">
          <h4>${escapeHtml(entry.title || '无题日记')}</h4>
          <p>${escapeHtml(entry.content)}</p>
          <small class="hint">${new Date(entry.createdAt).toLocaleString()}</small>
        </div>
      `)
      .join('');
    elements.partnerDiaries.innerHTML = header + items;
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    const displayName = document.getElementById('profile-name').value.trim();
    const gender = document.getElementById('profile-gender').value;
    const matchPreference = document.getElementById('profile-preference').value;
    const bio = document.getElementById('profile-bio').value.trim();
    try {
      const response = await authFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, gender, matchPreference, bio })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存失败');
      state.user = data.user;
      toast('资料已更新', 'success');
      renderProfile();
    } catch (err) {
      toast(err.message || '保存失败', 'error');
    }
  }

  async function handleDiarySubmit(event) {
    event.preventDefault();
    const title = document.getElementById('diary-title').value.trim();
    const content = document.getElementById('diary-content').value.trim();
    const mood = document.getElementById('diary-mood').value;
    const tags = document.getElementById('diary-tags').value.split(',').map((tag) => tag.trim()).filter(Boolean);
    const share = document.getElementById('diary-share').checked;
    if (!content) {
      toast('内容不能为空', 'error');
      return;
    }
    try {
      const response = await authFetch('/api/diaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, mood, tags, shareWithMatch: share })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '发布失败');
      document.getElementById('diary-form').reset();
      toast('日记已保存', 'success');
      await Promise.all([loadDiaries(), loadInsights(), loadMatch()]);
    } catch (err) {
      toast(err.message || '发布失败', 'error');
    }
  }

  async function handleMatchRequest() {
    try {
      const response = await authFetch('/api/match/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchPreference: document.getElementById('profile-preference').value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '匹配失败');
      state.match = data;
      renderMatch();
      if (data.status === 'matched') {
        await loadPartnerDiaries();
      }
      toast(data.status === 'matched' ? '匹配成功！' : '正在为你寻找同频伙伴', 'success');
    } catch (err) {
      toast(err.message || '匹配失败', 'error');
    }
  }

  async function handleMatchReset() {
    try {
      const response = await authFetch('/api/match/reset', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '操作失败');
      state.match = data;
      renderMatch();
      renderPartnerDiaries();
      toast('已重置匹配', 'info');
    } catch (err) {
      toast(err.message || '操作失败', 'error');
    }
  }

  async function restoreSession() {
    const token = localStorage.getItem('soulsync_token');
    if (!token) {
      showAuth();
      return;
    }
    try {
      const response = await fetch('/api/auth/session', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error('会话已失效');
      state.token = token;
      state.user = data.user;
      showDashboard();
      renderProfile();
      await Promise.all([loadPrompt(), loadDiaries(), loadInsights(), loadMatch()]);
      toast('欢迎回来', 'success');
    } catch (err) {
      localStorage.removeItem('soulsync_token');
      showAuth();
    }
  }

  function bindEvents() {
    elements.emailRequestForm.addEventListener('submit', handleEmailRequest);
    elements.emailVerifyForm.addEventListener('submit', handleEmailVerify);
    elements.phoneRequestForm.addEventListener('submit', handlePhoneRequest);
    elements.phoneVerifyForm.addEventListener('submit', handlePhoneVerify);
    elements.wechatGenerate.addEventListener('click', generateWechat);
    elements.wechatConfirm.addEventListener('click', confirmWechat);
    elements.profileForm.addEventListener('submit', handleProfileSubmit);
    elements.diaryForm.addEventListener('submit', handleDiarySubmit);
    elements.matchRequest.addEventListener('click', handleMatchRequest);
    elements.matchReset.addEventListener('click', handleMatchReset);
    Array.from(elements.viewButtons || []).forEach((button) => {
      button.addEventListener('click', () => switchView(button.dataset.viewTarget));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    restoreSession();
  });
})();
