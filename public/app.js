(() => {
  const state = {
    token: null,
    user: null,
    diaries: [],
    insights: null,
    match: null,
    partner: null,
    partnerDiaries: [],
    prompt: null,
    importDrafts: [],
    importFiles: []
  };

  let emailChallenge = null;
  let phoneChallenge = null;
  let currentWechat = null;
  let wechatPollTimer = null;
  let wechatCountdownTimer = null;

  const elements = {
    authSection: document.getElementById('auth-section'),
    authTabs: document.getElementById('auth-tabs'),
    authTabButtons: document.querySelectorAll('[data-auth-target]'),
    authViews: document.querySelectorAll('.auth-view'),
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
    wechatRefresh: document.getElementById('wechat-refresh'),
    wechatStatus: document.getElementById('wechat-status'),
    wechatCountdown: document.getElementById('wechat-countdown'),
    profileForm: document.getElementById('profile-form'),
    diaryForm: document.getElementById('diary-form'),
    diaryList: document.getElementById('diary-list'),
    diaryInsights: document.getElementById('diary-insights'),
    promptContent: document.getElementById('prompt-content'),
    matchStatus: document.getElementById('match-status'),
    matchRequest: document.getElementById('match-request'),
    matchReset: document.getElementById('match-reset'),
    partnerDiaries: document.getElementById('partner-diaries'),
    overviewLatest: document.getElementById('overview-latest'),
    timelineList: document.getElementById('timeline-list'),
    importForm: document.getElementById('import-form'),
    importFiles: document.getElementById('import-files'),
    importSelected: document.getElementById('import-selected'),
    importPreview: document.getElementById('import-preview'),
    importClear: document.getElementById('import-clear'),
    importStatus: document.getElementById('import-status'),
    importDrafts: document.getElementById('import-drafts'),
    importCommit: document.getElementById('import-commit'),
    importCommitBar: document.getElementById('import-commit-bar'),
    importDiscard: document.getElementById('import-discard')
  };

  let activeView = 'overview';
  let activeAuth = 'email';

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

  function switchAuth(method) {
    if (!method) return;
    activeAuth = method;
    Array.from(elements.authViews || []).forEach((view) => {
      if (!view) return;
      const isActive = view.dataset.auth === method;
      view.classList.toggle('active', isActive);
      view.toggleAttribute('hidden', !isActive);
    });
    Array.from(elements.authTabButtons || []).forEach((button) => {
      if (!button) return;
      const isActive = button.dataset.authTarget === method;
      button.classList.toggle('active', isActive);
      if (isActive) {
        button.setAttribute('aria-selected', 'true');
        button.setAttribute('tabindex', '0');
      } else {
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('tabindex', '-1');
      }
    });

    if (method === 'wechat') {
      if (currentWechat && currentWechat.expiresAt) {
        startWechatCountdown(currentWechat.expiresAt);
      } else if (!currentWechat) {
        setTimeout(() => {
          if (activeAuth === 'wechat') {
            generateWechat();
          }
        }, 80);
      }
    } else {
      stopWechatCountdown();
    }
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
    switchAuth(activeAuth);
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

  function stopWechatCountdown() {
    if (wechatCountdownTimer) {
      clearInterval(wechatCountdownTimer);
      wechatCountdownTimer = null;
    }
    if (elements.wechatCountdown) {
      elements.wechatCountdown.textContent = '';
    }
  }

  function startWechatCountdown(expiresAt) {
    if (!elements.wechatCountdown) return;
    stopWechatCountdown();
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    if (Number.isNaN(target)) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
      if (diff <= 0) {
        elements.wechatCountdown.textContent = '二维码已过期，请重新生成。';
        stopWechatCountdown();
        if (elements.wechatStatus) {
          elements.wechatStatus.textContent = '二维码已过期，请重新生成。';
        }
        if (elements.wechatRefresh) {
          elements.wechatRefresh.classList.remove('hidden');
        }
      } else {
        elements.wechatCountdown.textContent = `二维码将在 ${diff} 秒后失效。`;
      }
    };
    update();
    wechatCountdownTimer = setInterval(update, 1000);
  }

  async function generateWechat() {
    clearWechatPolling();
    stopWechatCountdown();
    elements.wechatQr.classList.add('hidden');
    elements.wechatSimulator.classList.add('hidden');
    elements.wechatToken.textContent = '';
    if (elements.wechatStatus) {
      elements.wechatStatus.textContent = '正在生成二维码，请稍候...';
    }
    try {
      const response = await fetch('/api/auth/wechat/qrcode', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '生成失败');
      currentWechat = data;
      if (elements.wechatRefresh) {
        elements.wechatRefresh.classList.remove('hidden');
      }
      elements.wechatQr.classList.remove('hidden');
      elements.wechatSimulator.classList.remove('hidden');
      elements.wechatToken.textContent = `调试 token：${data.token}｜QR 数据：${data.qrData}`;
      renderPseudoQr(data.token);
      startWechatCountdown(data.expiresAt);
      if (elements.wechatStatus) {
        elements.wechatStatus.textContent = '请使用微信「扫一扫」扫描二维码，手机确认后即可登录。';
      }
      toast('微信二维码已生成，点击“模拟扫码确认”完成登录', 'info');
      wechatPollTimer = setInterval(() => pollWechat(data.token), 2000);
    } catch (err) {
      toast(err.message || '生成失败', 'error');
      if (elements.wechatStatus) {
        elements.wechatStatus.textContent = err.message || '二维码生成失败，请稍后重试。';
      }
    }
  }

  async function pollWechat(token) {
    try {
      const response = await fetch(`/api/auth/wechat/poll?token=${encodeURIComponent(token)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '轮询失败');
      if (data.status === 'confirmed') {
        clearWechatPolling();
        stopWechatCountdown();
        if (elements.wechatStatus) {
          elements.wechatStatus.textContent = '手机端已确认，正在登录...';
        }
        await onLogin(data);
        toast('微信登录成功', 'success');
      } else if (data.status === 'expired') {
        clearWechatPolling();
        stopWechatCountdown();
        currentWechat = null;
        if (elements.wechatStatus) {
          elements.wechatStatus.textContent = '二维码已过期，请点击重新生成。';
        }
        if (elements.wechatRefresh) {
          elements.wechatRefresh.classList.remove('hidden');
        }
        toast('二维码已过期，请重新生成', 'error');
      } else if (data.status === 'pending') {
        if (elements.wechatStatus) {
          elements.wechatStatus.textContent = '等待手机确认中...';
        }
      }
    } catch (err) {
      clearWechatPolling();
      stopWechatCountdown();
      toast(err.message || '轮询失败', 'error');
      if (elements.wechatStatus) {
        elements.wechatStatus.textContent = err.message || '轮询失败，请重新生成二维码。';
      }
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
      if (elements.wechatConfirm) {
        elements.wechatConfirm.disabled = true;
      }
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
      if (elements.wechatStatus) {
        elements.wechatStatus.textContent = '手机端已确认，请等待桌面端自动登录。';
      }
      toast('已模拟扫码，请等待桌面端自动登录', 'success');
    } catch (err) {
      toast(err.message || '确认失败', 'error');
      if (elements.wechatStatus) {
        elements.wechatStatus.textContent = err.message || '模拟扫码失败，请重试。';
      }
    } finally {
      if (elements.wechatConfirm) {
        elements.wechatConfirm.disabled = false;
      }
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
      if (elements.timelineList) {
        elements.timelineList.innerHTML = `<p class="hint">${escapeHtml(message)}</p>`;
      }
    }
  }

  function renderDiaries() {
    if (!state.diaries.length) {
      elements.diaryList.innerHTML = '<p class="hint">还没有日记，写下第一篇吧。</p>';
      if (elements.overviewLatest) {
        elements.overviewLatest.innerHTML = '<p class="hint">写下你的第一篇日记，最新内容会出现在这里。</p>';
      }
      if (elements.timelineList) {
        elements.timelineList.innerHTML = '<p class="hint">写下或导入第一篇日记，时间轴会在这里点亮。</p>';
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

    renderTimeline();
  }

  function formatTimelineDate(value) {
    if (!value) return '刚刚';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '刚刚';
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderTimeline() {
    if (!elements.timelineList) return;
    if (!state.diaries.length) {
      elements.timelineList.innerHTML = '<p class="hint">写下或导入第一篇日记，时间轴会在这里点亮。</p>';
      return;
    }

    const items = state.diaries.slice(0, 5);
    elements.timelineList.innerHTML = '';
    items.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      item.dataset.tempId = entry.id;

      const dot = document.createElement('div');
      dot.className = 'timeline-dot';
      item.appendChild(dot);

      const body = document.createElement('div');
      body.className = 'timeline-body';

      const title = document.createElement('h5');
      title.textContent = entry.title || '无题日记';
      body.appendChild(title);

      const meta = document.createElement('p');
      meta.className = 'hint';
      meta.textContent = `${formatTimelineDate(entry.entryDate || entry.createdAt)} ｜ 心情 ${entry.mood || '未设置'}`;
      body.appendChild(meta);

      const snippet = document.createElement('p');
      snippet.className = 'timeline-snippet';
      const content = entry.content || '';
      snippet.textContent = content.length > 90 ? `${content.slice(0, 90)}…` : content;
      body.appendChild(snippet);

      const tagContainer = document.createElement('div');
      tagContainer.className = 'timeline-tags';
      const moodTag = document.createElement('span');
      moodTag.className = 'tag';
      moodTag.textContent = entry.mood || '心情';
      tagContainer.appendChild(moodTag);
      if (entry.shareWithMatch) {
        const shareTag = document.createElement('span');
        shareTag.className = 'tag';
        shareTag.textContent = '共享';
        tagContainer.appendChild(shareTag);
      }
      (entry.tags || []).slice(0, 3).forEach((tag) => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag';
        tagEl.textContent = `#${tag}`;
        tagContainer.appendChild(tagEl);
      });
      if (tagContainer.childElementCount) {
        body.appendChild(tagContainer);
      }

      item.appendChild(body);
      elements.timelineList.appendChild(item);
    });
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

  function updateImportStatus(message) {
    if (elements.importStatus) {
      elements.importStatus.textContent = message;
    }
  }

  function renderImportSelection() {
    if (!elements.importSelected) return;
    if (!state.importFiles.length) {
      elements.importSelected.textContent = '尚未选择图片。';
      return;
    }
    const parts = state.importFiles.map((file) => {
      const size = Math.max(1, Math.round(file.size / 1024));
      return `${file.name}（${size}KB）`;
    });
    elements.importSelected.textContent = `已选择 ${state.importFiles.length} 张：${parts.join('、')}`;
  }

  function clearImportSelection() {
    state.importFiles = [];
    if (elements.importFiles) {
      elements.importFiles.value = '';
    }
    renderImportSelection();
  }

  function handleImportSelection() {
    if (!elements.importFiles) return;
    state.importFiles = Array.from(elements.importFiles.files || []);
    renderImportSelection();
    if (state.importFiles.length) {
      updateImportStatus('已选择照片，点击「识别文字」开始解析。');
    }
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const base64 = result.includes(',') ? result.split(',').pop() : result;
        resolve(base64 || '');
      };
      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };
      reader.readAsDataURL(file);
    });
  }

  function renderImportDrafts() {
    if (!elements.importDrafts) return;
    if (!state.importDrafts.length) {
      elements.importDrafts.innerHTML = '<p class="hint">识别结果会显示在这里。</p>';
      if (elements.importCommitBar) {
        elements.importCommitBar.classList.add('hidden');
      }
      return;
    }

    elements.importDrafts.innerHTML = '';
    const moodLabels = {
      hopeful: '充满期待',
      sunny: '晴朗轻盈',
      reflective: '内省思考',
      calm: '宁静舒缓',
      nostalgic: '怀旧柔软',
      stormy: '风暴挑战'
    };
    const moodOptions = ['hopeful', 'sunny', 'reflective', 'calm', 'nostalgic', 'stormy'];

    state.importDrafts.forEach((draft) => {
      const article = document.createElement('article');
      article.className = 'import-draft';
      article.dataset.tempId = draft.tempId;

      const titleId = `import-title-${draft.tempId}`;
      const titleLabel = document.createElement('label');
      titleLabel.setAttribute('for', titleId);
      titleLabel.textContent = '标题';
      const titleInput = document.createElement('input');
      titleInput.id = titleId;
      titleInput.dataset.field = 'title';
      titleInput.value = draft.title || '';
      article.appendChild(titleLabel);
      article.appendChild(titleInput);

      const contentId = `import-content-${draft.tempId}`;
      const contentLabel = document.createElement('label');
      contentLabel.setAttribute('for', contentId);
      contentLabel.textContent = '正文内容';
      const contentTextarea = document.createElement('textarea');
      contentTextarea.id = contentId;
      contentTextarea.dataset.field = 'content';
      contentTextarea.value = draft.content || '';
      article.appendChild(contentLabel);
      article.appendChild(contentTextarea);

      const moodId = `import-mood-${draft.tempId}`;
      const moodLabel = document.createElement('label');
      moodLabel.setAttribute('for', moodId);
      moodLabel.textContent = '识别心情';
      const moodSelect = document.createElement('select');
      moodSelect.id = moodId;
      moodSelect.dataset.field = 'mood';
      moodOptions.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = moodLabels[value] || value;
        if (draft.mood === value) {
          option.selected = true;
        }
        moodSelect.appendChild(option);
      });
      article.appendChild(moodLabel);
      article.appendChild(moodSelect);

      const dateId = `import-date-${draft.tempId}`;
      const dateLabel = document.createElement('label');
      dateLabel.setAttribute('for', dateId);
      dateLabel.textContent = '原记录日期';
      const dateInput = document.createElement('input');
      dateInput.id = dateId;
      dateInput.type = 'date';
      dateInput.dataset.field = 'entryDate';
      if (draft.entryDate) {
        dateInput.value = draft.entryDate.slice(0, 10);
      }
      article.appendChild(dateLabel);
      article.appendChild(dateInput);

      const tagsId = `import-tags-${draft.tempId}`;
      const tagsLabel = document.createElement('label');
      tagsLabel.setAttribute('for', tagsId);
      tagsLabel.textContent = '标签';
      const tagsInput = document.createElement('input');
      tagsInput.id = tagsId;
      tagsInput.dataset.field = 'tags';
      tagsInput.placeholder = '如：回忆, 成长';
      tagsInput.value = (draft.tags || []).join('、');
      const tagsHint = document.createElement('small');
      tagsHint.className = 'tag-input-hint';
      tagsHint.textContent = '多个标签用逗号、顿号或空格分隔';
      article.appendChild(tagsLabel);
      article.appendChild(tagsInput);
      article.appendChild(tagsHint);

      const shareLabel = document.createElement('label');
      shareLabel.className = 'share-checkbox';
      const shareInput = document.createElement('input');
      shareInput.type = 'checkbox';
      shareInput.dataset.field = 'shareWithMatch';
      shareInput.checked = Boolean(draft.shareWithMatch);
      shareLabel.appendChild(shareInput);
      shareLabel.append(' 与匹配对象共享这篇日记');
      article.appendChild(shareLabel);

      if (draft.highlight) {
        const highlight = document.createElement('div');
        highlight.className = 'import-highlight';
        highlight.textContent = draft.highlight;
        article.appendChild(highlight);
      }

      if (Array.isArray(draft.suggestions) && draft.suggestions.length) {
        const suggestion = document.createElement('p');
        suggestion.className = 'hint';
        suggestion.textContent = `写作提示：${draft.suggestions.join(' ')}`;
        article.appendChild(suggestion);
      }

      const meta = document.createElement('div');
      meta.className = 'import-meta';
      const sourceSpan = document.createElement('span');
      sourceSpan.textContent = `来源：${draft.sourceName || '照片'}`;
      const dateSpan = document.createElement('span');
      dateSpan.dataset.role = 'meta-date';
      dateSpan.textContent = `识别日期：${formatTimelineDate(draft.entryDate)}`;
      const confidenceSpan = document.createElement('span');
      const confidence = Math.round((draft.confidence || 0) * 100);
      confidenceSpan.textContent = `可信度：${confidence}%`;
      meta.appendChild(sourceSpan);
      meta.appendChild(dateSpan);
      meta.appendChild(confidenceSpan);
      article.appendChild(meta);

      elements.importDrafts.appendChild(article);
    });

    if (elements.importCommitBar) {
      elements.importCommitBar.classList.remove('hidden');
    }
  }

  async function handleImportPreview() {
    if (!state.importFiles.length) {
      toast('请先选择手写日记照片', 'error');
      return;
    }
    try {
      if (elements.importPreview) {
        elements.importPreview.disabled = true;
      }
      updateImportStatus('正在识别图片中的文字与情绪，请稍候...');
      state.importDrafts = [];
      renderImportDrafts();
      const images = await Promise.all(state.importFiles.map(async (file) => ({
        name: file.name,
        data: await readFileAsBase64(file)
      })));
      const response = await authFetch('/api/diaries/import-handwritten/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '识别失败');
      state.importDrafts = (data.entries || []).map((entry) => ({
        ...entry,
        mood: entry.mood || 'reflective',
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        shareWithMatch: Boolean(entry.shareWithMatch)
      }));
      renderImportDrafts();
      if (state.importDrafts.length) {
        updateImportStatus('识别完成，可在下方调整内容后导入。');
        toast(`识别完成，共生成 ${state.importDrafts.length} 篇草稿`, 'success');
      } else {
        updateImportStatus('没有识别到有效内容，请尝试上传更清晰的照片。');
      }
    } catch (err) {
      toast(err.message || '识别失败', 'error');
      updateImportStatus(err.message || '识别失败，请稍后重试。');
    } finally {
      if (elements.importPreview) {
        elements.importPreview.disabled = false;
      }
    }
  }

  function handleImportDraftChange(event) {
    const field = event.target && event.target.dataset ? event.target.dataset.field : null;
    if (!field) return;
    const container = event.target.closest('.import-draft');
    if (!container) return;
    const draft = state.importDrafts.find((item) => item.tempId === container.dataset.tempId);
    if (!draft) return;

    if (field === 'shareWithMatch') {
      draft.shareWithMatch = event.target.checked;
      return;
    }

    if (field === 'tags') {
      const raw = event.target.value || '';
      draft.tags = raw
        .split(/[，,\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      return;
    }

    if (field === 'entryDate') {
      if (event.target.value) {
        const parsed = new Date(`${event.target.value}T12:00:00`);
        draft.entryDate = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      } else {
        draft.entryDate = null;
      }
      const metaDate = container.querySelector('[data-role="meta-date"]');
      if (metaDate) {
        metaDate.textContent = `识别日期：${formatTimelineDate(draft.entryDate)}`;
      }
      return;
    }

    draft[field] = event.target.value;
  }

  async function handleImportCommit() {
    if (!state.importDrafts.length) {
      toast('没有可以导入的草稿', 'error');
      return;
    }
    try {
      if (elements.importCommit) {
        elements.importCommit.disabled = true;
      }
      updateImportStatus('正在导入日记，请稍候...');
      const payload = state.importDrafts.map((draft) => ({
        title: draft.title,
        content: draft.content,
        mood: draft.mood,
        tags: draft.tags,
        shareWithMatch: draft.shareWithMatch,
        entryDate: draft.entryDate
      }));
      const response = await authFetch('/api/diaries/import-handwritten/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: payload })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '导入失败');
      toast(`成功导入 ${data.diaries ? data.diaries.length : payload.length} 篇日记`, 'success');
      state.importDrafts = [];
      renderImportDrafts();
      clearImportSelection();
      updateImportStatus('导入完成，可以继续上传新的手写日记。');
      await Promise.all([loadDiaries(), loadInsights()]);
    } catch (err) {
      toast(err.message || '导入失败', 'error');
      updateImportStatus(err.message || '导入失败，请检查后重试。');
    } finally {
      if (elements.importCommit) {
        elements.importCommit.disabled = false;
      }
    }
  }

  function handleImportDiscard() {
    state.importDrafts = [];
    renderImportDrafts();
    updateImportStatus('已清空草稿，请重新选择照片。');
  }

  function handleImportClear() {
    clearImportSelection();
    updateImportStatus('已清空选择，请重新选择手写日记照片。');
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
    if (elements.wechatRefresh) {
      elements.wechatRefresh.addEventListener('click', (event) => {
        event.preventDefault();
        generateWechat();
      });
    }
    elements.profileForm.addEventListener('submit', handleProfileSubmit);
    elements.diaryForm.addEventListener('submit', handleDiarySubmit);
    elements.matchRequest.addEventListener('click', handleMatchRequest);
    elements.matchReset.addEventListener('click', handleMatchReset);
    if (elements.importFiles) {
      elements.importFiles.addEventListener('change', handleImportSelection);
    }
    if (elements.importPreview) {
      elements.importPreview.addEventListener('click', handleImportPreview);
    }
    if (elements.importClear) {
      elements.importClear.addEventListener('click', handleImportClear);
    }
    if (elements.importCommit) {
      elements.importCommit.addEventListener('click', handleImportCommit);
    }
    if (elements.importDiscard) {
      elements.importDiscard.addEventListener('click', handleImportDiscard);
    }
    if (elements.importDrafts) {
      elements.importDrafts.addEventListener('input', handleImportDraftChange);
      elements.importDrafts.addEventListener('change', handleImportDraftChange);
    }
    if (elements.authTabs) {
      elements.authTabs.addEventListener('click', (event) => {
        const button = event.target.closest('[data-auth-target]');
        if (!button) return;
        event.preventDefault();
        switchAuth(button.dataset.authTarget);
        button.focus();
      });
      elements.authTabs.addEventListener('keydown', (event) => {
        const tabs = Array.from(elements.authTabButtons || []);
        if (!tabs.length) return;
        const currentIndex = tabs.findIndex((tab) => tab.dataset.authTarget === activeAuth);
        let nextIndex = currentIndex;
        switch (event.key) {
          case 'ArrowRight':
          case 'ArrowDown':
            nextIndex = (currentIndex + 1 + tabs.length) % tabs.length;
            break;
          case 'ArrowLeft':
          case 'ArrowUp':
            nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            break;
          case 'Home':
            nextIndex = 0;
            break;
          case 'End':
            nextIndex = tabs.length - 1;
            break;
          default:
            return;
        }
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        if (nextTab) {
          switchAuth(nextTab.dataset.authTarget);
          nextTab.focus();
        }
      });
    }
    Array.from(elements.viewButtons || []).forEach((button) => {
      button.addEventListener('click', () => switchView(button.dataset.viewTarget));
    });
    renderImportSelection();
    renderImportDrafts();
    switchAuth(activeAuth);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    restoreSession();
  });
})();
