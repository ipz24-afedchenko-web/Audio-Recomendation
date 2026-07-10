import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  MusicNotes,
  Play,
  MagnifyingGlass,
  Trash,
  Waveform,
  Plus,
  Spinner,
} from "@phosphor-icons/react";
import { useAuth } from "../utils/AuthContext";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../components/ui/toast";
import { musicAPI, analyzeAPI } from "../services/api";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "../components/ui/dialog";
import StatusBadge from "../components/StatusBadge";

function TrackCard({ track, onAnalyze, onDelete, onPlay, analyzingId }) {
  const { t } = useTranslation();
  const isSpotify = track.source === "spotify" || Boolean(track.spotify_track_id || track.spotifyTrackId || track.external_id);
  const busy = analyzingId === track.id;

  return (
    <Card className="group flex flex-col overflow-hidden transition-all hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start gap-3 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <MusicNotes className="h-5 w-5" weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{track.title || "Untitled"}</p>
          <p className="truncate text-sm text-muted-foreground">{track.artist || "Unknown artist"}</p>
          {track.genre && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{track.genre}</p>
          )}
        </div>
        <StatusBadge status={track.analysis_status} />
      </div>

      <div className="mt-auto flex items-center gap-1.5 border-t border-border p-2.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label={t("common.play")}
          onClick={() => onPlay(track)}
          disabled={track.analysis_status !== "ready" && !isSpotify}
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label={t("dashboard.open")}
          asChild
        >
          <Link to={`/analyze/${track.id}`}>
            <MagnifyingGlass className="h-4 w-4" />
          </Link>
        </Button>
        {track.analysis_status !== "ready" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => onAnalyze(track)}
            disabled={busy}
          >
            {busy ? <Spinner className="h-4 w-4 animate-spin" /> : <Waveform className="h-4 w-4" />}
            {busy ? t("dashboard.analyzing") : t("dashboard.analyze")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          aria-label={t("common.delete")}
          onClick={() => onDelete(track)}
        >
          <Trash className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { playTrack } = usePlayer();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyzingId, setAnalyzingId] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError("");
    try {
      const res = await musicAPI.getUserMusic(user.id);
      setTracks(res.data || []);
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [user?.id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAnalyze = async (track) => {
    setAnalyzingId(track.id);
    try {
      await analyzeAPI.analyze(track.id);
      await musicAPI.waitForAnalysis(track.id, {
        onUpdate: (data) => {
          setTracks((prev) => prev.map((x) => (x.id === track.id ? { ...x, ...data } : x)));
        },
      });
      toast({ title: t("dashboard.statusReady"), description: track.title });
    } catch {
      toast({ variant: "destructive", title: t("common.error") });
    } finally {
      setAnalyzingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await musicAPI.delete(toDelete.id);
      setTracks((prev) => prev.filter((x) => x.id !== toDelete.id));
      toast({ title: t("common.delete"), description: toDelete.title });
    } catch {
      toast({ variant: "destructive", title: t("common.error") });
    } finally {
      setToDelete(null);
    }
  };

  const analyzed = tracks.filter((x) => x.analysis_status === "ready").length;
  const pending = tracks.filter((x) => x.analysis_status !== "ready").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("dashboard.greeting", { name: user?.username })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
        <Button onClick={() => navigate("/upload")} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("dashboard.uploadFirst")}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex gap-3">
                <Skeleton className="h-11 w-11 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="mt-4 h-8 w-full rounded-lg" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4" onClick={load}>
            {t("common.retry")}
          </Button>
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-20 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <MusicNotes className="h-7 w-7" weight="fill" />
          </span>
          <h2 className="text-lg font-semibold">{t("dashboard.emptyTitle")}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("dashboard.emptyDesc")}</p>
          <Button onClick={() => navigate("/upload")} className="mt-6 gap-2">
            <Plus className="h-4 w-4" />
            {t("dashboard.uploadFirst")}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: t("dashboard.tracksCount", { count: tracks.length }), value: tracks.length },
              { label: t("dashboard.analyzedCount", { count: analyzed }), value: analyzed },
              { label: t("dashboard.pendingCount", { count: pending }), value: pending },
            ].map((s) => (
              <Card key={s.label} className="p-4">
                <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
              </Card>
            ))}
          </div>

          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.05 } } }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {tracks.map((track) => (
              <motion.div
                key={track.id}
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <TrackCard
                  track={track}
                  analyzingId={analyzingId}
                  onAnalyze={handleAnalyze}
                  onDelete={setToDelete}
                  onPlay={playTrack}
                />
              </motion.div>
            ))}
          </motion.div>
        </>
      )}

      <Dialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.delete")}</DialogTitle>
            <DialogDescription>{t("dashboard.deleteConfirm")}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t("common.cancel")}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete}>
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
