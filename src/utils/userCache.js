'use strict';

/**
 * Lightweight in-memory TTL cache for user objects.
 *
 * Problem: Every API request would call db.User.findOne() + a role JOIN in authenticate().
 *          On Neon free tier this adds 100-500ms per request.
 *
 * Solution: Cache the user object keyed by userId for TTL seconds (default 60s).
 *           On role/status changes the cache entry is explicitly evicted.
 *
 * NOT a replacement for a real Redis cache in production — this is per-process
 * in-memory only (fine for a single-instance Node server).
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes (was 60s — longer TTL = more cache hits on remote DB)

const store = new Map(); // userId -> { user, expiresAt }

/**
 * Get a cached user or null if miss / expired.
 */
function getUser(userId) {
  const entry = store.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(userId);
    return null;
  }
  return entry.user;
}

/**
 * Store a user in cache.
 */
function setUser(userId, user, ttlMs = DEFAULT_TTL_MS) {
  store.set(userId, { user, expiresAt: Date.now() + ttlMs });
}

/**
 * Explicitly evict a user from cache.
 * Call this whenever role, status, or profile changes.
 */
function invalidateUser(userId) {
  store.delete(userId);
}

/**
 * Clear the entire cache (e.g., on graceful shutdown).
 */
function clearAll() {
  store.clear();
}

/**
 * Cache stats (for debug / monitoring).
 */
function stats() {
  return { size: store.size };
}

// Auto-clean expired entries every 5 minutes
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 5 * 60 * 1000);

if (cleanupTimer.unref) cleanupTimer.unref();

module.exports = { getUser, setUser, invalidateUser, clearAll, stats };
