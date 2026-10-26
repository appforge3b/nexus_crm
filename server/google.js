import { HttpError } from './http.js';
import { b64urlDecode, decodeText, encodeText } from './crypto.js';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CLOCK_SKEW_SEC = 60;

let keyCache = null;

export function resetGoogleKeyCache() {
  keyCache = null;
}

function invalid(message = 'Google sign-in could not be verified') {
  return new HttpError(401, 'invalid_token', message);
}

async function signingKeys(fetchImpl, nowMs, { refresh = false } = {}) {
  if (!refresh && keyCache && keyCache.expires > nowMs) return keyCache.keys;
  const response = await fetchImpl(GOOGLE_CERTS_URL);
  if (!response.ok) throw new HttpError(502, 'google_unavailable', 'Google sign-in is unavailable right now');
  const body = await response.json();
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') || '')?.[1] || 3600);
  keyCache = { keys: Array.isArray(body.keys) ? body.keys : [], expires: nowMs + Math.min(maxAge, 86400) * 1000 };
  return keyCache.keys;
}

function decodePart(part) {
  return JSON.parse(decodeText(b64urlDecode(part)));
}

/** Verifies a Google ID token's RS256 signature against Google's published keys, then its claims. */
export async function verifyIdToken(idToken, { clientId, nonce, fetch: fetchImpl, now = Date.now() }) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw invalid();
  let header;
  let claims;
  try {
    header = decodePart(parts[0]);
    claims = decodePart(parts[1]);
  } catch {
    throw invalid();
  }
  if (header.alg !== 'RS256' || !header.kid) throw invalid();

  let jwk = (await signingKeys(fetchImpl, now)).find((key) => key.kid === header.kid);
  if (!jwk) jwk = (await signingKeys(fetchImpl, now, { refresh: true })).find((key) => key.kid === header.kid);
  if (!jwk) throw invalid();

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), encodeText(`${parts[0]}.${parts[1]}`));
  } catch {
    valid = false;
  }
  if (!valid) throw invalid();

  const nowSec = Math.floor(now / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ISSUERS.has(claims.iss) || !audiences.includes(clientId)) throw invalid();
  if (typeof claims.exp !== 'number' || claims.exp < nowSec - CLOCK_SKEW_SEC) throw invalid('That sign-in has expired');
  if (typeof claims.iat === 'number' && claims.iat > nowSec + 5 * CLOCK_SKEW_SEC) throw invalid();
  if (nonce && claims.nonce !== nonce) throw invalid();
  if (!claims.sub || !claims.email) throw invalid();
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw new HttpError(403, 'email_unverified', 'Your Google email address is not verified');
  }
  return claims;
}
