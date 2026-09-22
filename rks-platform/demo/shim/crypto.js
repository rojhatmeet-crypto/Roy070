// node:crypto voor de browserdemo. Tokens zijn echt willekeurig.
// Het wachtwoordhash is GEEN scrypt: de demo draait alleen lokaal in de browser met demowachtwoorden.
import { Buffer } from './globals.js';

export function randomBytes(n) {
  const b = new Buffer(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function scryptSync(password, salt, keylen) {
  const input = new TextEncoder().encode(`${password}\u0000${Buffer.from(salt).toString('base64')}`);
  const out = new Buffer(keylen);
  let h = 0x811c9dc5;
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < input.length; i++) { h ^= input[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    for (let i = 0; i < keylen; i++) { h ^= out[i] + round; h = Math.imul(h, 0x01000193) >>> 0; out[i] = h & 0xff; }
  }
  return out;
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
