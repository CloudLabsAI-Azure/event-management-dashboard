import api from '@/lib/api'

// Sanitize date fields - convert empty strings to null for proper data type handling
const sanitizeDates = (item: any) => {
  const dateFields = ['lastTestDate', 'eventDate', 'sessionDate'];
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
    const res = await api.get('/api/tracks')
    return Array.isArray(res.data) ? res.data : []
  },
  create: async (item: any) => {
    const res = await api.post('/api/tracks', sanitizeDates(item))
    return res.data && res.data.item ? res.data.item : res.data
  },
  update: async (id: string | number, item: any) => {
    await api.put(`/api/tracks/${String(id)}`, sanitizeDates(item))
  },
  remove: async (id: string | number) => {
    await api.delete(`/api/tracks/${String(id)}`)
  },
}
