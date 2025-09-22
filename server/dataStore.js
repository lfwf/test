const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.join(__dirname, '..', 'storage', 'database.json');

const EMPTY_STATE = {
  users: [],
  diaries: [],
  loginChallenges: [],
  wechatChallenges: [],
  matchRequests: [],
  matches: [],
  sessions: [],
  prompts: [],
  meta: {
    version: 1
  }
};

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadState(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content) {
      return JSON.parse(JSON.stringify(EMPTY_STATE));
    }
    const parsed = JSON.parse(content);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      diaries: Array.isArray(parsed.diaries) ? parsed.diaries : [],
      loginChallenges: Array.isArray(parsed.loginChallenges) ? parsed.loginChallenges : [],
      wechatChallenges: Array.isArray(parsed.wechatChallenges) ? parsed.wechatChallenges : [],
      matchRequests: Array.isArray(parsed.matchRequests) ? parsed.matchRequests : [],
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      prompts: Array.isArray(parsed.prompts) ? parsed.prompts : [],
      meta: parsed.meta && typeof parsed.meta === 'object'
        ? { version: 1, ...parsed.meta }
        : { version: 1 }
    };
  } catch (err) {
    return JSON.parse(JSON.stringify(EMPTY_STATE));
  }
}

class DataStore {
  constructor(filePath = DEFAULT_FILE) {
    this.filePath = filePath;
    ensureDir(this.filePath);
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(EMPTY_STATE, null, 2));
    }
    this.state = loadState(this.filePath);
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  transaction(mutator) {
    const draft = this.snapshot();
    const result = mutator(draft);
    this.state = draft;
    this.persist();
    return result;
  }

  persist() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }
}

module.exports = {
  DataStore,
  EMPTY_STATE
};
