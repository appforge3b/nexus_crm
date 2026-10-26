import { HttpError, errorResponse, parseCookies } from './http.js';
import { cookieNames, loadSession, renewSession, sessionCookie, setSessionTenant } from './session.js';
import { membershipsFor } from './repo.js';
import * as auth from './auth.js';
import * as api from './api.js';

const RANK = { member: 0, admin: 1, owner: 2 };

/** [method, pattern, handler, access]. access: 'public' | 'user' | 'super' | 'member' | 'admin' | 'owner'. */
const ROUTES = [
  ['GET', '/auth/login', auth.login, 'public'],
  ['GET', '/auth/callback', auth.callback, 'public'],
  ['POST', '/auth/logout', auth.logout, 'public'],
  ['GET', '/auth/dev', auth.devLogin, 'public'],
  ['GET', '/api/me', api.me, 'user'],
  ['POST', '/api/session/tenant', api.switchTenant, 'user'],
  ['PATCH', '/api/workspace', api.renameWorkspace, 'admin'],
  ['GET', '/api/members', api.listMembers, 'member'],
  ['PATCH', '/api/members/:userId', api.updateMember, 'admin'],
  ['DELETE', '/api/members/:userId', api.removeMember, 'member'],
  ['POST', '/api/invitations', api.createInvitation, 'admin'],
  ['DELETE', '/api/invitations/:id', api.revokeInvitation, 'admin'],
  ['GET', '/api/admin/tenants', api.adminListTenants, 'super'],
  ['POST', '/api/admin/tenants', api.adminCreateTenant, 'super'],
  ['PATCH', '/api/admin/tenants/:id', api.adminUpdateTenant, 'super'],
  ['POST', '/api/admin/tenants/:id/invitations', api.adminInvite, 'super'],
  ['GET', '/api/data', api.pull, 'member'],
  ['POST', '/api/changes', api.push, 'member'],
  ['POST', '/api/import', api.importDocument, 'owner'],
  ['POST', '/api/clear', api.clearData, 'owner'],
].map(([method, pattern, handler, access]) => ({
  method,
  handler,
  access,
  keys: [...pattern.matchAll(/:(\w+)/g)].map((match) => match[1]),
  regex: new RegExp(`^${pattern.replace(/:(\w+)/g, '([^/]+)')}$`),
}));

function match(method, pathname) {
  let pathMatched = false;
  for (const route of ROUTES) {
    const found = route.regex.exec(pathname);
    if (!found) continue;
    pathMatched = true;
    if (route.method !== method) continue;
    const params = {};
    route.keys.forEach((key, index) => { params[key] = decodeURIComponent(found[index + 1]); });
    return { route, params };
  }
  if (pathMatched) throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
  throw new HttpError(404, 'not_found', 'Not found');
}

/** Mutations must come from this origin's own scripts: a matching Origin and the custom X-Nexus header. */
function checkCsrf(request, url) {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  if (request.headers.get('origin') !== url.origin || request.headers.get('x-nexus') !== '1') {
    throw new HttpError(403, 'csrf', 'Request blocked. Reload NEXUS and try again.');
  }
}

function superAdmins(env) {
  return new Set(String(env.SUPER_ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

async function authenticate(ctx) {
  const token = parseCookies(ctx.request.headers.get('cookie'))[cookieNames(ctx.url).session];
  const session = await loadSession(ctx.db, token, ctx.now);
  if (!session) throw new HttpError(401, 'unauthenticated', 'Please sign in');
  if (await renewSession(ctx.db, session, ctx.now)) ctx.cookies.push(sessionCookie(ctx.url, token));

  const memberships = await membershipsFor(ctx.db, session.user.id);
  let current = memberships.find((item) => item.tenantId === session.tenantId) ?? null;
  if (!current && memberships.length === 1) current = memberships[0];
  if ((current?.tenantId ?? null) !== session.tenantId) {
    await setSessionTenant(ctx.db, session.tokenHash, current?.tenantId ?? null);
  }
  ctx.auth = {
    session,
    user: session.user,
    memberships,
    superAdmin: superAdmins(ctx.env).has(session.user.email.toLowerCase()),
    tenantId: current?.tenantId ?? null,
    role: current?.role ?? null,
  };
}

function authorize(ctx, access) {
  if (access === 'user') return;
  if (access === 'super') {
    if (!ctx.auth.superAdmin) throw new HttpError(403, 'forbidden', 'Only NEXUS administrators can do that');
    return;
  }
  if (!ctx.auth.tenantId) throw new HttpError(403, 'no_workspace', 'Choose a workspace first');
  if (RANK[ctx.auth.role] < RANK[access]) {
    throw new HttpError(403, 'forbidden', access === 'owner' ? 'Only a workspace owner can do that' : 'Only workspace admins can do that');
  }
}

export async function handleRequest(request, env, { fetch: fetchImpl = globalThis.fetch.bind(globalThis), now = () => new Date() } = {}) {
  const url = new URL(request.url);
  const ctx = { request, env, url, db: env.DB, fetch: fetchImpl, now: now(), params: {}, cookies: [], auth: null };
  try {
    const { route, params } = match(request.method, url.pathname);
    ctx.params = params;
    if (url.pathname.startsWith('/api/') || route.method !== 'GET') checkCsrf(request, url);
    if (route.access !== 'public') {
      if (!env.DB) throw new HttpError(500, 'not_configured', 'The database is not configured');
      await authenticate(ctx);
      authorize(ctx, route.access);
    }
    const response = await route.handler(ctx);
    for (const cookie of ctx.cookies) response.headers.append('set-cookie', cookie);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
