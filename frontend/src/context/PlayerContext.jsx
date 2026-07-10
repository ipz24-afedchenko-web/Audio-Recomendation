import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { musicAPI } from '../services/api';

const PlayerContext = createContext(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be inside PlayerProvider');
  return ctx;
}

export function PlayerProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    try { return parseFloat(localStorage.getItem('player_volume') || '0.7'); }
    catch { return 0.7; }
  });
  const [isSpotifyReady, setIsSpotifyReady] = useState(false);
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);

  const audioRef = useRef(null);
  const spotifyPlayerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const spotifyTokenRef = useRef(null);
  const pollingRef = useRef(false);

  // Init: check Spotify connection
  useEffect(() => {
    musicAPI.spotifyAuth.status().then(r => {
      setIsSpotifyConnected(r.data.connected);
    }).catch(() => {});
  }, []);

  // Init: load Spotify Web Playback SDK if connected
  useEffect(() => {
    if (!isSpotifyConnected) return;
    if (window.Spotify) { setIsSpotifyReady(true); return; }

    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      musicAPI.spotifyAuth.playerToken().then(r => {
        spotifyTokenRef.current = r.data.token;
        const player = new window.Spotify.Player({
          name: 'Music Recommender',
          getOAuthToken: cb => {
            musicAPI.spotifyAuth.playerToken().then(r2 => {
              spotifyTokenRef.current = r2.data.token;
              cb(r2.data.token);
            }).catch(() => {});
          },
          volume: volume,
        });

        player.addListener('ready', ({ device_id }) => {
          deviceIdRef.current = device_id;
          setIsSpotifyReady(true);
        });
        player.addListener('player_state_changed', state => {
          if (!state) return;
          setDuration(state.duration / 1000);
          setProgress(state.position / state.duration);
          setIsPlaying(!state.paused);
        });

        player.connect();
        spotifyPlayerRef.current = player;
      }).catch(() => {});
    };

    return () => {
      if (spotifyPlayerRef.current) {
        spotifyPlayerRef.current.disconnect();
      }
    };
  }, [isSpotifyConnected, volume]);

  // Cleanup HTML5 audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (pollingRef.current) {
        pollingRef.current = false;
      }
    };
  }, []);

  // Play a Spotify track via the Web Playback SDK + Connect API
  const playSpotifyTrack = useCallback(async (track) => {
    if (!spotifyPlayerRef.current || !deviceIdRef.current || !spotifyTokenRef.current) return;
    const trackUri = track.external_uri || `spotify:track:${track.external_id}`;
    try {
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${spotifyTokenRef.current}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: [trackUri] }),
      });
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, []);

  // Stop previous player when currentTrack changes
  useEffect(() => {
    if (!currentTrack) return;
    if (pollingRef.current) pollingRef.current = false;

    if (currentTrack.source === 'spotify' && isSpotifyReady && deviceIdRef.current) {
      playSpotifyTrack(currentTrack);
      pollingRef.current = true;
      const poll = async () => {
        while (pollingRef.current) {
          const state = await spotifyPlayerRef.current.getCurrentState();
          if (state) {
            setProgress(state.position / state.duration);
            setDuration(state.duration / 1000);
          }
          await new Promise(r => setTimeout(r, 250));
        }
      };
      poll();
    } else if (currentTrack.source !== 'spotify') {
      const url = `/api/music/${currentTrack.id}/stream`;
      const audio = new Audio(url);
      audio.volume = volume;
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
      audio.addEventListener('timeupdate', () => {
        setProgress(audio.currentTime / audio.duration);
      });
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setProgress(0);
      });

      audio.play().then(() => setIsPlaying(true)).catch(() => {
        setIsPlaying(false);
      });
    }
  }, [currentTrack, isSpotifyReady, playSpotifyTrack]);

  const play = useCallback((track) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (spotifyPlayerRef.current && isSpotifyReady) {
      spotifyPlayerRef.current.pause().catch(() => {});
    }
    pollingRef.current = false;

    setCurrentTrack(track);
    setProgress(0);
    setDuration(0);
  }, [isSpotifyReady]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      if (spotifyPlayerRef.current && currentTrack?.source === 'spotify') {
        spotifyPlayerRef.current.pause();
      } else if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
    } else {
      if (spotifyPlayerRef.current && currentTrack?.source === 'spotify') {
        spotifyPlayerRef.current.resume();
      } else if (audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
      setIsPlaying(true);
    }
  }, [isPlaying, currentTrack]);

  const seek = useCallback((fraction) => {
    if (!currentTrack || !duration) return;
    const position = fraction * duration;
    if (spotifyPlayerRef.current && currentTrack.source === 'spotify') {
      spotifyPlayerRef.current.seek(position * 1000).catch(() => {});
    } else if (audioRef.current) {
      audioRef.current.currentTime = position;
    }
    setProgress(fraction);
  }, [currentTrack, duration]);

  const setVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    localStorage.setItem('player_volume', String(clamped));
    if (audioRef.current) audioRef.current.volume = clamped;
    if (spotifyPlayerRef.current) spotifyPlayerRef.current.setVolume(clamped).catch(() => {});
  }, []);

  const value = {
    currentTrack, isPlaying, progress, duration, volume,
    isSpotifyConnected, isSpotifyReady,
    play, togglePlay, seek, setVolume,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}
