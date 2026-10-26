const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function b64urlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text) {
  const base = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base + '='.repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function decodeText(bytes) {
  return decoder.decode(bytes);
}

export function encodeText(text) {
  return encoder.encode(text);
}

export function randomToken(bytes = 32) {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function newId(prefix) {
  const hex = [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

export async function sha256(text) {
  return b64urlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Tamper-evident value for cookies: base64url(JSON) + "." + HMAC signature. */
export async function signValue(secret, payload) {
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body)));
  return `${body}.${b64urlEncode(signature)}`;
}

export async function verifyValue(secret, value) {
  if (typeof value !== 'string') return null;
  const [body, signature, extra] = value.split('.');
  if (!body || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(signature), encoder.encode(body));
    return valid ? JSON.parse(decoder.decode(b64urlDecode(body))) : null;
  } catch {
    return null;
  }
}
