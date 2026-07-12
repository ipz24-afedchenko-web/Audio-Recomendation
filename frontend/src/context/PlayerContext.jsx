import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { musicAPI } from '../services/api';
import { spotifyPlayTrack, spotifyResumePlayback, spotifyPauseTrack } from '../lib/spotifyPlayer';

const PlayerContext = createContext(null);

function streamUrl(id) {
  return musicAPI.stream.url(id);
}

export function PlayerProvider({ children }) {
  const audioRef = useRef(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    if (typeof window === 'undefined') return 0.8;
    const v = window.localStorage.getItem('player-volume');
    return v !== null ? Number(v) : 0.8;
  });

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = volume;
    if (typeof window !== 'undefined') window.localStorage.setItem('player-volume', String(volume));
  }, [volume]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setProgress(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnded);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
    };
  }, []);

  const playTrack = useCallback((track) => {
    const isSpotify =
      track.source === 'spotify' ||
      Boolean(track.spotify_track_id || track.spotifyTrackId || track.external_id);
    const id = track.id ?? track.music_id;
    const next = {
      id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      genre: track.genre,
      duration: track.duration || 0,
      mode: isSpotify ? 'spotify' : 'local',
      src: isSpotify ? (track.preview_url || null) : streamUrl(id),
      spotifyUri: track.spotify_track_id || track.spotifyTrackId || track.external_id || null,
      spotifyUrl: track.spotify_url || track.external_url || null,
      previewUrl: track.preview_url || null,
      coverUrl: track.cover_url || track.image_url || null,
    };
    setCurrentTrack(next);
    setIsPlaying(true);
    if (isSpotify && next.spotifyUri) {
      spotifyPlayTrack(`spotify:track:${next.spotifyUri}`);
    }
  }, []);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!currentTrack) return;
    if (currentTrack.mode === 'spotify') {
      if (currentTrack.src && a) {
        // Preview URL path — use the audio element directly.
        if (a.paused) a.play().catch(() => {});
        else a.pause();
      } else {
        // Full-track SDK path — let the SDK state listener drive isPlaying.
        setIsPlaying((prev) => {
          if (prev) spotifyPauseTrack();
          else spotifyResumePlayback();
          return !prev;
        });
      }
      return;
    }
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, [currentTrack]);

  // Load source when track changes (local files + Spotify 30s previews)
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !currentTrack) return;
    const playable =
      currentTrack.mode === 'local' ||
      (currentTrack.mode === 'spotify' && currentTrack.src);
    if (!playable) return;
    if (a.src !== currentTrack.src) {
      a.src = currentTrack.src;
      a.load();
    }
    if (isPlaying) a.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  const setVolume = useCallback((v) => setVolumeState(Math.max(0, Math.min(1, v))), []);
  const seek = useCallback((t) => {
    const a = audioRef.current;
    if (a && (currentTrack?.mode === 'local' || currentTrack?.mode === 'spotify')) {
      a.currentTime = t;
      setProgress(t);
    }
  }, [currentTrack]);
  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) a.pause();
    setCurrentTrack(null);
    setIsPlaying(false);
    setProgress(0);
  }, []);
  const pausePreview = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
  }, []);

  const value = {
    currentTrack,
    isPlaying,
    progress,
    duration,
    volume,
    playTrack,
    togglePlay,
    setVolume,
    seek,
    stop,
    pausePreview,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" />
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
