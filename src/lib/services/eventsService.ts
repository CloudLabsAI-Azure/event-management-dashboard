import api from '@/lib/api'

export default {
  list: async () => {
    const res = await api.get('/api/events')
    return Array.isArray(res.data) ? res.data : []
  },
  create: async (item: any) => {
    const res = await api.post('/api/events', item)
  // notify listeners that events changed
  try { window.dispatchEvent(new CustomEvent('events:changed')) } catch (e) { /* noop for server-side */ }
    return res.data && res.data.item ? res.data.item : res.data
  },
  update: async (id: string | number, item: any) => {
    await api.put(`/api/events/${String(id)}`, item)
  try { window.dispatchEvent(new CustomEvent('events:changed')) } catch (e) { }
  },
  remove: async (id: string | number) => {
    await api.delete(`/api/events/${String(id)}`)
  try { window.dispatchEvent(new CustomEvent('events:changed')) } catch (e) { }
  },
}
