import { HttpError, empty, parseCookies, redirect, serializeCookie } from './http.js';
import { randomToken, sha256, signValue, verifyValue } from './crypto.js';
import { GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL, verifyIdToken } from './google.js';
import { clearedCookie, cookieNames, createSession, destroySession, isSecure, sessionCookie } from './session.js';
import { acceptInvitations, membershipsFor, upsertGoogleUser } from './repo.js';

const OAUTH_TTL_MS = 10 * 60 * 1000;

function requireConfig(env, keys) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) throw new HttpError(500, 'not_configured', `Sign-in is not configured yet (missing ${missing.join(', ')})`);
}

/** Only same-origin paths survive the round trip through Google. */
export function safeNext(value) {
  const next = String(value || '/');
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

function failTo(url, code) {
  return redirect(`/?auth_error=${encodeURIComponent(code)}`, [clearedCookie(url, 'oauth')]);
}

async function signIn(ctx, claims, next) {
  const { db, now, url } = ctx;
  const user = await upsertGoogleUser(db, claims, now);
  await acceptInvitations(db, user, now);
  const memberships = await membershipsFor(db, user.id);
  const token = await createSession(db, { userId: user.id, tenantId: memberships.length === 1 ? memberships[0].tenantId : null, now });
  return redirect(safeNext(next), [clearedCookie(url, 'oauth'), sessionCookie(url, token)]);
}

export async function login(ctx) {
  const { env, url, now } = ctx;
  requireConfig(env, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'COOKIE_SECRET']);
  const state = randomToken(16);
  const verifier = randomToken(32);
  const nonce = randomToken(16);
  const next = safeNext(url.searchParams.get('next'));
  const sealed = await signValue(env.COOKIE_SECRET, { state, verifier, nonce, next, exp: now.getTime() + OAUTH_TTL_MS });

  const target = new URL(GOOGLE_AUTH_URL);
  target.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: await sha256(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return redirect(target, [serializeCookie(cookieNames(url).oauth, sealed, { maxAge: OAUTH_TTL_MS / 1000, secure: isSecure(url) })]);
}

export async function callback(ctx) {
  const { env, url, now, request } = ctx;
  requireConfig(env, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'COOKIE_SECRET']);
  const googleError = url.searchParams.get('error');
  if (googleError) return failTo(url, googleError === 'access_denied' ? 'cancelled' : 'google_error');

  const stored = await verifyValue(env.COOKIE_SECRET, parseCookies(request.headers.get('cookie'))[cookieNames(url).oauth]);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!stored || stored.exp < now.getTime() || !state || stored.state !== state || !code) return failTo(url, 'expired');

  const response = await ctx.fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/auth/callback`,
      grant_type: 'authorization_code',
      code_verifier: stored.verifier,
    }).toString(),
  });
  if (!response.ok) return failTo(url, 'google_error');
  const tokens = await response.json();

  let claims;
  try {
    claims = await verifyIdToken(tokens.id_token, { clientId: env.GOOGLE_CLIENT_ID, nonce: stored.nonce, fetch: ctx.fetch, now: now.getTime() });
  } catch (error) {
    return failTo(url, error.code === 'email_unverified' ? 'unverified' : 'invalid');
  }
  return signIn(ctx, claims, stored.next);
}

export async function logout(ctx) {
  const token = parseCookies(ctx.request.headers.get('cookie'))[cookieNames(ctx.url).session];
  await destroySession(ctx.db, token);
  return empty({ cookies: [clearedCookie(ctx.url, 'session')] });
}

/** Local development only: signs in as any email without Google. Requires DEV_LOGIN=true and a localhost URL. */
export async function devLogin(ctx) {
  const { env, url } = ctx;
  if (env.DEV_LOGIN !== 'true' || !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new HttpError(404, 'not_found', 'Not found');
  }
  const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'bad_email', 'Pass ?email=you@example.com');
  return signIn(ctx, { sub: `dev:${email}`, email, name: url.searchParams.get('name') || '', email_verified: true }, url.searchParams.get('next'));
}
