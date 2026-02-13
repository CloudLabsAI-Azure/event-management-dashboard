import axios from 'axios';
import { toast } from '@/hooks/use-toast';

// In production (Azure), use relative URLs since frontend and backend are on same server
// In development, use localhost:4000
const getApiBase = () => {
  // If VITE_API_BASE is explicitly set, use it
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  
  // In production build, use relative URLs (same origin)
  if (import.meta.env.PROD) {
    return ''; // Empty string = relative URLs
  }
  
  // In development, use localhost
  return 'http://localhost:4000';
};

const API_BASE = getApiBase();

const api = axios.create({ baseURL: API_BASE });

// attach token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken') || localStorage.getItem('dashboard_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle concurrency conflicts (409/412) from the backend
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 409 || error.response.status === 412)) {
      toast({
        title: 'Data conflict',
        description: 'Someone else updated this data. The page will refresh with the latest version.',
        variant: 'destructive',
      });
      // Give user a moment to see the toast, then reload data
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('data-conflict'));
      }, 1500);
    }
    return Promise.reject(error);
  }
);

export default api;
