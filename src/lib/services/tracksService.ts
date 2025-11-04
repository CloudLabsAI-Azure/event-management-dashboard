import api from '@/lib/api'

export default {
  list: async () => {
    const res = await api.get('/api/tracks')
    return Array.isArray(res.data) ? res.data : []
  },
  create: async (item: any) => {
    const res = await api.post('/api/tracks', item)
    return res.data && res.data.item ? res.data.item : res.data
  },
  update: async (id: string | number, item: any) => {
    await api.put(`/api/tracks/${String(id)}`, item)
  },
  remove: async (id: string | number) => {
    await api.delete(`/api/tracks/${String(id)}`)
  },
}
