import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_USER_AGENT = 'A0-Launcher';
const REGISTRY_BASE_URL = 'https://registry-1.docker.io';
const AUTH_BASE_URL = 'https://auth.docker.io';

const MANIFEST_ACCEPT = [
  // Keep ordering stable (DI-006)
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json'
].join(', ');

function safeHeaderValue(headers, name) {
  const v = headers?.get?.(name);
  if (typeof v !== 'string' || !v) return null;
  return v;
}

function extractRateLimit(headers) {
  if (!headers) return null;
  const limit = safeHeaderValue(headers, 'ratelimit-limit');
  const remaining = safeHeaderValue(headers, 'ratelimit-remaining');
  const reset = safeHeaderValue(headers, 'ratelimit-reset');
  const retryAfter = safeHeaderValue(headers, 'retry-after');

  if (!limit && !remaining && !reset && !retryAfter) return null;

  // Treat reset as opaque to avoid false precision (DI-015).
  return { limit, remaining, reset, retryAfter };
}

function parseLinkNext(headers) {
  const link = safeHeaderValue(headers, 'link');
  if (!link) return null;

  // RFC5988-ish: <url>; rel="next", <url2>; rel="prev"
  // Be tolerant of spaces and multiple entries.
  const parts = link.split(',');
  for (const part of parts) {
    const seg = part.trim();
    if (!seg) continue;

    const m = seg.match(/^<([^>]+)>\s*;\s*rel\s*=\s*"?next"?\s*$/i);
    if (m && m[1]) return m[1];

    // Some servers include extra params: <...>; rel="next"; foo="bar"
    const m2 = seg.match(/^<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i);
    if (m2 && m2[1]) return m2[1];
  }

  return null;
}

function resolveLinkUrl(maybeUrl) {
  if (!maybeUrl) return null;
  try {
    // Absolute URL
    return new URL(maybeUrl).toString();
  } catch {
    // Relative URL
    try {
      return new URL(maybeUrl, REGISTRY_BASE_URL).toString();
    } catch {
      return null;
    }
  }
}

function buildTagsListUrl(imageRepo, lastTag) {
  const u = new URL(`${REGISTRY_BASE_URL}/v2/${imageRepo}/tags/list`);
  u.searchParams.set('n', '100');
  if (lastTag) u.searchParams.set('last', lastTag);
  return u.toString();
}

function buildManifestUrl(imageRepo, tag) {
  return `${REGISTRY_BASE_URL}/v2/${imageRepo}/manifests/${encodeURIComponent(tag)}`;
}

function buildTokenUrl(imageRepo) {
  const u = new URL(`${AUTH_BASE_URL}/token`);
  u.searchParams.set('service', 'registry.docker.io');
  u.searchParams.set('scope', `repository:${imageRepo}:pull`);
  return u.toString();
}

async function readDockerConfigJson() {
  const dockerConfigDir = (process.env.DOCKER_CONFIG || '').trim() || path.join(os.homedir(), '.docker');
  const configPath = path.join(dockerConfigDir, 'config.json');
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function getDockerHubBasicAuthFromConfig(configJson) {
  // Best-effort only. We do not invoke credential helpers.
  const auths = configJson?.auths;
  if (!auths || typeof auths !== 'object') return null;

  const candidates = [
    'https://index.docker.io/v1/',
    'https://registry-1.docker.io',
    'registry-1.docker.io',
    'index.docker.io'
  ];

  for (const key of candidates) {
    const entry = auths[key];
    const auth = entry?.auth;
    if (typeof auth !== 'string' || !auth) continue;

    try {
      const decoded = Buffer.from(auth, 'base64').toString('utf8');
      // Expect "username:password"
      if (!decoded.includes(':')) continue;
      return `Basic ${auth}`;
    } catch {
      continue;
    }
  }

  return null;
}

function makeError(code, message, details = {}) {
  const err = new Error(message);
  err.name = 'DockerHubRegistryError';
  err.code = code;
  err.details = details;
  return err;
}

export class DockerHubRegistry {
  /**
   * @param {Object=} options
   * @param {string=} options.userAgent
   */
  constructor(options = {}) {
    this.userAgent = (options?.userAgent || DEFAULT_USER_AGENT).trim() || DEFAULT_USER_AGENT;
    /** @type {Map<string, {token: string, expiresAtMs: number}>} */
    this._tokenCache = new Map();
    this._dockerConfigPromise = null;
  }

  async #getDockerConfig() {
    if (this._dockerConfigPromise) return this._dockerConfigPromise;
    this._dockerConfigPromise = readDockerConfigJson().finally(() => {
      // Cache promise result; subsequent calls reuse resolved value by chaining.
    });
    return this._dockerConfigPromise;
  }

  async #getAuthHeaderBestEffort() {
    const cfg = await this.#getDockerConfig();
    if (!cfg) return null;
    return getDockerHubBasicAuthFromConfig(cfg);
  }

  async #getToken(imageRepo, forceRefresh = false) {
    const key = imageRepo;
    const now = Date.now();

    if (!forceRefresh) {
      const cached = this._tokenCache.get(key);
      if (cached && cached.token && cached.expiresAtMs > now + 10_000) {
        return cached.token;
      }
    }

    const url = buildTokenUrl(imageRepo);
    const headers = {
      'User-Agent': this.userAgent,
      'Accept': 'application/json'
    };

    const basicAuth = await this.#getAuthHeaderBestEffort();
    if (basicAuth) headers['Authorization'] = basicAuth;

    const res = await fetch(url, { method: 'GET', headers });
    const rateLimit = extractRateLimit(res.headers);

    if (!res.ok) {
      const status = res.status;
      const bodyText = await res.text().catch(() => '');
      if (status === 429) {
        throw makeError('REGISTRY_RATE_LIMIT', 'Docker Hub rate limit exceeded', {
          status,
          rateLimit
        });
      }
      throw makeError('REGISTRY_AUTH_FAILED', 'Failed to obtain Docker Hub registry token', {
        status,
        rateLimit,
        body: bodyText ? bodyText.slice(0, 500) : null
      });
    }

    const json = await res.json();
    const token = json?.token || json?.access_token;
    const expiresIn = Number.isFinite(Number(json?.expires_in)) ? Number(json.expires_in) : 0;

    if (typeof token !== 'string' || !token) {
      throw makeError('REGISTRY_AUTH_FAILED', 'Token response missing token field', {
        rateLimit
      });
    }

    const expiresAtMs = expiresIn > 0 ? now + expiresIn * 1000 : now + 60_000;
    this._tokenCache.set(key, { token, expiresAtMs });
    return token;
  }

  /**
   * List tags for an image repo via `tags/list` (DI-005).
   * @param {string} imageRepo
   * @returns {Promise<{tags: string[], rateLimit: Object|null}>}
   */
  async listTags(imageRepo) {
    const repo = (imageRepo || '').trim();
    if (!repo) throw makeError('INVALID_INPUT', 'imageRepo is required');

    /** @type {string[]} */
    const tags = [];
    let url = buildTagsListUrl(repo, '');
    let page = 0;
    let rateLimit = null;

    while (true) {
      if (page > 2000) {
        throw makeError('REGISTRY_PAGINATION_ERROR', 'Aborting tag pagination after excessive pages', {
          pages: page
        });
      }

      const token = await this.#getToken(repo, false);
      const currentUrl = url;

      const res = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      rateLimit = extractRateLimit(res.headers) || rateLimit;

      if (res.status === 401) {
        // Token expired; retry once with a fresh token.
        const fresh = await this.#getToken(repo, true);
        const res2 = await fetch(currentUrl, {
          method: 'GET',
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'application/json',
            'Authorization': `Bearer ${fresh}`
          }
        });

        rateLimit = extractRateLimit(res2.headers) || rateLimit;
        if (!res2.ok) {
          if (res2.status === 429) {
            throw makeError('REGISTRY_RATE_LIMIT', 'Docker Hub rate limit exceeded', { status: res2.status, rateLimit });
          }
          const txt = await res2.text().catch(() => '');
          throw makeError('REGISTRY_ERROR', 'Failed to list tags from Docker Hub', {
            status: res2.status,
            rateLimit,
            body: txt ? txt.slice(0, 500) : null
          });
        }

        const json2 = await res2.json();
        const pageTags2 = Array.isArray(json2?.tags) ? json2.tags : [];
        tags.push(...pageTags2);

        const nextLink2 = resolveLinkUrl(parseLinkNext(res2.headers));
        if (nextLink2) {
          if (nextLink2 === currentUrl) {
            throw makeError('REGISTRY_PAGINATION_ERROR', 'Registry pagination did not advance (next link loop)', {
              url: currentUrl
            });
          }
          url = nextLink2;
          page += 1;
          continue;
        }

        break;
      }

      if (!res.ok) {
        if (res.status === 429) {
          throw makeError('REGISTRY_RATE_LIMIT', 'Docker Hub rate limit exceeded', {
            status: res.status,
            rateLimit
          });
        }
        const txt = await res.text().catch(() => '');
        throw makeError('REGISTRY_ERROR', 'Failed to list tags from Docker Hub', {
          status: res.status,
          rateLimit,
          body: txt ? txt.slice(0, 500) : null
        });
      }

      const json = await res.json();
      const pageTags = Array.isArray(json?.tags) ? json.tags : [];
      tags.push(...pageTags);

      const nextLink = resolveLinkUrl(parseLinkNext(res.headers));
      if (nextLink) {
        if (nextLink === currentUrl) {
          throw makeError('REGISTRY_PAGINATION_ERROR', 'Registry pagination did not advance (next link loop)', {
            url: currentUrl
          });
        }
        url = nextLink;
        page += 1;
        continue;
      }

      break;
    }

    // De-dupe, stable sort for determinism.
    const deduped = Array.from(new Set(tags)).sort();
    return { tags: deduped, rateLimit };
  }

  /**
   * Retrieve the digest for a remote tag using a HEAD manifest request (DI-006).
   * @param {string} imageRepo
   * @param {string} tag
   * @returns {Promise<{exists: boolean, digest: string|null, contentType: string|null, rateLimit: Object|null}>}
   */
  async getDigest(imageRepo, tag) {
    const repo = (imageRepo || '').trim();
    const t = (tag || '').trim();
    if (!repo) throw makeError('INVALID_INPUT', 'imageRepo is required');
    if (!t) throw makeError('INVALID_INPUT', 'tag is required');

    const url = buildManifestUrl(repo, t);
    const token = await this.#getToken(repo, false);

    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': this.userAgent,
        'Accept': MANIFEST_ACCEPT,
        'Authorization': `Bearer ${token}`
      }
    });

    const rateLimit = extractRateLimit(res.headers);

    if (res.status === 401) {
      const fresh = await this.#getToken(repo, true);
      const res2 = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': MANIFEST_ACCEPT,
          'Authorization': `Bearer ${fresh}`
        }
      });

      const rl2 = extractRateLimit(res2.headers) || rateLimit;

      if (res2.status === 404) {
        return { exists: false, digest: null, contentType: null, rateLimit: rl2 };
      }

      if (!res2.ok) {
        if (res2.status === 429) {
          throw makeError('REGISTRY_RATE_LIMIT', 'Docker Hub rate limit exceeded', { status: res2.status, rateLimit: rl2 });
        }
        const txt = await res2.text().catch(() => '');
        throw makeError('REGISTRY_ERROR', 'Failed to fetch manifest digest from Docker Hub', {
          status: res2.status,
          rateLimit: rl2,
          body: txt ? txt.slice(0, 500) : null
        });
      }

      const digest = safeHeaderValue(res2.headers, 'docker-content-digest');
      const contentType = safeHeaderValue(res2.headers, 'content-type');
      if (!digest) {
        throw makeError('REGISTRY_NO_DIGEST', 'Registry response missing Docker-Content-Digest header', {
          rateLimit: rl2,
          contentType
        });
      }

      return { exists: true, digest, contentType: contentType || null, rateLimit: rl2 };
    }

    if (res.status === 404) {
      return { exists: false, digest: null, contentType: null, rateLimit };
    }

    if (!res.ok) {
      if (res.status === 429) {
        throw makeError('REGISTRY_RATE_LIMIT', 'Docker Hub rate limit exceeded', { status: res.status, rateLimit });
      }
      const txt = await res.text().catch(() => '');
      throw makeError('REGISTRY_ERROR', 'Failed to fetch manifest digest from Docker Hub', {
        status: res.status,
        rateLimit,
        body: txt ? txt.slice(0, 500) : null
      });
    }

    const digest = safeHeaderValue(res.headers, 'docker-content-digest');
    const contentType = safeHeaderValue(res.headers, 'content-type');
    if (!digest) {
      throw makeError('REGISTRY_NO_DIGEST', 'Registry response missing Docker-Content-Digest header', {
        rateLimit,
        contentType
      });
    }

    return { exists: true, digest, contentType: contentType || null, rateLimit };
  }
}
