import { env } from 'cloudflare:test';
import { handleRequest } from '../../server/app.js';
import { b64urlEncode } from '../../server/crypto.js';
import { GOOGLE_CERTS_URL, GOOGLE_TOKEN_URL } from '../../server/google.js';

export const ORIGIN = 'https://scrm.test';
export const ROOT = 'root@nexus.test';

const encoder = new TextEncoder();
const keys = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);
const publicJwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };

export async function signIdToken(claims, { kid = 'test-key', key = keys.privateKey } = {}) {
  const header = b64urlEncode(encoder.encode(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })));
  const body = b64urlEncode(encoder.encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${body}`)));
  return `${header}.${body}.${b64urlEncode(signature)}`;
}

export function claimsFor(email, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://accounts.google.com',
    aud: env.GOOGLE_CLIENT_ID,
    sub: `google-${email}`,
    email,
    email_verified: true,
    name: email.split('@')[0].replace(/^\w/, (c) => c.toUpperCase()),
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}

/** Pretend Google: the authorization "code" is the email to sign in as; `tokenFor` can override the ID token. */
export const google = {
  tokenFor: null,
  requests: [],
  async fetch(input, init = {}) {
    const url = String(input instanceof Request ? input.url : input);
    google.requests.push({ url, init });
    if (url === GOOGLE_CERTS_URL) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { 'cache-control': 'public, max-age=3600' } });
    }
    if (url === GOOGLE_TOKEN_URL) {
      const form = new URLSearchParams(init.body);
      const email = form.get('code');
      const nonce = google.lastNonce;
      const idToken = google.tokenFor ? await google.tokenFor(email, nonce) : await signIdToken(claimsFor(email, { nonce }));
      return new Response(JSON.stringify({ id_token: idToken, access_token: 'unused' }));
    }
    return new Response('not found', { status: 404 });
  },
};

export function call(method, path, { body, cookie, headers = {}, origin = ORIGIN, csrf = true } = {}) {
  const init = { method, headers: { ...headers }, redirect: 'manual' };
  if (cookie) init.headers.cookie = cookie;
  if (method !== 'GET' && method !== 'HEAD') {
    if (origin) init.headers.origin = origin;
    if (csrf) init.headers['x-nexus'] = '1';
  }
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return handleRequest(new Request(`${ORIGIN}${path}`, init), env, { fetch: google.fetch });
}

export function cookiesFrom(response) {
  return response.headers.getSetCookie().map((line) => line.split(';')[0]).filter((pair) => !pair.endsWith('='));
}

/** Runs the full redirect flow through /auth/login and /auth/callback and returns the session cookie. */
export async function signIn(email) {
  const start = await call('GET', '/auth/login?next=/%23/pipeline');
  const location = new URL(start.headers.get('location'));
  google.lastNonce = location.searchParams.get('nonce');
  const oauthCookie = cookiesFrom(start).join('; ');
  const done = await call('GET', `/auth/callback?code=${encodeURIComponent(email)}&state=${location.searchParams.get('state')}`, { cookie: oauthCookie });
  if (done.status !== 302) throw new Error(`sign in failed: ${done.status}`);
  const session = cookiesFrom(done).find((pair) => pair.startsWith('__Host-nexus_session='));
  if (!session) throw new Error(`no session for ${email}: ${done.headers.get('location')}`);
  return session;
}

export async function json(response) {
  return { status: response.status, body: await response.json() };
}

/** Creates a tenant as the super admin and signs its owner in. */
export async function tenantWithOwner(name, ownerEmail, id) {
  const root = await signIn(ROOT);
  const created = await json(await call('POST', '/api/admin/tenants', { cookie: root, body: { name, ownerEmail, id } }));
  if (created.status !== 201) throw new Error(JSON.stringify(created.body));
  const owner = await signIn(ownerEmail);
  return { tenant: created.body.tenant, owner, root };
}

export async function addMember(ownerCookie, email, role = 'member') {
  const invited = await call('POST', '/api/invitations', { cookie: ownerCookie, body: { email, role } });
  if (invited.status !== 201) throw new Error(`invite failed ${invited.status}`);
  return signIn(email);
}

export function contact(id, name = 'Asha Rao', extra = {}) {
  return { id, name, email: '', phone: '', company: '', companyId: null, tags: [], status: 'prospect', ...extra };
}
