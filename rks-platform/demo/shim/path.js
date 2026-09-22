export const dirname = (p) => String(p).replace(/\/[^/]*$/, '') || '/';
export const join = (...parts) => parts.join('/').replace(/\/+/g, '/');
