import api from '@/lib/api'

// Sanitize date fields - convert empty strings to null for proper data type handling
const sanitizeDates = (item: any) => {
  const dateFields = ['lastTestDate', 'eventDate', 'sessionDate', 'approvalDate'];
  const sanitized = { ...item };
  for (const field of dateFields) {
    if (sanitized[field] === '' || sanitized[field] === undefined) {
      sanitized[field] = null;
    }
  }
  return sanitized;
};

export default {
  list: async () => {
    const res = await api.get('/api/catalog')
    return Array.isArray(res.data) ? res.data : []
  },
  create: async (item: any) => {
    const res = await api.post('/api/catalog', sanitizeDates(item))
    try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch (e) { }
    return res.data && res.data.item ? res.data.item : res.data
  },
  update: async (id: string | number, item: any) => {
    await api.put(`/api/catalog/${String(id)}`, sanitizeDates(item))
    try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch (e) { }
  },
  remove: async (id: string | number) => {
    await api.delete(`/api/catalog/${String(id)}`)
    try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch (e) { }
  },
}
