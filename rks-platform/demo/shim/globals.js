// Node-globals die de platformcode gebruikt, voor de browser.
export const process = { env: {}, argv: [] };

export class Buffer extends Uint8Array {
  static from(input, enc) {
    if (typeof input !== 'string') { const b = new Buffer(input.length); b.set(input); return b; }
    if (enc === 'base64' || enc === 'base64url') {
      const s = input.replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(s.padEnd(Math.ceil(s.length / 4) * 4, '='));
      const b = new Buffer(bin.length);
      for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
      return b;
    }
    const u = new TextEncoder().encode(input);
    const b = new Buffer(u.length); b.set(u); return b;
  }

  toString(enc) {
    if (enc === 'base64' || enc === 'base64url') {
      let bin = '';
      for (let i = 0; i < this.length; i++) bin += String.fromCharCode(this[i]);
      const out = btoa(bin);
      return enc === 'base64' ? out : out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    if (enc === 'hex') return Array.from(this, (c) => c.toString(16).padStart(2, '0')).join('');
    return new TextDecoder().decode(this);
  }
}
