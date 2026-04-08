#!/usr/bin/env node
// gradata-plugin/hooks/lib/daemon-client.js — HTTP client for Gradata daemon
const http = require('http');

const DAEMON_PORT = parseInt(process.env.GRADATA_DAEMON_PORT || '7342', 10);
const DAEMON_HOST = process.env.GRADATA_DAEMON_HOST || '127.0.0.1';

/**
 * Call a daemon endpoint with JSON payload and timeout.
 * Returns parsed JSON response or null on failure.
 * Never throws — all errors are swallowed for hook safety.
 */
function callDaemon(path, data = {}, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const body = JSON.stringify(data);
    const req = http.request(
      {
        hostname: DAEMON_HOST,
        port: DAEMON_PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(chunks));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

module.exports = { callDaemon };
