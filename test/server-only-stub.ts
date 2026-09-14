/**
 * `server-only` throws on import outside a React Server Component, which is
 * exactly what it is for — but it also means a plain unit test cannot import
 * any module that uses it. Vitest aliases the package to this empty module so
 * server-side logic (token hashing, encryption) stays testable without
 * weakening the guard in the actual build.
 */
export {};
