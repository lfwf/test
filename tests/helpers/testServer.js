const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../../server/app');
const { DataStore, EMPTY_STATE } = require('../../server/dataStore');
const { SessionManager } = require('../../server/sessionManager');

function makeTempDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-app-'));
  const filePath = path.join(dir, 'db.json');
  fs.writeFileSync(filePath, JSON.stringify(EMPTY_STATE, null, 2));
  return filePath;
}

async function startTestServer() {
  const databasePath = makeTempDatabase();
  const store = new DataStore(databasePath);
  const sessionManager = new SessionManager(store, { ttlHours: 2 });
  const app = createApp({ store, sessionManager, databasePath });

  const server = app;
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();

  async function close() {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    try {
      fs.rmSync(path.dirname(databasePath), { recursive: true, force: true });
    } catch (err) {
      // ignore
    }
  }

  return { server, address, baseUrl: `http://127.0.0.1:${address.port}`, close, store };
}

module.exports = { startTestServer };
