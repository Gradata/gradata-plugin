#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const GRADATA_HOME = process.env.GRADATA_HOME || path.join(os.homedir(), '.gradata');
const INSTALL_ID_PATH = path.join(GRADATA_HOME, 'install_id');
const TELEMETRY_ENDPOINT = process.env.GRADATA_TELEMETRY_ENDPOINT || 'https://api.gradata.ai/telemetry/plugin';
const TELEMETRY_TIMEOUT_MS = 1500;

let cachedAnonUserId = null;
let cachedPluginVersion = null;

function telemetryEnabled() {
  return process.env.GRADATA_TELEMETRY === '1';
}

function ensureInstallId() {
  try {
    if (fs.existsSync(INSTALL_ID_PATH)) {
      return fs.readFileSync(INSTALL_ID_PATH, 'utf8').trim();
    }
    fs.mkdirSync(path.dirname(INSTALL_ID_PATH), { recursive: true });
    const installId = crypto.randomUUID();
    fs.writeFileSync(INSTALL_ID_PATH, `${installId}\n`, { mode: 0o600 });
    return installId;
  } catch {
    return '';
  }
}

function getAnonymousUserId() {
  if (cachedAnonUserId) return cachedAnonUserId;
  const installId = ensureInstallId();
  if (!installId) return '';
  cachedAnonUserId = crypto.createHash('sha256').update(installId).digest('hex');
  return cachedAnonUserId;
}

function getPluginVersion() {
  if (cachedPluginVersion) return cachedPluginVersion;
  try {
    const pluginJsonPath = path.resolve(__dirname, '../../.claude-plugin/plugin.json');
    const raw = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    cachedPluginVersion = typeof raw.version === 'string' ? raw.version : 'unknown';
  } catch {
    cachedPluginVersion = 'unknown';
  }
  return cachedPluginVersion;
}

function postJson(url, payload) {
  return new Promise((resolve) => {
    let requestUrl;
    try {
      requestUrl = new URL(url);
    } catch {
      resolve(false);
      return;
    }

    const body = JSON.stringify(payload);
    const req = https.request(
      {
        protocol: requestUrl.protocol,
        hostname: requestUrl.hostname,
        port: requestUrl.port || 443,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: TELEMETRY_TIMEOUT_MS,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      }
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}

async function sendTelemetryMetric(metric, count = 1) {
  if (!telemetryEnabled()) return false;
  const userId = getAnonymousUserId();
  if (!userId) return false;
  if (typeof metric !== 'string' || !metric.trim()) return false;
  if (!Number.isFinite(count) || count <= 0) return false;

  return postJson(TELEMETRY_ENDPOINT, {
    event: 'plugin_metric',
    metric,
    count: Math.floor(count),
    user_id: userId,
    ts: new Date().toISOString(),
    plugin_version: getPluginVersion(),
  });
}

module.exports = {
  telemetryEnabled,
  getAnonymousUserId,
  sendTelemetryMetric,
};
