import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
  Folder,
  FolderOpen,
  FolderPlus,
  CaretDown,
  CaretRight,
} from "@phosphor-icons/react";
import { useAuth } from "../utils/AuthContext";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../components/ui/toast";
import { musicAPI, folderAPI } from "../services/api";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";
import StatusBadge from "../components/StatusBadge";
import CoverArt from "../components/CoverArt";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import SelectionArea from "@viselect/vanilla";

// ── Debounce hook ─────────────────────────────────────────────────────────────
function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const trackId = (t) => t.slug || String(t.id);

function MoveMenu({ track, folders, onMove, align = "end" }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          aria-label={t("dashboard.moveToFolder") || "Move to folder"}
        >
          <Folder className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} sideOffset={6}>
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => onMove(track, null)}
        >
          <FolderOpen className="h-4 w-4" />
          {t("dashboard.uncategorized") || "Uncategorized"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {folders.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {t("dashboard.noFolders") || "No folders yet"}
          </div>
        ) : (
          folders.map((f) => (
            <DropdownMenuItem
              key={f.id}
              className="gap-2"
              onSelect={() => onMove(track, f.id)}
            >
              <Folder className="h-4 w-4" />
              {f.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── FolderDropCard (droppable target for drag-and-drop) ─────────────────────
function FolderDropCard({ folder, onOpen }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: `folder:${folder.id}` });

  return (
    <motion.button
      ref={setNodeRef}
      variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      onClick={onOpen}
      className={`group flex flex-col items-center gap-2 rounded-xl border bg-card p-5 text-center transition-all hover:border-primary/40 hover:shadow-md ${
        isOver
          ? "border-primary ring-2 ring-primary/50 scale-[1.03]"
          : "border-border"
      }`}
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
          isOver
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground group-hover:bg-primary/10 group-hover:text-primary"
        }`}
      >
        <Folder className="h-6 w-6" weight="fill" />
      </span>
      <span className="font-medium text-foreground">{folder.name}</span>
      <span className="text-xs text-muted-foreground">
        {t("dashboard.folderCardCount", { count: folder.track_count ?? 0 })}
      </span>
    </motion.button>
  );
}

// ── TrackCard ─────────────────────────────────────────────────────────────────
function TrackCard({
  track,
  onAnalyze,
  onDelete,
  onPlay,
  analyzingId,
  selected,
  folders,
  onMove,
  onContextMenu,
  index,
  onSelect,
}) {
  const { t } = useTranslation();
  const isSpotify = track.source === "spotify" || Boolean(track.spotify_track_id || track.spotifyTrackId || track.external_id);
  const busy = analyzingId === track.id;

  // Drag-and-drop: each card is a draggable. The id is the track id; the
  // DndContext onDragEnd figures out the destination folder. A DragOverlay
  // (rendered at the page level) follows the cursor — we just dim the
  // source card while it is being dragged.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(track.id),
  });

  // Interactive elements call these to stop a click from also toggling the card.
  const stop = (handler) => (e) => {
    e.stopPropagation();
    handler?.(e);
  };

  const dragStyle = {
    cursor: isDragging ? "grabbing" : "grab",
    ...(isDragging ? { opacity: 0.4 } : {}),
  };

  return (
    <Card
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-id={String(track.id)}
      onContextMenu={(e) => onContextMenu?.(track, e)}
      onClick={(e) => onSelect?.(track, index, e)}
      style={dragStyle}
      className={`group selectable-card flex flex-col overflow-hidden transition-all hover:border-primary/40 hover:shadow-md ${
        selected ? "border-primary/60 ring-1 ring-primary/30" : ""
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <CoverArt src={track.cover_url} className="h-11 w-11 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{track.title || "Untitled"}</p>
          <p className="truncate text-sm text-muted-foreground">{track.artist || "Unknown artist"}</p>
          {track.genre && (
            <p className="mt-1 truncate text-xs text-muted-foreground capitalize">{track.genre}</p>
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
          onClick={stop(() => onPlay(track))}
          onPointerDown={stop()}
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
          <Link
            to={`/analyze/${track.slug || track.id}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MagnifyingGlass className="h-4 w-4" />
          </Link>
        </Button>
        {track.analysis_status !== "ready" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={stop(() => onAnalyze(track))}
            onPointerDown={stop()}
            disabled={busy}
          >
            {busy ? <Spinner className="h-4 w-4 animate-spin" /> : <Waveform className="h-4 w-4" />}
            {busy ? t("dashboard.analyzing") : t("dashboard.analyze")}
          </Button>
        )}
        <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <MoveMenu track={track} folders={folders} onMove={onMove} />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          aria-label={t("common.delete")}
          onClick={stop(() => onDelete(track))}
          onPointerDown={stop()}
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
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyzingId, setAnalyzingId] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  // Folder navigation: null = Root view (folders + uncategorized), number = inside folder
  const [activeFolder, setActiveFolder] = useState(null);

  // Search
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, 280);

  // Batch select
  const [selected, setSelected] = useState(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

  // Create-folder dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadTracks = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError("");
    try {
      const [tr, fld] = await Promise.all([
        musicAPI.getUserMusic(user.id),
        folderAPI.list(),
      ]);
      setTracks(tr.data || []);
      setFolders(fld.data || []);
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [user?.id, t]);

  useEffect(() => { loadTracks(); }, [loadTracks]);

  // Reset selection whenever tracks change
  useEffect(() => { setSelected(new Set()); }, [tracks.length]);

  // Filtered lists
  // Root view → only uncategorized tracks; folder view → tracks in that folder
  const visibleTracks = useMemo(() => {
    let list = tracks;
    if (activeFolder != null) {
      list = list.filter((tr) => tr.folder_id === activeFolder);
    } else {
      list = list.filter((tr) => !tr.folder_id);
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (tr) =>
        tr.title?.toLowerCase().includes(q) ||
        tr.artist?.toLowerCase().includes(q) ||
        tr.album?.toLowerCase().includes(q)
    );
  }, [tracks, activeFolder, search]);

  const handleAnalyze = async (track) => {
    setAnalyzingId(track.id);
    try {
      await musicAPI.analyze(trackId(track));
      await musicAPI.waitForAnalysis(trackId(track), {
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

  const handleMove = (track, folderId) => moveTracksToFolder([track.id], folderId);

  const handleBulkMove = (folderId) => moveTracksToFolder([...selected], folderId);

  const createFolder = async (e) => {
    e?.preventDefault?.();
    const name = newFolderName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await folderAPI.create(name);
      const folder = res.data;
      setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
      setNewFolderName("");
      setCreateOpen(false);
      setActiveFolder(folder.id);
      toast({ title: t("dashboard.folderCreated") || "Folder created", description: name });
    } catch (err) {
      if (err.response?.status === 409) {
        toast({ variant: "destructive", title: t("dashboard.folderExists") || "Folder already exists" });
      } else {
        toast({ variant: "destructive", title: t("common.error") });
      }
    } finally {
      setCreating(false);
    }
  };

  const deleteFolder = async (folder) => {
    try {
      await folderAPI.delete(folder.id);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      // Tracks that were in it become uncategorized.
      setTracks((prev) => prev.map((x) => (x.folder_id === folder.id ? { ...x, folder_id: null } : x)));
      if (activeFolder === folder.id) setActiveFolder(null);
      toast({ title: t("dashboard.folderDeleted") || "Folder deleted", description: folder.name });
    } catch {
      toast({ variant: "destructive", title: t("common.error") });
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Card click handler supporting Shift+Click range selection.
  //  • plain click → toggle this track, remember it as the new anchor
  //  • Shift+click  → select every track between the last anchor and this
  //    one (inclusive) in the currently displayed list.
  const handleSelect = (track, index, e) => {
    if (e?.shiftKey && lastSelectedIndex != null) {
      const a = Math.min(lastSelectedIndex, index);
      const b = Math.max(lastSelectedIndex, index);
      const rangeIds = visibleTracks.slice(a, b + 1).map((t) => t.id);
      setSelected((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((id) => next.add(id));
        return next;
      });
      return;
    }
    toggleSelect(track.id);
    setLastSelectedIndex(index);
  };

  const toggleSelectAll = () => {
    if (selected.size === visibleTracks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleTracks.map((t) => t.id)));
    }
  };

  // Drag-and-drop: only start a drag after the pointer has moved a few px,
  // so a plain click on a card still toggles selection.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // The id of the track currently being dragged (for the DragOverlay badge).
  const [activeDragId, setActiveDragId] = useState(null);

  // Move a set of tracks into a folder, then refetch folder counts so the
  // Dashboard updates seamlessly (no hard page reload).
  const moveTracksToFolder = useCallback(
    async (ids, folderId) => {
      try {
        const idStrs = ids.map((id) => {
          const tr = tracks.find((x) => x.id === id);
          return tr ? trackId(tr) : String(id);
        });
        await musicAPI.move(idStrs, folderId);
        setTracks((prev) =>
          prev.map((x) => (ids.includes(x.id) ? { ...x, folder_id: folderId } : x))
        );
        setSelected(new Set());
        const fld = await folderAPI.list();
        setFolders(fld.data || []);
        toast({ title: t("dashboard.moved") || "Moved" });
      } catch {
        toast({ variant: "destructive", title: t("common.error") });
      }
    },
    [tracks, t, toast]
  );

  const onDragStart = (event) => {
    setActiveDragId(event.active.id);
  };

  const onDragEnd = (event) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith("folder:")) return;
    const folderId = Number(overId.slice("folder:".length));
    const activeId = active.id;
    if (selected.has(activeId)) {
      // Dragging a member of the current selection → move the whole group.
      moveTracksToFolder([...selected], folderId);
    } else {
      // Dragging a single, unselected track → select it, then move it.
      setSelected(new Set([activeId]));
      moveTracksToFolder([activeId], folderId);
    }
  };

  const onDragCancel = () => setActiveDragId(null);

  // ── Right-click context menu ────────────────────────────────────────────────
  // menu = { x, y, trackId } | null
  const [ctxMenu, setCtxMenu] = useState(null);

  const handleContextMenu = (track, e) => {
    e.preventDefault(); // block the browser's native menu
    // Right-clicking an unselected track selects just it; right-clicking an
    // already-selected track keeps the whole selection for the menu actions.
    if (!selected.has(track.id)) {
      setSelected(new Set([track.id]));
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, trackId: track.id });
  };

  // Auto-close when the user clicks / scrolls / presses Escape anywhere.
  useEffect(() => {
    if (!ctxMenu) return undefined;
    const close = () => setCtxMenu(null);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close, true); // capture: close before re-open
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  const analyzed = tracks.filter((x) => x.analysis_status === "ready").length;
  const pending = tracks.filter((x) => x.analysis_status !== "ready").length;
  const uncategorizedCount = tracks.filter((tr) => !tr.folder_id).length;
  const activeFolderObj = activeFolder != null
    ? folders.find((f) => f.id === activeFolder)
    : null;
  const folderTrackCount = activeFolderObj?.track_count ?? visibleTracks.length;

  return (
    <div className="space-y-6">
      {/* Back button (folder view only) */}
      {activeFolder != null && (
        <Button
          variant="ghost"
          className="gap-2 -ml-2"
          onClick={() => setActiveFolder(null)}
        >
          <CaretDown className="h-4 w-4 rotate-90" />
          {t("common.back")}
        </Button>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {activeFolder != null ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">{activeFolderObj?.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("dashboard.folderCardCount", { count: folderTrackCount })}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("dashboard.greeting", { name: user?.username })}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {activeFolder != null && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => deleteFolder(activeFolderObj)}
            >
              <Trash className="h-4 w-4" />
              {t("common.delete")}
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}>
            <FolderPlus className="h-4 w-4" />
            {t("dashboard.newFolder")}
          </Button>
          <Button onClick={() => navigate("/upload")} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("dashboard.uploadFirst")}
          </Button>
        </div>
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
          <Button variant="outline" className="mt-4" onClick={loadTracks}>
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
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 max-w-xl">
            {[
              { label: t("dashboard.tracksCount", { count: activeFolder != null ? folderTrackCount : tracks.length }), value: activeFolder != null ? folderTrackCount : tracks.length },
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
              {selected.size === visibleTracks.length && visibleTracks.length > 0
                ? <CheckSquare className="h-4 w-4 text-primary" weight="fill" />
                : <Square className="h-4 w-4" />}
              {t("dashboard.selectAll")}
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Folder className="h-4 w-4" />
                        {t("dashboard.moveToFolder")}
                        <CaretDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="gap-2" onSelect={() => handleBulkMove(null)}>
                        <FolderOpen className="h-4 w-4" />
                        {t("dashboard.uncategorized")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {folders.map((f) => (
                        <DropdownMenuItem key={f.id} className="gap-2" onSelect={() => handleBulkMove(f.id)}>
                          <Folder className="h-4 w-4" />
                          {f.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => setConfirmBulk(true)}
                    disabled={bulkDeleting}
                  >
                    {bulkDeleting ? <Spinner className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
                    {t("dashboard.deleteSelected")}
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

          {/* Folder cards grid (root view only) — drop targets for DnD */}
          {activeFolder == null && folders.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                {t("dashboard.all")}
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {folders.map((f) => (
                  <FolderDropCard
                    key={f.id}
                    folder={f}
                    onOpen={() => setActiveFolder(f.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Uncategorized tracks section (root view only) */}
          {activeFolder == null && uncategorizedCount > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                {t("dashboard.uncategorized")}
              </h2>
              <SelectableTrackGrid
                tracks={visibleTracks}
                analyzingId={analyzingId}
                onAnalyze={handleAnalyze}
                onDelete={setToDelete}
                onPlay={playTrack}
                selected={selected}
                onSelect={handleSelect}
                folders={folders}
                onMove={handleMove}
                onContextMenu={handleContextMenu}
              />
            </div>
          )}

          {/* Folder view track grid */}
          {activeFolder != null && visibleTracks.length > 0 && (
            <SelectableTrackGrid
              tracks={visibleTracks}
              analyzingId={analyzingId}
              onAnalyze={handleAnalyze}
              onDelete={setToDelete}
              onPlay={playTrack}
              selected={selected}
              onSelect={handleSelect}
              folders={folders}
              onMove={handleMove}
              onContextMenu={handleContextMenu}
            />
          )}

          {/* Empty states */}
          {activeFolder != null && visibleTracks.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
              <FolderOpen className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search.trim()
                  ? t("dashboard.noSearchResults", { query: search })
                  : t("dashboard.folderEmpty")}
              </p>
            </div>
          )}
          {activeFolder == null && uncategorizedCount === 0 && folders.length > 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
              <FolderOpen className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("dashboard.folderEmpty")}
              </p>
            </div>
          )}
        </>
        <DragOverlay dropAnimation={null}>
          {(() => {
            if (activeDragId == null) return null;
            const tr = tracks.find((x) => x.id === activeDragId);
            if (!tr) return null;
            const count = selected.has(activeDragId) ? selected.size : 1;
            return (
              <div className="flex items-center gap-3 rounded-xl border border-primary/60 bg-card p-3 pr-4 shadow-lg ring-1 ring-primary/30">
                <CoverArt src={tr.cover_url} className="h-11 w-11 rounded-lg" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{tr.title || "Untitled"}</p>
                  <p className="truncate text-sm text-muted-foreground">{tr.artist || "Unknown artist"}</p>
                </div>
                {count > 1 && (
                  <span className="ml-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">
                    {count}
                  </span>
                )}
              </div>
            );
          })()}
        </DragOverlay>
        </DndContext>
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
              {t("dashboard.bulkDeleteConfirm", { count: selected.size })}
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

      {/* Create folder dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.newFolder")}</DialogTitle>
            <DialogDescription>
              {t("dashboard.newFolderHint")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createFolder} className="mt-4 space-y-4">
            <Input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t("dashboard.folderNamePlaceholder")}
            />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline" type="button">{t("common.cancel")}</Button>
              </DialogClose>
              <Button type="submit" disabled={creating || !newFolderName.trim()} className="gap-2">
                {creating ? <Spinner className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
                {t("dashboard.create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Right-click context menu for track cards */}
      {ctxMenu &&
        (() => {
          const tr = tracks.find((x) => x.id === ctxMenu.trackId);
          if (!tr) return null;
          return (
            <TrackContextMenu
              x={ctxMenu.x}
              y={ctxMenu.y}
              track={tr}
              folders={folders}
              onClose={() => setCtxMenu(null)}
              onPlay={(tk) => playTrack(tk)}
              onAnalyze={(tk) => handleAnalyze(tk)}
              onRecommend={(tk) =>
                navigate(`/recommendations/${tk.slug || tk.id}`)
              }
              onMoveToFolder={(fid) => handleBulkMove(fid)}
              onNewFolder={() => setCreateOpen(true)}
              onDelete={() => setConfirmBulk(true)}
            />
          );
        })()}
    </div>
  );
}

function TrackGrid({ tracks, analyzingId, onAnalyze, onDelete, onPlay, selected, folders, onMove, onContextMenu, onSelect }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.04 } } }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {tracks.map((track, index) => (
        <motion.div
          key={track.id}
          variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <TrackCard
            track={track}
            analyzingId={analyzingId}
            onAnalyze={onAnalyze}
            onDelete={onDelete}
            onPlay={onPlay}
            selected={selected.has(track.id)}
            folders={folders}
            onMove={onMove}
            onContextMenu={onContextMenu}
            index={index}
            onSelect={onSelect}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── TrackContextMenu (right-click) ──────────────────────────────────────────
const ctxItem =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-secondary";
function TrackContextMenu({
  x,
  y,
  track,
  folders,
  onClose,
  onPlay,
  onAnalyze,
  onRecommend,
  onMoveToFolder,
  onNewFolder,
  onDelete,
}) {
  const { t } = useTranslation();
  const [subOpen, setSubOpen] = useState(false);
  const left = Math.min(x, window.innerWidth - 230);
  const top = Math.min(y, window.innerHeight - 280);

  return (
    <div className="fixed z-[100]" style={{ top, left }}>
      <div className="w-52 rounded-xl border border-border bg-card/95 p-1 text-sm shadow-xl backdrop-blur">
        <button
          className={ctxItem}
          onClick={() => { onPlay(track); onClose(); }}
        >
          <Play className="h-4 w-4" />
          {t("common.play")}
        </button>
        <button
          className={ctxItem}
          onClick={() => { onAnalyze(track); onClose(); }}
        >
          <Waveform className="h-4 w-4" />
          {t("dashboard.analyze")}
        </button>
        <button
          className={ctxItem}
          onClick={() => { onRecommend(track); onClose(); }}
        >
          <MusicNotes className="h-4 w-4" />
          {t("recommendations.title") || "Recommendations"}
        </button>

        <div className="my-1 h-px bg-border" />

        <div
          className="relative"
          onMouseEnter={() => setSubOpen(true)}
          onMouseLeave={() => setSubOpen(false)}
        >
          <button className={`${ctxItem} justify-between`}>
            <span className="flex items-center gap-2">
              <Folder className="h-4 w-4" />
              {t("dashboard.moveToFolder")}
            </span>
            <CaretRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {subOpen && (
            <div className="absolute left-full top-0 ml-1 w-44 rounded-xl border border-border bg-card/95 p-1 text-sm shadow-xl backdrop-blur">
              <button
                className={ctxItem}
                onClick={() => { onMoveToFolder(null); onClose(); }}
              >
                <FolderOpen className="h-4 w-4" />
                {t("dashboard.uncategorized")}
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  className={ctxItem}
                  onClick={() => { onMoveToFolder(f.id); onClose(); }}
                >
                  <Folder className="h-4 w-4" />
                  {f.name}
                </button>
              ))}
              <div className="my-1 h-px bg-border" />
              <button
                className={ctxItem}
                onClick={() => { onNewFolder(); onClose(); }}
              >
                <FolderPlus className="h-4 w-4" />
                {t("dashboard.newFolder")}
              </button>
            </div>
          )}
        </div>

        <div className="my-1 h-px bg-border" />

        <button
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
          onClick={() => { onDelete(); onClose(); }}
        >
          <Trash className="h-4 w-4" />
          {t("common.delete")}
        </button>
      </div>
    </div>
  );
}

// ── SelectableTrackGrid (lasso / rectangle selection) ─────────────────────────
// Uses the framework-agnostic @viselect/vanilla core (the @viselect/react
// wrapper requires React 19, but this project is on React 18). Same library,
// documented React custom-integration pattern.
function SelectableTrackGrid(props) {
  const { selected, setSelected } = props;
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const instance = new SelectionArea({
      boundaries: containerRef.current,
      selectables: [".selectable-card"],
    })
      .on("beforestart", ({ event }) => {
        // Don't start a lasso when the press begins on a track card — that
        // press belongs to the drag-and-drop gesture (handled by @dnd-kit).
        if (event?.target?.closest?.(".selectable-card")) return false;
      })
      .on("start", ({ event, selection }) => {
        // Clear the previous selection unless the user is adding (Ctrl/Cmd).
        if (!event?.ctrlKey && !event?.metaKey) {
          selection.clearSelection();
          setSelected(new Set());
        }
      })
      .on("move", ({ store: { changed: { added, removed } } }) => {
        setSelected((prev) => {
          const next = new Set(prev);
          const apply = (els, op) =>
            els.forEach((el) => {
              const id = el.getAttribute("data-id");
              if (id != null) op(next, Number(id));
            });
          apply(added, (s, id) => s.add(id));
          apply(removed, (s, id) => s.delete(id));
          return next;
        });
      });

    return () => instance.destroy();
  }, [setSelected]);

  return (
    <div ref={containerRef} className="select-area">
      <TrackGrid {...props} selected={selected} />
    </div>
  );
}
