'use strict';

/**
 * apiCache — short-lived in-memory cache for API responses.
 *
 * Purpose: Eliminates repeated DB hits for data that changes infrequently:
 *   - Role list (changes only when admin creates/edits a role)
 *   - Task stats (acceptable to be ~30s stale)
 *   - Users list (acceptable to be ~15s stale)
 *
 * This is intentionally NOT a long-lived cache — it acts as a
 * "debounce" shield for burst requests hitting the same endpoint
 * within a short window (e.g. frontend mounting multiple components).
 *
 * TTLs:
 *   - roles  → 5 minutes  (almost never changes)
 *   - stats  → 30 seconds (dashboard refresh rate)
 *   - lists  → 15 seconds (per-user, keyed by userId+params)
 */

const store = new Map(); // key → { data, expiresAt }

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
  return entry.data;
}

function set(key, data, ttlMs) {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function del(key) {
  store.delete(key);
}

/**
 * Delete all keys that start with a given prefix.
 * Use this to invalidate all cached variants of an endpoint
 * (e.g. all paginated pages of the users list).
 */
function delPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/**
 * Wrap an async function with caching.
 *
 * @param {string}   key    - Cache key
 * @param {number}   ttlMs  - TTL in milliseconds
 * @param {Function} fn     - Async function to call on cache miss
 */
async function getOrSet(key, ttlMs, fn) {
  const cached = get(key);
  if (cached !== null) return cached;
  const result = await fn();
  set(key, result, ttlMs);
  return result;
}

// Auto-clean expired entries every 2 minutes
const timer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now > v.expiresAt) store.delete(k);
  }
}, 2 * 60 * 1000);
if (timer.unref) timer.unref();

// TTL constants (export so services can use consistent values)
const TTL = {
  ROLES:       5 * 60 * 1000,  // 5 min  — roles almost never change
  STATS:           30 * 1000,  // 30 sec — dashboard widgets
  LIST:            15 * 1000,  // 15 sec — paginated lists
  MANAGER_LIST:    60 * 1000,  // 60 sec — manager dropdown
};

module.exports = { get, set, del, delPrefix, getOrSet, TTL };
