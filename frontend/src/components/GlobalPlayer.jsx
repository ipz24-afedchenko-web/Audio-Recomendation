import React, { useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '../context/PlayerContext';

function formatTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function GlobalPlayer() {
  const { t } = useTranslation();
  const { currentTrack, isPlaying, progress, duration, volume, togglePlay, seek, setVolume } = usePlayer();
  const seekRef = useRef(null);

  const handleSeek = useCallback((e) => {
    const rect = seekRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(fraction);
  }, [seek]);

  const handleVolume = useCallback((e) => {
    setVolume(parseFloat(e.target.value));
  }, [setVolume]);

  if (!currentTrack) return null;

  const isSpotify = currentTrack.source === 'spotify';

  return (
    <div className="global-player">
      <div className="global-player__inner">
        {/* Play/Pause */}
        <button className="global-player__play" onClick={togglePlay} aria-label={isPlaying ? t('player.pause') : t('player.play')}>
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Track info */}
        <div className="global-player__info">
          <span className="global-player__title">{currentTrack.title || t('player.unknown')}</span>
          {currentTrack.artist && <span className="global-player__artist">{currentTrack.artist}</span>}
          <span className={`global-player__badge global-player__badge--${isSpotify ? 'spotify' : 'local'}`}>
            {isSpotify ? 'Spotify' : t('player.uploaded')}
          </span>
        </div>

        {/* Seek bar */}
        <div className="global-player__seek-wrap">
          <span className="global-player__time">{formatTime(progress * duration)}</span>
          <div className="global-player__seek" ref={seekRef} onClick={handleSeek}>
            <div className="global-player__seek-track">
              <div className="global-player__seek-fill" style={{ width: `${(progress || 0) * 100}%` }} />
            </div>
          </div>
          <span className="global-player__time">{formatTime(duration)}</span>
        </div>

        {/* Volume */}
        <div className="global-player__volume">
          <span className="global-player__volume-icon">{volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={handleVolume}
            className="global-player__volume-slider"
            aria-label={t('player.volume')}
          />
        </div>
      </div>
    </div>
  );
}
