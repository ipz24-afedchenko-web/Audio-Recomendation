import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Redirect to login on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login';
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

  logout: () => api.post('/auth/logout'),

  getMe: () => api.get('/auth/me'),
};

/* ── Music ── */

export const musicAPI = {
  upload: (formData) =>
    api.post('/music/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  getById: (id) => api.get(`/music/${id}`),

  getUserMusic: (userId, limit = 5000) => api.get(`/music/user/${userId}?limit=${limit}`),

  update: (id, data) => api.put(`/music/${id}`, data),

  delete: (id) => api.delete(`/music/${id}`),

  /** Delete multiple tracks in parallel. Returns { succeeded, failed } id arrays. */
  bulkDelete: async (ids) => {
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/music/${id}`)));
    const succeeded = [];
    const failed = [];
    results.forEach((r, i) => (r.status === 'fulfilled' ? succeeded : failed).push(ids[i]));
    return { succeeded, failed };
  },

  autoTag: (formData) =>
    api.post('/music/auto-tag', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  aiStatus: () => api.get('/music/ai-status'),

  /** Bulk-move tracks into (or out of) a folder.
   *  @param {Array<number|string>} musicIds - track ids or slugs
   *  @param {number|null} folderId - destination folder id, or null to unfile */
  move: (musicIds, folderId) =>
    api.put('/music/move', { music_ids: musicIds, folder_id: folderId }),


  /* Spotify (free tier, Client Credentials — no Premium needed) */
  spotifyStatus: () => api.get('/spotify/status'),

  spotifySearch: (q, limit = 10) =>
    api.get('/spotify/search', { params: { q, limit } }),

  addSpotify: (spotifyTrackId, folderId = null) =>
    api.post('/spotify/add', { spotify_track_id: spotifyTrackId, folder_id: folderId }),

  /**
   * Import all tracks from a Spotify playlist URL or ID.
   * @param {string} playlistUrl - full URL, URI, or bare playlist ID
   * @param {number|null} folderId - optional destination folder
   * @param {number} maxTracks - cap (1–100, server enforces)
   * @returns {Promise<SpotifyPlaylistImportResult>}
   */
  importPlaylist: (playlistUrl, folderId = null, maxTracks = 2000) =>
    api.post('/spotify/playlist', {
      playlist_url: playlistUrl,
      folder_id: folderId,
      max_tracks: maxTracks,
    }),

  /**
   * Poll a track's analysis status until it lands in a terminal state
   * (ready / error) or the timeout expires.
   *
   * @param {number} musicId
   * @param {object} [opts]
   * @param {number} [opts.intervalMs=2000] - delay between polls
   * @param {number} [opts.timeoutMs=90000]  - give up after this long
   * @param {(s: object) => void} [opts.onUpdate] - called on every poll
   * @returns {Promise<object>} the latest /api/music/{id} payload
   */
  waitForAnalysis: async (musicId, opts = {}) => {
    const {
      intervalMs = 2000,
      timeoutMs = 90_000,
      onUpdate = null,
    } = opts;

    const deadline = Date.now() + timeoutMs;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await musicAPI.getById(musicId);
      const status = res.data?.analysis_status;
      if (onUpdate) onUpdate(res.data);

      if (status === 'ready' || status === 'error') return res.data;
      if (Date.now() > deadline) return res.data;  // give up gracefully
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  },

  /* Spotify OAuth + Web Playback SDK */
  spotifyAuth: {
    login: () => api.get('/spotify/auth/login'),
    callback: (code) => api.post('/spotify/auth/callback', { code }),
    status: () => api.get('/spotify/auth/status'),
    playerToken: () => api.get('/spotify/auth/player-token'),
    disconnect: () => api.post('/spotify/auth/disconnect'),
    playerState: () => api.get('/spotify/player'),
  },

  /* Audio stream URL builder */
  stream: {
    url: (musicId) => `${api.defaults.baseURL || '/api'}/music/${musicId}/stream`,
  },
};

/* ── Analysis ── */

export const analyzeAPI = {
  analyze: (musicId) => api.post(`/analyze/${musicId}`),

  getFeatures: (musicId) => api.get(`/analyze/features/${musicId}`),
};

/* ── Recommendations ── */

export const recommendAPI = {
  get: (musicId, limit = 10, algorithm = 3, abTest = false) =>
    api.get(`/recommend/${musicId}`, { params: { limit, algorithm, ab_test: abTest } }),

  getUserHistory: (userId) => api.get(`/recommend/user/${userId}`),

  train: (nClusters = 8) =>
    api.post('/recommend/train', null, { params: { n_clusters: nClusters } }),

  getClusters: () => api.get('/recommend/clusters'),

  trainGenre: () => api.post('/recommend/train-genre'),

  predictGenre: (musicId) => api.post(`/recommend/predict-genre/${musicId}`),

  recordEvent: (eventType, algorithm, sourceMusicId, recommendedMusicId = null) =>
    api.post('/ab/event', {
      event_type: eventType,
      algorithm,
      source_music_id: sourceMusicId,
      recommended_music_id: recommendedMusicId,
    }),

  getABStats: () => api.get('/ab/stats'),

  promote: (algorithm) =>
    api.post('/ab/promote', null, { params: { algorithm } }),

  getDefault: () => api.get('/ab/default'),
};

/* ── Folders ── */

export const folderAPI = {
  list: () => api.get('/folders'),

  create: (name) => api.post('/folders', { name }),

  delete: (id) => api.delete(`/folders/${id}`),
};

/* ── Admin ── */

export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
};

export default api;
