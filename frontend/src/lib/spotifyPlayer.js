import api from '../services/api';

let player = null;
let deviceId = null;
let isReady = false;
let isInitializing = false;
let stateSubscribers = [];
let errorSubscribers = [];

function loadSDK() {
  return new Promise((resolve, reject) => {
    if (window.Spotify) {
      resolve(window.Spotify);
      return;
    }
    if (window.onSpotifyWebPlaybackSDKReady) {
      const check = setInterval(() => {
        if (window.Spotify) {
          clearInterval(check);
          resolve(window.Spotify);
        }
      }, 100);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    s.onerror = () => reject(new Error('Failed to load Spotify Web Playback SDK'));
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
    document.body.appendChild(s);
  });
}

export async function initSpotifyPlayer() {
  if (player) return { deviceId, isReady };
  if (isInitializing) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (isReady || !isInitializing) {
          clearInterval(check);
          resolve({ deviceId, isReady });
        }
      }, 200);
    });
  }
  isInitializing = true;

  try {
    const Spotify = await loadSDK();

    player = new Spotify.Player({
      name: 'Resonance Player',
      getOAuthToken: async (cb) => {
        try {
          const res = await api.get('/spotify/auth/player-token');
          cb(res.data.token);
        } catch {
          cb('');
        }
      },
      volume: 0.8,
    });

    player.addListener('ready', ({ device_id }) => {
      deviceId = device_id;
      isReady = true;
      isInitializing = false;
    });

    player.addListener('not_ready', () => {
      isReady = false;
    });

    player.addListener('player_state_changed', (state) => {
      stateSubscribers.forEach((fn) => fn(state));
    });

    player.addListener('initialization_error', ({ message }) => {
      errorSubscribers.forEach((fn) => fn({ type: 'init', message }));
    });

    player.addListener('authentication_error', ({ message }) => {
      errorSubscribers.forEach((fn) => fn({ type: 'auth', message }));
    });

    player.addListener('account_error', ({ message }) => {
      errorSubscribers.forEach((fn) => fn({ type: 'account', message }));
    });

    player.addListener('playback_error', ({ message }) => {
      errorSubscribers.forEach((fn) => fn({ type: 'playback', message }));
    });

    player.connect();

    return await new Promise((resolve) => {
      const wait = setInterval(() => {
        if (isReady) {
          clearInterval(wait);
          resolve({ deviceId, isReady });
        }
      }, 200);
      setTimeout(() => {
        clearInterval(wait);
        isInitializing = false;
        resolve({ deviceId, isReady });
      }, 15000);
    });
  } catch (err) {
    isInitializing = false;
    errorSubscribers.forEach((fn) => fn({ type: 'load', message: String(err) }));
    return { deviceId: null, isReady: false, error: err };
  }
}

/** Play a Spotify track via the backend (uses stored OAuth + Spotify Connect). */
export async function spotifyPlayTrack(uri) {
  if (!uri) return;
  const { deviceId: did } = await initSpotifyPlayer();
  try {
    await api.post('/spotify/play', { uri, device_id: did || undefined });
  } catch (err) {
    const msg = err?.response?.data?.detail || err?.message || 'Spotify play failed';
    errorSubscribers.forEach((fn) => fn({ type: 'play', message: msg }));
  }
}

/** Resume playback without specifying a URI — continues from current position. */
export async function spotifyResumePlayback() {
  const { deviceId: did } = await initSpotifyPlayer();
  try {
    await api.post('/spotify/play', { device_id: did || undefined });
  } catch {
    // ignore
  }
}

/** Pause/resume via the SDK directly (instant, no backend round-trip). */
export function spotifySdkPause() {
  if (player) player.pause().catch(() => {});
}

export function spotifySdkResume() {
  if (player) player.resume().catch(() => {});
}

/** Pause playback via the backend. */
export async function spotifyPauseTrack() {
  try {
    await api.post('/spotify/pause');
  } catch {
    // ignore
  }
}

/** Seek to a position (ms) via the backend. */
export async function spotifySeek(positionMs) {
  try {
    await api.post('/spotify/seek', null, { params: { position_ms: positionMs } });
  } catch {
    // ignore
  }
}

/** Set the SDK player volume (0–1). No-op if the player isn't connected. */
export function spotifySetVolume(level) {
  if (player) {
    player.setVolume(level).catch(() => {});
  }
}

export function onSpotifyState(fn) {
  stateSubscribers.push(fn);
  return () => {
    stateSubscribers = stateSubscribers.filter((s) => s !== fn);
  };
}

export function onSpotifyError(fn) {
  errorSubscribers.push(fn);
  return () => {
    errorSubscribers = errorSubscribers.filter((s) => s !== fn);
  };
}

/** Return the raw Spotify Player instance (or null). */
export function getSpotifyPlayer() {
  return player;
}

export function getSpotifyDeviceId() {
  return deviceId;
}

export function isSpotifyReady() {
  return isReady;
}

export function disconnectSpotifyPlayer() {
  if (player) {
    player.disconnect();
    player = null;
  }
  deviceId = null;
  isReady = false;
  isInitializing = false;
  stateSubscribers = [];
  errorSubscribers = [];
}
