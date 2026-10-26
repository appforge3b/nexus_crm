import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { resetGoogleKeyCache } from '../../server/google.js';
import { ROOT, call, claimsFor, cookiesFrom, google, json, signIdToken, signIn, tenantWithOwner } from './helpers.js';

beforeEach(() => {
  resetGoogleKeyCache();
  google.tokenFor = null;
  google.requests = [];
});

async function startLogin(next = '/') {
  const response = await call('GET', `/auth/login?next=${encodeURIComponent(next)}`);
  const location = new URL(response.headers.get('location'));
  google.lastNonce = location.searchParams.get('nonce');
  return { response, location, cookie: cookiesFrom(response).join('; ') };
}

describe('Google sign-in', () => {
  it('redirects to Google with PKCE, state and nonce, sealed in a short-lived host cookie', async () => {
    const { response, location } = await startLogin('/#/chronicle');
    expect(response.status).toBe(302);
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(location.searchParams.get('client_id')).toBe(env.GOOGLE_CLIENT_ID);
    expect(location.searchParams.get('redirect_uri')).toBe('https://scrm.test/auth/callback');
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(location.searchParams.get('state')).toBeTruthy();
    const setCookie = response.headers.getSetCookie()[0];
    expect(setCookie).toMatch(/^__Host-nexus_oauth=/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/Max-Age=600/);
  });

  it('exchanges the code with the PKCE verifier, creates a session and returns to the requested page', async () => {
    const { location, cookie } = await startLogin('/#/chronicle');
    const done = await call('GET', `/auth/callback?code=asha@gmail.com&state=${location.searchParams.get('state')}`, { cookie });
    expect(done.status).toBe(302);
    expect(done.headers.get('location')).toBe('/#/chronicle');
    const session = done.headers.getSetCookie().find((line) => line.startsWith('__Host-nexus_session='));
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);

    const tokenRequest = google.requests.find((request) => request.url.includes('oauth2.googleapis.com/token'));
    expect(new URLSearchParams(tokenRequest.init.body).get('code_verifier')).toMatch(/^[\w-]{43}$/);

    const me = await json(await call('GET', '/api/me', { cookie: session.split(';')[0] }));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('asha@gmail.com');
    expect(me.body.tenant).toBeNull();
    expect(me.body.memberships).toEqual([]);

    const stored = await env.DB.prepare('SELECT token_hash FROM sessions').all();
    expect(stored.results).toHaveLength(1);
    expect(session).not.toContain(stored.results[0].token_hash);
  });

  it('rejects a mismatched state, a forged token, a wrong audience and an unverified email', async () => {
    const first = await startLogin();
    const badState = await call('GET', '/auth/callback?code=a@gmail.com&state=nope', { cookie: first.cookie });
    expect(badState.headers.get('location')).toBe('/?auth_error=expired');

    const cases = [
      [async (email, nonce) => signIdToken(claimsFor(email, { nonce }), { kid: 'other-key' }), 'invalid'],
      [async (email, nonce) => signIdToken(claimsFor(email, { nonce, aud: 'someone-else' })), 'invalid'],
      [async (email) => signIdToken(claimsFor(email, { nonce: 'replayed' })), 'invalid'],
      [async (email, nonce) => signIdToken(claimsFor(email, { nonce, exp: Math.floor(Date.now() / 1000) - 600 })), 'invalid'],
      [async (email, nonce) => signIdToken(claimsFor(email, { nonce, email_verified: false })), 'unverified'],
      [async (email, nonce) => {
        const [header, body] = (await signIdToken(claimsFor(email, { nonce }))).split('.');
        const other = await signIdToken(claimsFor('mallory@gmail.com', { nonce }));
        return `${header}.${body}.${other.split('.')[2]}`;
      }, 'invalid'],
    ];
    for (const [tokenFor, code] of cases) {
      google.tokenFor = tokenFor;
      const attempt = await startLogin();
      const done = await call('GET', `/auth/callback?code=eve@gmail.com&state=${attempt.location.searchParams.get('state')}`, { cookie: attempt.cookie });
      expect(done.headers.get('location')).toBe(`/?auth_error=${code}`);
      expect(cookiesFrom(done).some((pair) => pair.startsWith('__Host-nexus_session'))).toBe(false);
    }
    const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    expect(users.n).toBe(0);
  });

  it('reports a cancelled Google consent screen and ignores off-site return paths', async () => {
    const cancelled = await call('GET', '/auth/callback?error=access_denied');
    expect(cancelled.headers.get('location')).toBe('/?auth_error=cancelled');

    const { location, cookie } = await startLogin('//evil.example/steal');
    const done = await call('GET', `/auth/callback?code=asha@gmail.com&state=${location.searchParams.get('state')}`, { cookie });
    expect(done.headers.get('location')).toBe('/');
  });

  it('signs out by deleting the session', async () => {
    const cookie = await signIn('asha@gmail.com');
    const out = await call('POST', '/auth/logout', { cookie });
    expect(out.status).toBe(204);
    expect(out.headers.getSetCookie()[0]).toMatch(/Max-Age=0/);
    expect((await call('GET', '/api/me', { cookie })).status).toBe(401);
  });

  it('accepts a pending invitation at sign-in and opens that workspace directly', async () => {
    const { tenant, owner } = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    const me = await json(await call('GET', '/api/me', { cookie: owner }));
    expect(me.body.tenant).toEqual({ id: tenant.id, name: 'Helios Bank', slug: 'helios-bank', role: 'owner' });
    expect(me.body.superAdmin).toBe(false);

    const root = await json(await call('GET', '/api/me', { cookie: await signIn(ROOT) }));
    expect(root.body.superAdmin).toBe(true);
    expect(root.body.tenant).toBeNull();
  });

  it('keeps the dev login switched off unless DEV_LOGIN is set on localhost', async () => {
    const response = await call('GET', '/auth/dev?email=a@b.co');
    expect(response.status).toBe(404);
  });
});

describe('API guard rails', () => {
  it('requires a session for API calls', async () => {
    const response = await json(await call('GET', '/api/data'));
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('unauthenticated');
  });

  it('blocks cross-site and header-less mutations', async () => {
    const { owner } = await tenantWithOwner('Helios Bank', 'priya@gmail.com');
    const foreign = await call('POST', '/api/changes', { cookie: owner, origin: 'https://evil.example', body: { ops: [] } });
    expect(foreign.status).toBe(403);
    const noHeader = await call('POST', '/api/changes', { cookie: owner, csrf: false, body: { ops: [] } });
    expect(noHeader.status).toBe(403);
    const fine = await call('POST', '/api/changes', { cookie: owner, body: { ops: [] } });
    expect(fine.status).toBe(200);
  });

  it('answers unknown routes and methods with JSON errors', async () => {
    expect((await json(await call('GET', '/api/nope'))).body.error).toBe('not_found');
    expect((await call('PUT', '/api/data')).status).toBe(405);
  });
});
