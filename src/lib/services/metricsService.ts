import api from '@/lib/api'

export type MetricsPayload = Record<string, any>

// Fetch metrics object; return {} if none
async function get(): Promise<any> {
  try {
    const res = await api.get('/api/metrics')
    return res.data || {}
  } catch (err: any) {
    // backend returns 404 if no metrics yet
    if (err && err.response && err.response.status === 404) return {}
    throw err
  }
}

// Replace entire metrics object
async function update(payload: MetricsPayload): Promise<any> {
  const res = await api.put('/api/metrics', payload)
  const saved = (res.data && res.data.metrics) ? res.data.metrics : payload
  try { window.dispatchEvent(new CustomEvent('metrics:changed', { detail: saved })) } catch {}
  return saved
}

// Merge partial.metrics into existing metrics and persist
async function savePartial(partial: { metrics: MetricsPayload }): Promise<any> {
  const current = await get()
  const nextMetrics = { ...(current || {}), ...(partial?.metrics || {}) }
  return await update(nextMetrics)
}

export default {
  get,
  update,
  savePartial,
}
