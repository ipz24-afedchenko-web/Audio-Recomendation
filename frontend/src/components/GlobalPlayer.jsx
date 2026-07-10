import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import {
  Play,
  Pause,
  X,
  SpotifyLogo,
  MusicNote,
  SpeakerHigh,
  SpeakerLow,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { usePlayer } from "../context/PlayerContext";
import { Slider } from "./ui/slider";
import { musicAPI } from "../services/api";
import {
  initSpotifyPlayer,
  getSpotifyPlayer,
  onSpotifyState,
  onSpotifyError,
  spotifyPlayTrack,
  spotifyResumePlayback,
  spotifyPauseTrack,
  spotifySetVolume,
  spotifySdkPause,
  spotifySdkResume,
} from "../lib/spotifyPlayer";

function formatTime(s) {
  if (!s || Number.isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function GlobalPlayer() {
  const { t } = useTranslation();
  const { currentTrack, isPlaying, progress, duration, volume, togglePlay, setVolume, seek, stop, pausePreview } =
    usePlayer();

  const [sdkPlaying, setSdkPlaying] = useState(false);
  const [sdkPosition, setSdkPosition] = useState(0);
  const [sdkDuration, setSdkDuration] = useState(0);
  const [sdkError, setSdkError] = useState(null);
  const [sdkReady, setSdkReady] = useState(false);

  // Polled position from the backend (used when SDK is unavailable).
  const [polledPosition, setPolledPosition] = useState(0);
  const [polledDuration, setPolledDuration] = useState(0);
  const [polledPlaying, setPolledPlaying] = useState(false);
  const pollRef = useRef(null);

  // Computed flags used by several effects below — must be declared before
  // any effect that references them (TDZ guard).
  const isSpotify = currentTrack?.mode === "spotify";

  // Subscribe to Web Playback SDK state + errors (real Spotify playback).
  useEffect(() => {
    const unsubState = onSpotifyState((state) => {
      if (!state) return;
      setSdkPlaying(!state.paused);
      setSdkPosition((state.position || 0) / 1000);
      setSdkDuration((state.duration || 0) / 1000);
    });
    const unsubErr = onSpotifyError((e) => {
      if (e?.type === "account") setSdkError("premium_required");
      else setSdkError(e?.message || "error");
    });
    return () => {
      unsubState();
      unsubErr();
    };
  }, []);

  // Continuous position tracking: the SDK `player_state_changed` event only
  // fires on transitions (play/pause/seek/track change), not every frame.
  // Poll `getCurrentState()` every second to keep the progress bar smooth.
  useEffect(() => {
    if (!sdkReady || !isSpotify) return;
    let cancelled = false;
    const tick = async () => {
      const p = getSpotifyPlayer();
      if (!p) return;
      try {
        const state = await p.getCurrentState();
        if (!state || cancelled) return;
        setSdkPlaying(!state.paused);
        setSdkPosition((state.position || 0) / 1000);
        setSdkDuration((state.duration || 0) / 1000);
      } catch {
        // ignore
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sdkReady, isSpotify]);

  // When a Spotify track becomes active, ensure the SDK is connected for device registration.
  const prevTrackMode = useRef(null);

  useEffect(() => {
    if (!currentTrack) {
      if (prevTrackMode.current === "spotify") {
        spotifyPauseTrack();
      }
      prevTrackMode.current = null;
      return;
    }
    prevTrackMode.current = currentTrack.mode;

    if (currentTrack.mode !== "spotify" || !currentTrack.spotifyUri) return;

    let cancelled = false;
    (async () => {
      const { isReady } = await initSpotifyPlayer();
      if (cancelled) return;
      setSdkReady(isReady);
      if (isReady) {
        setSdkError(null);
        // SDK is taking over playback — stop the preview audio to avoid
        // two streams playing simultaneously.
        pausePreview();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentTrack, pausePreview]);

  // Poll Spotify playback state from the backend every 3s (fallback when SDK is not ready).
  useEffect(() => {
    if (!currentTrack || currentTrack.mode !== "spotify") {
      setPolledPosition(0);
      setPolledDuration(0);
      setPolledPlaying(false);
      return;
    }
    if (sdkReady) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const poll = async () => {
      try {
        const res = await musicAPI.spotifyAuth.playerState();
        const { is_playing, progress_ms, duration_ms } = res.data;
        setPolledPosition((progress_ms || 0) / 1000);
        setPolledDuration((duration_ms || 0) / 1000);
        setPolledPlaying(Boolean(is_playing));
      } catch {
        // ignore polling errors
      }
    };

    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [currentTrack, sdkReady]);

  if (!currentTrack) return null;

  // Best available state: SDK > polled > audio element > static.
  const effectivePlaying = sdkReady ? sdkPlaying : (polledPlaying || isPlaying);
  const effectivePosition = sdkReady
    ? sdkPosition
    : polledPosition > 0
    ? polledPosition
    : currentTrack?.src
    ? progress
    : 0;
  const effectiveDuration = sdkReady
    ? sdkDuration
    : polledDuration > 0
    ? polledDuration
    : currentTrack?.src
    ? duration
    : currentTrack.duration || 0;

  // Show the seek slider whenever we have a playable Spotify track.
  const canSeek = isSpotify || Boolean(currentTrack?.src);

  const handleSpotifyPlayPause = () => {
    if (!currentTrack?.spotifyUri) return;
    if (effectivePlaying) {
      spotifySdkPause();
      setSdkPlaying(false);
      if (currentTrack.src) pausePreview();
    } else {
      spotifySdkResume();
      setSdkPlaying(true);
      if (currentTrack.src) togglePlay();
    }
  };

  const handleSpotifySeek = (v) => {
    const fraction = v[0] / 100;
    const posMs = fraction * (effectiveDuration * 1000);
    // Seek via the SDK directly (instant, no backend round-trip).
    const player = getSpotifyPlayer();
    if (player) player.seek(posMs).catch(() => {});
    // Sync the audio element (preview URL path) and update SDK position
    // immediately so the progress bar doesn't snap back.
    if (currentTrack?.src) {
      seek(fraction * effectiveDuration);
    }
    setSdkPosition(fraction * effectiveDuration);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 p-2 sm:p-3 md:flex-row md:items-center md:gap-4 md:px-4">
        
        {/* Mobile: Top Row (Track Info + Play + Close) / Desktop: Left Side (Track Info) */}
        <div className="flex items-center justify-between gap-2 md:w-[30%]">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              {isSpotify ? <SpotifyLogo className="h-5 w-5" /> : <MusicNote className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {currentTrack.title || "Unknown"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {currentTrack.artist || "Unknown"}
              </p>
            </div>
          </div>
          
          {/* Mobile Play & Close Controls (Hidden on md+) */}
          <div className="flex shrink-0 items-center gap-2 md:hidden">
            {isSpotify ? (
              sdkError === "not_connected" ? (
                <Link
                  to="/settings"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1DB954] text-white transition-transform hover:opacity-90 active:scale-95"
                  aria-label={t("player.connectPremium")}
                >
                  <SpotifyLogo className="h-5 w-5" weight="fill" />
                </Link>
              ) : (
                <button
                  onClick={handleSpotifyPlayPause}
                  aria-label={effectivePlaying ? t("common.pause") : t("common.play")}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:bg-primary/90 active:scale-95"
                >
                  {effectivePlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
              )
            ) : (
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? t("common.pause") : t("common.play")}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:bg-primary/90 active:scale-95"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
            )}
            <button
              onClick={stop}
              aria-label="Close player"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Center: Play Control (Desktop) & Progress Bar (Mobile & Desktop) */}
        <div className="flex flex-1 flex-col items-center justify-center gap-1 md:flex-row md:gap-4">
          {/* Desktop Play Button */}
          <div className="hidden shrink-0 md:block">
            {isSpotify ? (
              sdkError === "not_connected" ? (
                <Link
                  to="/settings"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#1DB954] text-white transition-transform hover:opacity-90 active:scale-95"
                  aria-label={t("player.connectPremium")}
                >
                  <SpotifyLogo className="h-5 w-5" weight="fill" />
                </Link>
              ) : (
                <button
                  onClick={handleSpotifyPlayPause}
                  aria-label={effectivePlaying ? t("common.pause") : t("common.play")}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:bg-primary/90 active:scale-95"
                >
                  {effectivePlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
              )
            ) : (
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? t("common.pause") : t("common.play")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:bg-primary/90 active:scale-95"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
            )}
          </div>
          
          {/* Progress Bar */}
          <div className="flex w-full items-center gap-2 px-1 md:px-0">
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {formatTime(effectivePosition)}
            </span>
            <Slider
              value={[effectiveDuration ? (effectivePosition / effectiveDuration) * 100 : 0]}
              max={100}
              step={0.5}
              onValueChange={isSpotify ? handleSpotifySeek : ((v) => seek((v[0] / 100) * (duration || 0)))}
              className="flex-1"
              aria-label="Seek"
            />
            <span className="w-10 text-xs tabular-nums text-muted-foreground">
              {formatTime(effectiveDuration)}
            </span>
          </div>
        </div>

        {/* Right Side: Extra Controls (Desktop only) */}
        <div className="hidden md:flex md:w-[30%] md:items-center md:justify-end md:gap-3">
          {isSpotify && (
            <span className="hidden shrink-0 rounded-full bg-[#1DB954]/15 px-2 py-0.5 text-xs font-medium text-[#1DB954] xl:inline">
              {t("player.spotify")}
            </span>
          )}
          
          {isSpotify && currentTrack.spotifyUri && (
            <a
              href={`https://open.spotify.com/track/${currentTrack.spotifyUri}`}
              target="_blank"
              rel="noreferrer"
              className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline lg:inline-flex"
            >
              <ArrowSquareOut className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{t("player.openInSpotify")}</span>
            </a>
          )}
          
          {/* Volume Control */}
          <div className="flex shrink-0 items-center gap-2">
            <SpeakerLow className="h-4 w-4 text-muted-foreground" />
            <Slider
              value={[volume * 100]}
              max={100}
              step={1}
              onValueChange={(v) => {
                const vol = v[0] / 100;
                setVolume(vol);
                if (isSpotify) spotifySetVolume(vol);
              }}
              className="w-20 lg:w-24"
              aria-label="Volume"
            />
            <SpeakerHigh className="h-4 w-4 text-muted-foreground" />
          </div>
          
          {/* Desktop Close Button */}
          <button
            onClick={stop}
            aria-label="Close player"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
