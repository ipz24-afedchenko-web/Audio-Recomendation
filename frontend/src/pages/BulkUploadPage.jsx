import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Files,
  Sparkle,
  UploadSimple,
  Trash,
  Spinner,
  CheckCircle,
  Warning,
} from "@phosphor-icons/react";
import { musicAPI } from "../services/api";
import { useToast } from "../components/ui/toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { Badge } from "../components/ui/badge";

const STATUS = {
  pending: { variant: "muted", label: "bulk.pending", icon: null },
  processing: { variant: "warning", label: "bulk.processing", icon: Spinner },
  ready: { variant: "success", label: "bulk.ready", icon: CheckCircle },
  error: { variant: "destructive", label: "bulk.error", icon: Warning },
};

let uid = 0;

export default function BulkUploadPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const inputRef = useRef(null);

  const addFiles = useCallback((fileList) => {
    const arr = Array.from(fileList || []);
    const next = arr.map((f) => ({
      id: ++uid,
      file: f,
      title: f.name.replace(/\.[^.]+$/, ""),
      artist: "",
      album: "",
      genre: "",
      spotifyTrackId: "",
      spotifyExternalUri: "",
      coverUrl: "",
      status: "pending",
    }));
    setItems((prev) => [...prev, ...next]);
  }, []);

  const update = (id, patch) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const remove = (id) => setItems((prev) => prev.filter((x) => x.id !== id));

  const autoTagAll = async () => {
    setBusy(true);
    let ok = 0;
    let failed = 0;
    let firstErrorMsg = null;
    for (const it of items) {
      if (it.status !== "pending") continue;
      update(it.id, { status: "processing" });
      try {
        const fd = new FormData();
        fd.append("filename", it.file.name);
        const res = await musicAPI.autoTag(fd);
        const d = res.data?.metadata || {};
        update(it.id, {
          title: d.title || it.title,
          artist: d.artist || it.artist,
          album: d.album || it.album,
          genre: d.genre || it.genre,
          spotifyTrackId: d.spotify_track_id || "",
          spotifyExternalUri: d.external_uri || "",
          coverUrl: d.cover_url || "",
          status: "pending",
        });
        ok += 1;
      } catch (err) {
        failed += 1;
        // Pull the most useful message out of the backend payload.
        // FastAPI returns `detail` (string for 429/500, array for 422).
        const body = err.response?.data;
        const raw = body?.detail || body?.message || body?.error || err?.message || "Unknown error";
        const msg = typeof raw === "string" ? raw : JSON.stringify(raw);
        if (!firstErrorMsg) firstErrorMsg = msg;
        // Log the exact backend response so rate-limit (HTTP 429) / validation
        // errors are visible instead of a silent "Failed".
        console.error(
          `[autoTagAll] Failed to tag "${it.title}" (HTTP ${err.response?.status ?? "n/a"}):`,
          body ?? err
        );
        update(it.id, { status: "error", errorMsg: msg });
      }
      // Strict 1 s throttle: one request at a time with a gap between calls
      // so the backend's Gemini / MusicBrainz rate limit (HTTP 429) isn't hit.
      await new Promise((r) => setTimeout(r, 1000));
    }
    setBusy(false);
    console.info(`[autoTagAll] Done — ${ok} tagged, ${failed} failed.`);
    if (failed > 0) {
      toast({
        variant: "destructive",
        title: t("bulk.autoTagFailed", { count: failed }),
        description: firstErrorMsg || undefined,
      });
    } else {
      toast({ title: t("bulk.autoTagAll") });
    }
  };

  const uploadAll = async () => {
    if (items.length === 0) return;
    setBusy(true);
    setProgress(0);
    setDoneCount(0);
    const chunks = [];
    for (let i = 0; i < items.length; i += 3) chunks.push(items.slice(i, i + 3));

    let done = 0;
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (it) => {
          update(it.id, { status: "processing" });
          try {
            const fd = new FormData();
            fd.append("file", it.file);
            fd.append("title", it.title);
            fd.append("artist", it.artist);
            fd.append("album", it.album);
            fd.append("genre", it.genre);
            if (it.coverUrl) {
              fd.append("cover_url", it.coverUrl);
            }
            if (it.spotifyTrackId) {
              fd.append("external_id", it.spotifyTrackId);
              fd.append("external_uri", it.spotifyExternalUri || `spotify:track:${it.spotifyTrackId}`);
            }
            await musicAPI.upload(fd);
            update(it.id, { status: "ready" });
          } catch {
            update(it.id, { status: "error" });
          } finally {
            done += 1;
            setDoneCount(done);
            setProgress(Math.round((done / items.length) * 100));
          }
        })
      );
    }
    setBusy(false);
    toast({ title: t("bulk.done") });
    setTimeout(() => navigate("/"), 800);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("bulk.title")}</h1>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragActive ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <Files className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">{t("bulk.dropFiles")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
            {t("bulk.orBrowse")}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.flac,.ogg,audio/*"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {items.length > 0 && (
          <>
            <div className="my-4 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{progress}%</span>
            </div>

            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[28%]">{t("upload.titleField")}</TableHead>
                    <TableHead className="w-[22%]">{t("upload.artistField")}</TableHead>
                    <TableHead className="w-[18%]">{t("upload.albumField")}</TableHead>
                    <TableHead className="w-[14%]">{t("upload.genreField")}</TableHead>
                    <TableHead className="w-[10%]">{t("bulk.pending")}</TableHead>
                    <TableHead className="w-[8%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => {
                    const conf = STATUS[it.status] || STATUS.pending;
                    const Icon = conf.icon;
                    return (
                      <TableRow key={it.id}>
                        <TableCell>
                          <Input
                            value={it.title}
                            onChange={(e) => update(it.id, { title: e.target.value })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={it.artist}
                            onChange={(e) => update(it.id, { artist: e.target.value })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={it.album}
                            onChange={(e) => update(it.id, { album: e.target.value })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={it.genre}
                            onChange={(e) => update(it.id, { genre: e.target.value })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={conf.variant}
                            className="max-w-[180px] gap-1 truncate"
                            title={it.errorMsg || undefined}
                          >
                            {Icon && (
                              <Icon
                                className={
                                  it.status === "processing"
                                    ? "h-3 w-3 animate-spin"
                                    : "h-3 w-3"
                                }
                              />
                            )}
                            {it.status === "error" && it.errorMsg ? it.errorMsg : t(conf.label)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => remove(it.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive active:scale-95"
                            aria-label={t("bulk.remove")}
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={uploadAll} disabled={busy} className="gap-2">
                {busy ? <Spinner className="h-4 w-4 animate-spin" /> : <UploadSimple className="h-4 w-4" />}
                {busy ? t("bulk.uploading", { done: doneCount, total: items.length }) : t("bulk.uploadAll")}
              </Button>
              <Button variant="outline" onClick={autoTagAll} disabled={busy} className="gap-2">
                <Sparkle className="h-4 w-4" />
                {t("bulk.autoTagAll")}
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
