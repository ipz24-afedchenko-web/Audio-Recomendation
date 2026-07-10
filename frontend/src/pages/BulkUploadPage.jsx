import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
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
      status: "pending",
    }));
    setItems((prev) => [...prev, ...next]);
  }, []);

  const update = (id, patch) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const remove = (id) => setItems((prev) => prev.filter((x) => x.id !== id));

  const autoTagAll = async () => {
    setBusy(true);
    for (const it of items) {
      if (it.status !== "pending") continue;
      update(it.id, { status: "processing" });
      try {
        const fd = new FormData();
        fd.append("file", it.file);
        const res = await musicAPI.autoTag(fd);
        const d = res.data || {};
        update(it.id, {
          title: d.title || it.title,
          artist: d.artist || it.artist,
          album: d.album || it.album,
          genre: d.genre || it.genre,
          status: "pending",
        });
      } catch {
        update(it.id, { status: "error" });
      }
    }
    setBusy(false);
    toast({ title: t("bulk.autoTagAll") });
  };

  const uploadAll = async () => {
    if (items.length === 0) return;
    setBusy(true);
    setProgress(0);
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
            await musicAPI.upload(fd);
            update(it.id, { status: "ready" });
          } catch {
            update(it.id, { status: "error" });
          } finally {
            done += 1;
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
                    <TableHead className="w-[10%]">{t("bulk.statusPending")}</TableHead>
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
                          <Badge variant={conf.variant} className="gap-1">
                            {Icon && <Icon className="h-3 w-3 animate-spin" />}
                            {t(conf.label)}
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
                {busy ? t("bulk.uploading", { done, total: items.length }) : t("bulk.uploadAll")}
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
