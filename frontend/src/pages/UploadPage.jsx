import { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  UploadSimple,
  Sparkle,
  SpotifyLogo,
  Plus,
  Spinner,
  FileAudio,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { musicAPI, folderAPI } from "../services/api";
import { useToast } from "../components/ui/toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import FolderSelect from "../components/FolderSelect";

function FileDropzone({ file, onFile, dragActive, setDragActive }) {
  const { t } = useTranslation();
  const inputRef = useState(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
        dragActive ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.wav,.flac,.ogg,audio/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <FileAudio className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">{t("upload.dropFile")}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("upload.accepted")}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={() => inputRef.current?.click()}
      >
        {t("upload.orBrowse")}
      </Button>
      {file && (
        <p className="mt-4 max-w-full truncate rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground">
          {file.name}
        </p>
      )}
    </div>
  );
}

function FileTab({ folders, onFoldersChange }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [folderId, setFolderId] = useState(null);
  const [form, setForm] = useState({ title: "", artist: "", album: "", genre: "", spotifyTrackId: "", spotifyExternalUri: "", coverUrl: "" });
  const [uploading, setUploading] = useState(false);
  const [autoTagging, setAutoTagging] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleFile = useCallback(
    (f) => {
      setFile(f);
      setForm((f0) => ({ ...f0, title: f0.title || f.name.replace(/\.[^.]+$/, "") }));
    },
    []
  );

  const autoFill = async () => {
    if (!file) return;
    setAutoTagging(true);
    try {
      const fd = new FormData();
      fd.append("filename", file.name);
      const res = await musicAPI.autoTag(fd);
      const d = res.data?.metadata || {};
      setForm((f0) => ({
        title: d.title || f0.title,
        artist: d.artist || f0.artist,
        album: d.album || f0.album,
        genre: d.genre || f0.genre,
        spotifyTrackId: d.spotify_track_id || f0.spotifyTrackId,
        spotifyExternalUri: d.external_uri || f0.spotifyExternalUri,
        coverUrl: d.cover_url || f0.coverUrl,
      }));
      toast({ title: t("upload.aiTag"), description: t("upload.autoFillRunning") });
    } catch {
      toast({ variant: "destructive", title: t("common.error") });
    } finally {
      setAutoTagging(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", form.title);
      fd.append("artist", form.artist);
      fd.append("album", form.album);
      fd.append("genre", form.genre);
      if (form.coverUrl) {
        fd.append("cover_url", form.coverUrl);
      }
      if (form.spotifyTrackId) {
        fd.append("external_id", form.spotifyTrackId);
        fd.append("external_uri", form.spotifyExternalUri || `spotify:track:${form.spotifyTrackId}`);
      }
      if (folderId != null) {
        fd.append("folder_id", String(folderId));
      }
      const res = await musicAPI.upload(fd);
      const id = res.data?.slug || res.data?.id;
      toast({ title: t("upload.uploadSuccess") });
      if (id) {
        musicAPI.waitForAnalysis(id, { onUpdate: () => {} }).catch(() => {});
      }
      navigate("/");
    } catch (err) {
      if (err.response?.status === 409) {
        toast({ variant: "destructive", title: t("upload.alreadyExists") });
      } else {
        toast({ variant: "destructive", title: t("common.error") });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <FileDropzone file={file} onFile={handleFile} dragActive={dragActive} setDragActive={setDragActive} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">{t("upload.titleField")}</Label>
          <Input id="title" value={form.title} onChange={set("title")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="artist">{t("upload.artistField")}</Label>
          <Input id="artist" value={form.artist} onChange={set("artist")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="album">{t("upload.albumField")}</Label>
          <Input id="album" value={form.album} onChange={set("album")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="genre">{t("upload.genreField")}</Label>
          <Input id="genre" value={form.genre} onChange={set("genre")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t("upload.selectFolder") || "Select folder"}</Label>
        <FolderSelect
          value={folderId}
          onChange={setFolderId}
          folders={folders}
          onFoldersChange={onFoldersChange}
        />
      </div>

      {form.spotifyTrackId && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm">
          <SpotifyLogo className="h-4 w-4 text-[#1DB954]" weight="fill" />
          <span className="text-muted-foreground">{t("upload.linkedSpotify")}</span>
          <a
            href={`https://open.spotify.com/track/${form.spotifyTrackId}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-xs underline-offset-2 hover:underline"
          >
            {t("player.openInSpotify")}
          </a>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!file || uploading} className="gap-2">
          {uploading ? <Spinner className="h-4 w-4 animate-spin" /> : <UploadSimple className="h-4 w-4" />}
          {uploading ? t("upload.uploading") : t("upload.submit")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={autoFill}
          disabled={!file || autoTagging}
          className="gap-2"
        >
          {autoTagging ? <Spinner className="h-4 w-4 animate-spin" /> : <Sparkle className="h-4 w-4" />}
          {autoTagging ? t("upload.autoFillRunning") : t("upload.autoFill")}
        </Button>
      </div>
    </form>
  );
}

function SpotifyTab({ folders, onFoldersChange }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // --- Track search state ---
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [adding, setAdding] = useState(null);
  const [folderId, setFolderId] = useState(null);

  // --- Playlist import state ---
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    musicAPI.spotifyStatus().catch(() => setConfigured(false));
  }, []);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await musicAPI.spotifySearch(query, 12);
      setResults(res.data || []);
    } catch {
      toast({ variant: "destructive", title: t("common.error") });
    } finally {
      setSearching(false);
    }
  };

  const add = async (track) => {
    setAdding(track.spotify_track_id);
    try {
      await musicAPI.addSpotify(track.spotify_track_id, folderId);
      toast({ title: t("common.add"), description: track.title });
      setResults((r) => r.filter((x) => x.spotify_track_id !== track.spotify_track_id));
    } catch (err) {
      if (err.response?.status === 409) toast({ variant: "destructive", title: t("upload.alreadyExists") });
      else toast({ variant: "destructive", title: t("common.error") });
    } finally {
      setAdding(null);
    }
  };

  const importPlaylist = async () => {
    if (!playlistUrl.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await musicAPI.importPlaylist(playlistUrl.trim(), folderId, 2000);
      const data = res.data;
      setImportResult(data);
      toast({
        title: t("upload.importSuccess", {
          added: data.added,
          duplicates: data.duplicates,
          errors: data.errors,
        }),
      });
      setPlaylistUrl("");
    } catch (err) {
      // The backend returns a descriptive `detail` on 404 (private playlist)
      // and 502 (Spotify API error). Surface it directly when available.
      const detail = err.response?.data?.detail;
      toast({
        variant: "destructive",
        title: t("upload.importError"),
        description: detail || undefined,
      });
    } finally {
      setImporting(false);
    }
  };

  const statusBadgeClass = (s) => {
    if (s === "added") return "bg-emerald-500/15 text-emerald-500";
    if (s === "duplicate") return "bg-yellow-500/15 text-yellow-600";
    return "bg-destructive/15 text-destructive";
  };

  const statusLabel = (s) => {
    if (s === "added") return t("upload.importResultAdded");
    if (s === "duplicate") return t("upload.importResultDuplicate");
    return t("upload.importResultError");
  };

  return (
    <div className="space-y-6">
      {/* ── Playlist import section ── */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium mb-1.5">{t("upload.playlistLabel")}</p>
          <div className="flex gap-2">
            <Input
              id="playlist-url"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && importPlaylist()}
              placeholder={t("upload.playlistPlaceholder")}
              disabled={importing}
            />
            <Button
              onClick={importPlaylist}
              disabled={importing || !playlistUrl.trim()}
              className="gap-2 shrink-0"
              id="import-playlist-btn"
            >
              {importing
                ? <Spinner className="h-4 w-4 animate-spin" />
                : <SpotifyLogo className="h-4 w-4" weight="fill" />}
              {importing ? t("upload.importing") : t("upload.importPlaylist")}
            </Button>
          </div>
        </div>

        {/* Import result summary */}
        {importResult && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              {importResult.playlist_image && (
                <img
                  src={importResult.playlist_image}
                  alt=""
                  className="h-12 w-12 rounded-md object-cover flex-shrink-0"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">
                  {t("upload.importResultTitle", { name: importResult.playlist_name })}
                </p>
                <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span className="text-emerald-500 font-medium">{importResult.added} {t("upload.importResultAdded")}</span>
                  <span className="text-yellow-600">{importResult.duplicates} {t("upload.importResultDuplicate")}</span>
                  {importResult.errors > 0 && (
                    <span className="text-destructive">{importResult.errors} {t("upload.importResultError")}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Per-track breakdown — scrollable if many tracks */}
            {importResult.tracks.length > 0 && (
              <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                {importResult.tracks.map((tr) => (
                  <div
                    key={tr.spotify_track_id}
                    className="flex items-center justify-between gap-2 text-xs py-1 border-b border-border/50 last:border-0"
                  >
                    <div className="min-w-0">
                      <span className="font-medium truncate block">{tr.title}</span>
                      {tr.artist && <span className="text-muted-foreground truncate block">{tr.artist}</span>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(tr.status)}`}>
                      {statusLabel(tr.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">{t("upload.searchSpotify")}</span>
        </div>
      </div>

      {/* ── Track search section ── */}
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder={t("upload.spotifyPlaceholder")}
          />
          <Button onClick={search} disabled={searching} className="gap-2 shrink-0">
            {searching ? <Spinner className="h-4 w-4 animate-spin" /> : <MagnifyingGlass className="h-4 w-4" />}
            {t("common.search")}
          </Button>
        </div>

        <div className="space-y-2">
          <Label>{t("upload.selectFolder") || "Select folder"}</Label>
          <FolderSelect
            value={folderId}
            onChange={setFolderId}
            folders={folders}
            onFoldersChange={onFoldersChange}
          />
        </div>

        {!configured && (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {t("upload.connectSpotify")}
          </div>
        )}

        {results.length === 0 && !searching && configured && (
          <p className="text-center text-sm text-muted-foreground">{t("upload.noResults")}</p>
        )}

        <div className="space-y-2">
          {results.map((track) => (
            <div
              key={track.spotify_track_id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <img
                src={track.image_url}
                alt=""
                className="h-12 w-12 rounded-md object-cover"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{track.title}</p>
                <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => add(track)}
                disabled={adding === track.spotify_track_id}
                className="gap-2"
              >
                {adding === track.spotify_track_id ? <Spinner className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t("upload.addTrack")}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UploadPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const initial = params.get("tab") === "spotify" ? "spotify" : "file";
  const [folders, setFolders] = useState([]);

  useEffect(() => {
    folderAPI.list().then((r) => setFolders(r.data || [])).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t("upload.title")}</h1>
        <Tabs defaultValue={initial} className="mt-6">
          <TabsList>
            <TabsTrigger value="file" className="gap-2">
              <UploadSimple className="h-4 w-4" />
              {t("upload.fromFile")}
            </TabsTrigger>
            <TabsTrigger value="spotify" className="gap-2">
              <SpotifyLogo className="h-4 w-4" />
              {t("upload.fromSpotify")}
            </TabsTrigger>
          </TabsList>
          <Card className="mt-4 p-6">
            <TabsContent value="file">
              <FileTab folders={folders} onFoldersChange={setFolders} />
            </TabsContent>
            <TabsContent value="spotify">
              <SpotifyTab folders={folders} onFoldersChange={setFolders} />
            </TabsContent>
          </Card>
        </Tabs>
      </motion.div>
    </div>
  );
}
