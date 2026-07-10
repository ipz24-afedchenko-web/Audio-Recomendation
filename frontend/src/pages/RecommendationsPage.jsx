import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Sparkle,
  Play,
  SpotifyLogo,
  Spinner,
  Waveform,
  ArrowCounterClockwise,
  ChartBar,
} from "@phosphor-icons/react";
import { musicAPI, recommendAPI } from "../services/api";
import { useAuth } from "../utils/AuthContext";
import { usePlayer } from "../context/PlayerContext";
import { useToast } from "../components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Skeleton } from "../components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../components/ui/table";

const ALGOS = [
  { value: "1", label: "Cosine similarity" },
  { value: "2", label: "K-Means clusters" },
  { value: "3", label: "Random Forest" },
];

export default function RecommendationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { playTrack } = usePlayer();
  const { toast } = useToast();

  const [tracks, setTracks] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [algorithm, setAlgorithm] = useState("1");
  const [limit, setLimit] = useState(10);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noResults, setNoResults] = useState(false);

  const [abStats, setAbStats] = useState(null);
  const [training, setTraining] = useState(false);

  const loadTracks = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await musicAPI.getUserMusic(user.id);
      const list = res.data || [];
      setTracks(list);
      if (!sourceId && list.length) setSourceId(String(list[0].id));
    } catch {
      /* ignore */
    }
  }, [user?.id, sourceId]);

  const loadAb = useCallback(async () => {
    try {
      const res = await recommendAPI.getABStats();
      setAbStats(res.data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadTracks();
    loadAb();
  }, [loadTracks, loadAb]);

  const fetchRecs = async () => {
    if (!sourceId) return;
    setLoading(true);
    setNoResults(false);
    try {
      const res = await recommendAPI.get(Number(sourceId), limit, Number(algorithm), false);
      const list = res.data?.recommendations || res.data || [];
      setRecs(list);
      setNoResults(list.length === 0);
      try {
        await recommendAPI.recordEvent("impression", Number(algorithm), Number(sourceId));
      } catch {
        /* ignore */
      }
      loadAb();
    } catch {
      toast({ variant: "destructive", title: t("common.error") });
    } finally {
      setLoading(false);
    }
  };

  const train = async () => {
    setTraining(true);
    try {
      await recommendAPI.train(8);
      toast({ title: t("recommend.trained") });
      loadAb();
    } catch {
      toast({ variant: "destructive", title: t("common.error") });
    } finally {
      setTraining(false);
    }
  };

  const onPlay = (rec) => {
    const m = rec.music || rec;
    playTrack(m);
    try {
      recommendAPI.recordEvent("click", Number(algorithm), Number(sourceId), m.id);
    } catch {
      /* ignore */
    }
  };

  const statsRows = abStats?.stats || abStats?.algorithms || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("recommend.title")}</h1>
      </div>

      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label>{t("recommend.selectTrack")}</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger>
                <SelectValue placeholder={t("recommend.selectTrack")} />
              </SelectTrigger>
              <SelectContent>
                {tracks.map((tr) => (
                  <SelectItem key={tr.id} value={String(tr.id)}>
                    {tr.title} — {tr.artist}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("recommend.algorithm")}</Label>
            <Select value={algorithm} onValueChange={setAlgorithm}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALGOS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="limit">{t("recommend.limit")}</Label>
            <Input
              id="limit"
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
        </div>
        <Button onClick={fetchRecs} disabled={loading || !sourceId} className="mt-4 gap-2">
          {loading ? <Spinner className="h-4 w-4 animate-spin" /> : <Sparkle className="h-4 w-4" />}
          {t("recommend.get")}
        </Button>
      </Card>

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && noResults && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-sm text-muted-foreground">
          {t("recommend.noResults")}
        </div>
      )}

      {!loading && recs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recs.map((rec, i) => {
            const m = rec.music || rec;
            const sim = rec.similarity ?? rec.similarity_score ?? 0;
            const isSpotify = Boolean(m.spotify_track_id || m.spotifyTrackId);
            return (
              <motion.div
                key={m.id || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
              >
                <Card className="flex h-full flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.title}</p>
                      <p className="truncate text-sm text-muted-foreground">{m.artist}</p>
                      {m.genre && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">{m.genre}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium tabular-nums text-primary">
                      {Math.round(sim * 100)}%
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                    <Button variant="ghost" size="sm" className="gap-2" onClick={() => onPlay(rec)}>
                      {isSpotify ? <SpotifyLogo className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {t("common.play")}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ChartBar className="h-4 w-4" />
            {t("recommend.abTitle")}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={train} disabled={training} className="gap-2">
            {training ? <Spinner className="h-4 w-4 animate-spin" /> : <ArrowCounterClockwise className="h-4 w-4" />}
            {t("recommend.train")}
          </Button>
        </CardHeader>
        <CardContent>
          {statsRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.noData")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("recommend.algorithmCol")}</TableHead>
                  <TableHead>{t("recommend.impressions")}</TableHead>
                  <TableHead>{t("recommend.clicks")}</TableHead>
                  <TableHead>{t("recommend.plays")}</TableHead>
                  <TableHead>{t("recommend.ctr")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statsRows.map((row) => (
                  <TableRow key={row.algorithm}>
                    <TableCell className="font-medium">{row.algorithm}</TableCell>
                    <TableCell className="tabular-nums">{row.impressions ?? row.impressions_count ?? 0}</TableCell>
                    <TableCell className="tabular-nums">{row.clicks ?? 0}</TableCell>
                    <TableCell className="tabular-nums">{row.plays ?? 0}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.ctr != null ? `${Math.round(row.ctr * 100)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
