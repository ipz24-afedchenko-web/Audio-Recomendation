import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/* ── Auth ── */

export const authAPI = {
  register: (data) => api.post('/auth/register', data),

  login: async (username, password) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    return api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  },

  getMe: () => api.get('/auth/me'),
};

/* ── Music ── */

export const musicAPI = {
  upload: (formData) =>
    api.post('/music/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  getById: (id) => api.get(`/music/${id}`),

  getUserMusic: (userId) => api.get(`/music/user/${userId}`),

  update: (id, data) => api.put(`/music/${id}`, data),

  delete: (id) => api.delete(`/music/${id}`),

  autoTag: (formData) =>
    api.post('/music/auto-tag', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  aiStatus: () => api.get('/music/ai-status'),
};

/* ── Analysis ── */

export const analyzeAPI = {
  analyze: (musicId) => api.post(`/analyze/${musicId}`),

  getFeatures: (musicId) => api.get(`/analyze/features/${musicId}`),
};

/* ── Recommendations ── */

export const recommendAPI = {
  get: (musicId, limit = 10, algorithm = 3) =>
    api.get(`/recommend/${musicId}`, { params: { limit, algorithm } }),

  getUserHistory: (userId) => api.get(`/recommend/user/${userId}`),

  train: (nClusters = 8) =>
    api.post('/recommend/train', null, { params: { n_clusters: nClusters } }),

  getClusters: () => api.get('/recommend/clusters'),

  trainGenre: () => api.post('/recommend/train-genre'),

  predictGenre: (musicId) => api.post(`/recommend/predict-genre/${musicId}`),
};

export default api;
