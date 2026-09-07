import { decodeJwtExpiry, isTokenUsable, RmpApiError, verifyRmpAccess } from './rmpService.js';

/** An in-memory cache of upstream-verified credentials. Never persisted or serialized. */
export function createRmpTokenCache({ verifyAccess = verifyRmpAccess } = {}) {
  let entry = null;
  let nextAttempt = 0;
  let acceptedAttempt = 0;

  function get() {
    if (entry && !isTokenUsable(entry.token)) entry = null;
    return entry;
  }

  // An old failed request must not evict a different, newly verified token.
  function invalidate(token) {
    if (entry?.token === token) entry = null;
  }

  async function cacheIfAuthorized(token, email) {
    const attempt = ++nextAttempt;
    if (!isTokenUsable(token)) {
      invalidate(token);
      throw new RmpApiError('B2C token is expired or invalid. Please sign in again.', 401);
    }

    try {
      const authorized = await verifyAccess(token);
      if (authorized !== true) {
        throw new RmpApiError('RMP access could not be confirmed. Token not cached.', 403);
      }
    } catch (err) {
      if (err instanceof RmpApiError && (err.statusCode === 401 || err.statusCode === 403)) {
        invalidate(token);
      }
      // In particular, a timeout or another user's denied token leaves the
      // currently verified credential untouched.
      throw err;
    }

    if (!isTokenUsable(token)) {
      invalidate(token);
      throw new RmpApiError('B2C token expired during its RMP access check.', 401);
    }

    // A slow, older probe must not replace a newer successfully checked token.
    if (attempt > acceptedAttempt) {
      acceptedAttempt = attempt;
      entry = Object.freeze({
        token,
        email: email || 'unknown',
        expiresAt: decodeJwtExpiry(token),
        verifiedAt: Date.now(),
      });
    }
  }

  return { get, cacheIfAuthorized, invalidate };
}