import axios from 'axios'
import { useAuthStore } from '@/store/auth-store'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

let isRefreshing = false
let queue: Array<{
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}> = []

function flushQueue(error: unknown) {
  queue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(null)))
  queue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    const url = original?.url ?? ''
    if (url.includes('/auth/admin/login') || url.includes('/auth/refresh')) {
      useAuthStore.getState().clearAuth()
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject })
      }).then(() => api(original))
    }

    original._retry = true
    isRefreshing = true

    try {
      await api.post('/auth/refresh')
      flushQueue(null)
      return api(original)
    } catch (refreshError) {
      flushQueue(refreshError)
      useAuthStore.getState().clearAuth()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default api
