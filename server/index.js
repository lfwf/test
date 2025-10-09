const net = require('net');
const { createApp } = require('./app');

const parsedPort = Number(process.env.PORT);
const DEFAULT_PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
const HOST = process.env.HOST || '0.0.0.0';
const parsedLimit = Number(process.env.PORT_SEARCH_LIMIT);
const PORT_SEARCH_LIMIT = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;

function checkPortAvailability(port, host) {
  return new Promise((resolve, reject) => {
    const tester = net
      .createServer()
      .once('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
          resolve(false);
          return;
        }
        reject(err);
      })
      .once('listening', () => {
        tester.close(() => resolve(true));
      });

    tester.listen(port, host);
  });
}

async function findAvailablePort(startPort, host, attempts) {
  if (!Number.isFinite(startPort) || startPort <= 0) {
    throw new Error(`Invalid start port: ${startPort}`);
  }
  let port = startPort;
  const maxAttempts = Math.max(1, attempts);
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const available = await checkPortAvailability(port, host);
      if (available) {
        return port;
      }
    } catch (err) {
      if (err && err.code === 'EACCES') {
        throw err;
      }
      console.warn(`[server] Unexpected error while checking port ${port}`, err);
    }
    port += 1;
  }
  const error = new Error(`No available ports found in range ${startPort}..${port - 1}`);
  error.code = 'EADDRNOTAVAIL';
  throw error;
}

function startServer() {
  return findAvailablePort(DEFAULT_PORT, HOST, PORT_SEARCH_LIMIT)
    .then((port) => {
      if (port !== DEFAULT_PORT) {
        console.warn(
          `[server] Port ${DEFAULT_PORT} unavailable, switched to http://${HOST}:${port}`,
        );
      }
      const server = createApp();
      server.listen(port, HOST, () => {
        console.log(`[server] listening on http://${HOST}:${port}`);
      });
      server.on('error', (err) => {
        console.error('[server] encountered an error', err);
      });
      return server;
    })
    .catch((err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.error(
          `[server] Port ${DEFAULT_PORT} is already in use and no fallback ports were available. `
            + 'Set PORT to an open port or stop the other process.',
        );
      } else {
        console.error('[server] Failed to start', err);
      }
      process.exitCode = 1;
    });
}

startServer();

module.exports = { startServer };
