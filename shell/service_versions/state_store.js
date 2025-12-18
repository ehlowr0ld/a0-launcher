const path = require('node:path');
const fs = require('node:fs/promises');
const { app } = require('electron');

function baseDir() {
  return path.join(app.getPath('userData'), 'service_versions');
}

function cacheDir() {
  return path.join(baseDir(), 'cache');
}

function stateFile() {
  return path.join(baseDir(), 'state.json');
}

function releasesCacheFile() {
  return path.join(cacheDir(), 'releases.json');
}

function installabilityCacheFile() {
  return path.join(cacheDir(), 'installability.json');
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return fallbackValue;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const json = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(filePath, json, 'utf8');
}

async function readRetentionPolicy() {
  const state = await readJson(stateFile(), {});
  const keepCount = Number.isFinite(Number(state?.retentionPolicy?.keepCount))
    ? Number(state.retentionPolicy.keepCount)
    : 1;
  return { keepCount: Math.max(0, Math.min(20, Math.floor(keepCount))) };
}

async function writeRetentionPolicy(retentionPolicy) {
  const keepCount = Number.isFinite(Number(retentionPolicy?.keepCount))
    ? Number(retentionPolicy.keepCount)
    : 1;
  const policy = { keepCount: Math.max(0, Math.min(20, Math.floor(keepCount))) };
  const state = await readJson(stateFile(), {});
  await writeJson(stateFile(), { ...state, retentionPolicy: policy, updatedAt: new Date().toISOString() });
  return policy;
}

async function readInstallabilityCache() {
  const cache = await readJson(installabilityCacheFile(), { entries: {} });
  const entries = cache && typeof cache.entries === 'object' ? cache.entries : {};
  return { ...cache, entries };
}

async function writeInstallabilityCache(cache) {
  const payload = cache && typeof cache === 'object' ? cache : { entries: {} };
  const entries = payload && typeof payload.entries === 'object' ? payload.entries : {};
  await writeJson(installabilityCacheFile(), { ...payload, entries });
}

module.exports = {
  // Paths (shared by other modules)
  baseDir,
  cacheDir,
  stateFile,
  releasesCacheFile,
  installabilityCacheFile,

  // JSON helpers
  readJson,
  writeJson,

  // Retention policy
  readRetentionPolicy,
  writeRetentionPolicy,

  // Installability cache
  readInstallabilityCache,
  writeInstallabilityCache
};

