import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  MusicNotes,
  Play,
  MagnifyingGlass,
  Trash,
  Waveform,
  Plus,
  Spinner,
  CheckSquare,
  Square,
  X,
} from "@phosphor-icons/react";
import { useAuth } from "../utils/AuthContext";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../components/ui/toast";
import { musicAPI, analyzeAPI } from "../services/api";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
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
import CoverArt from "../components/CoverArt";

// ── Debounce hook ─────────────────────────────────────────────────────────────
function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ── TrackCard ─────────────────────────────────────────────────────────────────
function TrackCard({ track, onAnalyze, onDelete, onPlay, analyzingId, selected, onToggleSelect }) {
  const { t } = useTranslation();
  const isSpotify = track.source === "spotify" || Boolean(track.spotify_track_id || track.spotifyTrackId || track.external_id);
  const busy = analyzingId === track.id;

  return (
    <Card className={`group flex flex-col overflow-hidden transition-all hover:border-primary/40 hover:shadow-md ${selected ? "border-primary/60 ring-1 ring-primary/30" : ""}`}>
      <div className="flex items-start gap-3 p-4">
        {/* Checkbox */}
        <button
          className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary"
          onClick={() => onToggleSelect(track.id)}
          aria-label={selected ? "Deselect" : "Select"}
        >
          {selected ? <CheckSquare className="h-4 w-4 text-primary" weight="fill" /> : <Square className="h-4 w-4" />}
        </button>

        <CoverArt src={track.cover_url} className="h-11 w-11 rounded-lg" />
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

// ── Main Page ─────────────────────────────────────────────────────────────────
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

  // Search
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, 280);

  // Batch select
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

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

  useEffect(() => { load(); }, [load]);

  // Reset selection whenever tracks change
  useEffect(() => { setSelected(new Set()); }, [tracks.length]);

  // Filtered list
  const filtered = useMemo(() => {
    if (!search.trim()) return tracks;
    const q = search.toLowerCase();
    return tracks.filter(
      (tr) =>
        tr.title?.toLowerCase().includes(q) ||
        tr.artist?.toLowerCase().includes(q) ||
        tr.album?.toLowerCase().includes(q)
    );
  }, [tracks, search]);

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

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    setConfirmBulk(false);
    const ids = [...selected];
    try {
      const { succeeded, failed } = await musicAPI.bulkDelete(ids);
      setTracks((prev) => prev.filter((x) => !succeeded.includes(x.id)));
      setSelected(new Set());
      if (failed.length > 0) {
        toast({ variant: "destructive", title: `${failed.length} tracks failed to delete` });
      } else {
        toast({ title: `${succeeded.length} track${succeeded.length !== 1 ? "s" : ""} deleted` });
      }
    } catch {
      toast({ variant: "destructive", title: t("common.error") });
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((t) => t.id)));
    }
  };

  const analyzed = tracks.filter((x) => x.analysis_status === "ready").length;
  const pending = tracks.filter((x) => x.analysis_status !== "ready").length;

  return (
    <div className="space-y-6">
      {/* Header */}
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
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 max-w-xl">
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

          {/* Search + Batch toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchRaw}
                onChange={(e) => setSearchRaw(e.target.value)}
                placeholder={t("dashboard.searchPlaceholder") || "Search by title, artist, album…"}
                className="pl-9"
              />
              {searchRaw && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchRaw("")}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Batch controls */}
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={toggleSelectAll}
            >
              {selected.size === filtered.length && filtered.length > 0
                ? <CheckSquare className="h-4 w-4 text-primary" weight="fill" />
                : <Square className="h-4 w-4" />}
              {t("dashboard.selectAll") || "Select all"}
            </Button>

            <AnimatePresence>
              {selected.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-sm text-muted-foreground">
                    {selected.size} selected
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => setConfirmBulk(true)}
                    disabled={bulkDeleting}
                  >
                    {bulkDeleting ? <Spinner className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
                    {t("dashboard.deleteSelected") || "Delete selected"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(new Set())}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* No search results */}
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {t("dashboard.noSearchResults") || `No tracks matching "${search}"`}
              </p>
            </div>
          )}

          {/* Track grid */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.04 } } }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {filtered.map((track) => (
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
                  selected={selected.has(track.id)}
                  onToggleSelect={toggleSelect}
                />
              </motion.div>
            ))}
          </motion.div>
        </>
      )}

      {/* Single delete dialog */}
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

      {/* Bulk delete dialog */}
      <Dialog open={confirmBulk} onOpenChange={(o) => !o && setConfirmBulk(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.delete")}</DialogTitle>
            <DialogDescription>
              {t("dashboard.bulkDeleteConfirm") || `Delete ${selected.size} selected track${selected.size !== 1 ? "s" : ""}? This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t("common.cancel")}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? <Spinner className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
