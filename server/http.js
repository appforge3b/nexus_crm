export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(body, { status = 200, cookies = [] } = {}) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export function empty({ status = 204, cookies = [] } = {}) {
  const headers = new Headers({ 'cache-control': 'no-store' });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status, headers });
}

export function redirect(location, cookies = []) {
  const headers = new Headers({ location: String(location), 'cache-control': 'no-store' });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
}

export function errorResponse(error) {
  if (error instanceof HttpError) {
    return json({ error: error.code, message: error.message }, { status: error.status });
  }
  console.error(error);
  return json({ error: 'server_error', message: 'Something went wrong on our side. Please try again.' }, { status: 500 });
}

export async function readJson(request, limit = 1_000_000) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) throw new HttpError(413, 'too_large', 'That request is too large');
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, 'too_large', 'That request is too large');
  let value;
  try {
    value = text ? JSON.parse(text) : {};
  } catch {
    value = null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'bad_json', 'The request body must be a JSON object');
  }
  return value;
}

export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name || name in cookies) continue;
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      cookies[name] = part.slice(index + 1).trim();
    }
  }
  return cookies;
}

export function serializeCookie(name, value, { maxAge, secure = true, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
