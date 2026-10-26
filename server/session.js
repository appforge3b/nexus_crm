import { randomToken, sha256 } from './crypto.js';
import { serializeCookie } from './http.js';

const DAY_MS = 86_400_000;
export const SESSION_DAYS = 30;

export function isSecure(url) {
  return url.protocol === 'https:';
}

/** `__Host-` cookies must be Secure, so plain-http localhost development uses unprefixed names. */
export function cookieNames(url) {
  return isSecure(url)
    ? { session: '__Host-nexus_session', oauth: '__Host-nexus_oauth' }
    : { session: 'nexus_session', oauth: 'nexus_oauth' };
}

export function sessionCookie(url, token) {
  return serializeCookie(cookieNames(url).session, token, { maxAge: SESSION_DAYS * 86400, secure: isSecure(url) });
}

export function clearedCookie(url, which) {
  return serializeCookie(cookieNames(url)[which], '', { maxAge: 0, secure: isSecure(url) });
}

export async function createSession(db, { userId, tenantId = null, now }) {
  const token = randomToken(32);
  await db.prepare('INSERT INTO sessions (token_hash, user_id, tenant_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(await sha256(token), userId, tenantId, now.toISOString(), new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString())
    .run();
  return token;
}

export async function loadSession(db, token, now) {
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await db.prepare(`
    SELECT s.token_hash, s.tenant_id, s.expires_at, u.id, u.email, u.name, u.picture
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?1 AND s.expires_at > ?2`).bind(tokenHash, now.toISOString()).first();
  if (!row) return null;
  return {
    tokenHash,
    tenantId: row.tenant_id,
    expiresAt: row.expires_at,
    user: { id: row.id, email: row.email, name: row.name, picture: row.picture },
  };
}

/** Sliding expiry: renews at most once a day so active users stay signed in. */
export async function renewSession(db, session, now) {
  const remaining = new Date(session.expiresAt).getTime() - now.getTime();
  if (remaining > (SESSION_DAYS - 1) * DAY_MS) return false;
  await db.prepare('UPDATE sessions SET expires_at = ?2 WHERE token_hash = ?1')
    .bind(session.tokenHash, new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString())
    .run();
  return true;
}

export async function destroySession(db, token) {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(token)).run();
}

export async function setSessionTenant(db, tokenHash, tenantId) {
  await db.prepare('UPDATE sessions SET tenant_id = ?2 WHERE token_hash = ?1').bind(tokenHash, tenantId).run();
}
