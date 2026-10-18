// Narrowing helpers for `{ ok: true, ... } | { ok: false, ... }` results.
// The backend compiles this module with `strict: false`, where `if (!r.ok)` does NOT narrow such unions.
// Type predicates narrow in both modes, so this file keeps the module type-safe under both configurations.

export function failed<T extends { ok: boolean }>(r: T): r is Extract<T, { ok: false }> {
  return !r.ok
}

export function succeeded<T extends { ok: boolean }>(r: T): r is Extract<T, { ok: true }> {
  return r.ok
}
