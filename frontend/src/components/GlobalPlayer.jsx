import { useTranslation } from "react-i18next";
import {
  Play,
  Pause,
  X,
  SpotifyLogo,
  MusicNote,
  SpeakerHigh,
  SpeakerLow,
} from "@phosphor-icons/react";
import { usePlayer } from "../context/PlayerContext";
import { Slider } from "./ui/slider";
import { cn } from "../lib/utils";

function formatTime(s) {
  if (!s || Number.isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function GlobalPlayer() {
  const { t } = useTranslation();
  const { currentTrack, isPlaying, progress, duration, volume, togglePlay, setVolume, seek, stop } =
    usePlayer();

  if (!currentTrack) return null;

  const isSpotify = currentTrack.mode === "spotify";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            {isSpotify ? <SpotifyLogo className="h-5 w-5" /> : <MusicNote className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {currentTrack.title || "Unknown"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {currentTrack.artist || "Unknown"}
            </p>
          </div>
        </div>

        {isSpotify ? (
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="rounded-full bg-[#1DB954]/15 px-2 py-0.5 font-medium text-[#1DB954]">
              {t("player.spotify")}
            </span>
            {currentTrack.spotifyUrl && (
              <a
                href={currentTrack.spotifyUrl}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:underline"
              >
                Open
              </a>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-1 items-center gap-3">
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? t("common.pause") : t("common.play")}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:bg-primary/90 active:scale-95"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <span className="hidden w-10 text-right text-xs tabular-nums text-muted-foreground sm:block">
                {formatTime(progress)}
              </span>
              <Slider
                value={[duration ? (progress / duration) * 100 : 0]}
                max={100}
                step={0.5}
                onValueChange={(v) => seek((v[0] / 100) * (duration || 0))}
                className="flex-1"
                aria-label="Seek"
              />
              <span className="hidden w-10 text-xs tabular-nums text-muted-foreground sm:block">
                {formatTime(duration)}
              </span>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <SpeakerLow className="h-4 w-4 text-muted-foreground" />
              <Slider
                value={[volume * 100]}
                max={100}
                step={1}
                onValueChange={(v) => setVolume(v[0] / 100)}
                className="w-24"
                aria-label="Volume"
              />
              <SpeakerHigh className="h-4 w-4 text-muted-foreground" />
            </div>
          </>
        )}

        <button
          onClick={stop}
          aria-label="Close player"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isSpotify && currentTrack.spotifyUri && (
        <iframe
          title="Spotify player"
          src={`https://open.spotify.com/embed/track/${currentTrack.spotifyUri}`}
          width="100%"
          height="80"
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          className="border-t border-border"
          loading="lazy"
        />
      )}
    </div>
  );
}
