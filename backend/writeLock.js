/**
 * Async Mutex / Write Lock for serializing read-modify-write operations.
 * 
 * Since all application data lives in a single data.json blob, concurrent
 * write operations can cause lost updates. This module provides a simple
 * promise-chain mutex that ensures only one write operation runs at a time
 * within this Node.js process.
 * 
 * Usage:
 *   import { withLock } from './writeLock.js';
 *   
 *   const result = await withLock(async () => {
 *     const data = await readData();
 *     data.items.push(newItem);
 *     await writeData(data);
 *     return data;
 *   });
 */

const LOCK_TIMEOUT_MS = 30000; // 30 seconds max wait

let _lockChain = Promise.resolve();
let _waitingCount = 0;
let _currentHolder = null; // For debugging

/**
 * Execute an async function while holding the write lock.
 * Only one function can hold the lock at a time — others queue up.
 * 
 * @param {Function} fn - Async function to run while holding the lock
 * @param {string} [label] - Optional label for logging/debugging
 * @returns {Promise<*>} The return value of fn
 * @throws {Error} If fn throws, or if the lock times out
 */
export function withLock(fn, label = 'unknown') {
  return new Promise((resolve, reject) => {
    const prev = _lockChain;

    // Chain onto previous operation. Use .then() so the chain always
    // continues even if the previous operation failed.
    _lockChain = prev.catch(() => {/* swallow — previous error already handled */}).then(async () => {
      // Track contention — only log if someone was actually holding the lock
      if (_currentHolder !== null) {
        console.log(`🔒 Lock contention: "${label}" waited (held by "${_currentHolder}", ${_waitingCount} queued)`);
      }

      _currentHolder = label;
      _waitingCount = Math.max(0, _waitingCount - 1);

      // Create a timeout race so a hung network call can't permanently block the lock
      let timeoutId;
      const timeoutPromise = new Promise((_, rej) => {
        timeoutId = setTimeout(() => {
          rej(new Error(`Write lock timeout after ${LOCK_TIMEOUT_MS}ms for operation: "${label}"`));
        }, LOCK_TIMEOUT_MS);
      });

      try {
        const result = await Promise.race([fn(), timeoutPromise]);
        clearTimeout(timeoutId);
        _currentHolder = null;
        resolve(result);
      } catch (err) {
        clearTimeout(timeoutId);
        _currentHolder = null;
        console.error(`🔓 Lock released after error in "${label}":`, err.message || err);
        reject(err);
      }
    });

    _waitingCount++;
  });
}

/**
 * Get current lock status (for diagnostics/monitoring)
 * @returns {{ isLocked: boolean, currentHolder: string|null, waitingCount: number }}
 */
export function getLockStatus() {
  return {
    isLocked: _currentHolder !== null,
    currentHolder: _currentHolder,
    waitingCount: _waitingCount
  };
}
