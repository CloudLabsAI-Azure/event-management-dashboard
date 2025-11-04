export function isValidUrl(value?: string) {
  if (!value) return false
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch (err) {
    return false
  }
}

export function isNonEmptyString(s?: string, minLen = 1) {
  return typeof s === 'string' && s.trim().length >= minLen
}

export function isInRange(n: number | undefined, min: number, max: number) {
  if (typeof n !== 'number') return false
  return n >= min && n <= max
}
