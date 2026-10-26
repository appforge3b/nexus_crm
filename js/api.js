export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Thin JSON client for the NEXUS API. Mutations carry the X-Nexus header the server requires. */
export function createApi({ fetch: fetchImpl = globalThis.fetch?.bind(globalThis), base = '' } = {}) {
  async function request(method, path, body, { keepalive = false } = {}) {
    const headers = { accept: 'application/json' };
    if (method !== 'GET') headers['x-nexus'] = '1';
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        credentials: 'same-origin',
        keepalive,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'offline', 'You appear to be offline');
    }
    if (response.status === 204) return null;
    let data = null;
    try {
      data = await response.json();
    } catch { /* non-JSON error page */ }
    if (!response.ok) {
      throw new ApiError(response.status, data?.error || 'http_error', data?.message || `Request failed (${response.status})`);
    }
    return data;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body = {}, options) => request('POST', path, body, options),
    patch: (path, body = {}) => request('PATCH', path, body),
    del: (path) => request('DELETE', path),
  };
}
