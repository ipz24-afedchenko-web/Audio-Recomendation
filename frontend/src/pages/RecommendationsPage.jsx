import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkle,
  Play,
  SpotifyLogo,
  Spinner,
  Waveform,
  ArrowCounterClockwise,
  ChartBar,
  MagnifyingGlass,
  X,
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
import CoverArt from "../components/CoverArt";

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
  const location = useLocation();

  const [tracks, setTracks] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [algorithm, setAlgorithm] = useState("1");
  const [limit, setLimit] = useState(10);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [abTestEnabled, setAbTestEnabled] = useState(false);

  // Local filter over result cards
  const [recFilter, setRecFilter] = useState("");

  const [abStats, setAbStats] = useState(null);
  const [training, setTraining] = useState(false);

  const loadTracks = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await musicAPI.getUserMusic(user.id);
      const list = res.data || [];
      setTracks(list);
      // Pre-select track from navigate state (passed by AnalyzePage)
      const navId = location.state?.sourceId;
      if (navId) {
        setSourceId(String(navId));
      } else if (!sourceId && list.length) {
        setSourceId(String(list[0].id));
      }
    } catch {
      /* ignore */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
      const res = await recommendAPI.get(Number(sourceId), limit, Number(algorithm), abTestEnabled);
      const list = res.data?.recommendations || res.data || [];
      setRecs(list);
      setNoResults(list.length === 0);
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
    // recommended_music is the correct key from the API response
    const m = rec.recommended_music || rec.music || rec;
    playTrack(m);
    try {
      const actualAlgorithm = rec.algorithm || Number(algorithm);
      recommendAPI.recordEvent("click", actualAlgorithm, Number(sourceId), m.id);
    } catch {
      /* ignore */
    }
  };

  const statsRows = abStats?.rows || abStats?.stats || abStats?.algorithms || [];

  const filteredRecs = useMemo(() => {
    if (!recFilter.trim()) return recs;
    const q = recFilter.toLowerCase();
    return recs.filter((rec) => {
      const m = rec.recommended_music || rec.music || rec;
      return (
        m.title?.toLowerCase().includes(q) ||
        m.artist?.toLowerCase().includes(q) ||
        m.genre?.toLowerCase().includes(q)
      );
    });
  }, [recs, recFilter]);

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
          <div className="space-y-2 flex flex-col justify-center">
            <div className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                id="abTest"
                checked={abTestEnabled}
                onChange={(e) => setAbTestEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <Label htmlFor="abTest" className="mb-0 cursor-pointer">
                A/B Test
              </Label>
            </div>
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

      {!loading && recs.length > 0 && (
        <div className="relative mb-2 max-w-sm">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={recFilter}
            onChange={(e) => setRecFilter(e.target.value)}
            placeholder={t("recommend.filterPlaceholder") || "Filter results…"}
            className="pl-9"
          />
          {recFilter && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setRecFilter("")}
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {!loading && noResults && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-sm text-muted-foreground">
          {t("recommend.noResults")}
        </div>
      )}

      {!loading && filteredRecs.length === 0 && recs.length > 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          No recommendations match "{recFilter}"
        </div>
      )}

      {!loading && filteredRecs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRecs.map((rec, i) => {
            // The API returns `recommended_music` — fall back gracefully
            const m = rec.recommended_music || rec.music || rec;
            const sim = rec.similarity ?? rec.similarity_score ?? 0;
            const isSpotify = Boolean(
              m.source === "spotify" ||
              m.spotify_track_id ||
              m.spotifyTrackId ||
              m.external_id
            );
            // Spotify album art: read the persisted cover_url from the Music row
            const coverUrl = m.cover_url || null;
            return (
              <motion.div
                key={m.id || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
              >
                <Card className="flex h-full flex-col overflow-hidden">
                  {/* Header: cover art + meta */}
                  <div className="flex items-start gap-3 p-4">
                    <CoverArt
                      src={coverUrl}
                      className="h-11 w-11 rounded-lg"
                      fallback={<span className="text-lg">🎵</span>}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium leading-snug">
                        {m.title || t("common.unknown")}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {m.artist || "—"}
                      </p>
                      {m.genre && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {m.genre}
                        </p>
                      )}
                    </div>
                    {/* Similarity badge */}
                    <span className="shrink-0 self-start rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium tabular-nums text-primary">
                      {Math.round(sim * 100)}%
                    </span>
                  </div>

                  {/* Spotify embed preview */}
                  {isSpotify && m.external_id && (
                    <div className="px-4 pb-2">
                      <iframe
                        src={`https://open.spotify.com/embed/track/${m.external_id}?utm_source=generator&theme=0`}
                        width="100%"
                        height="80"
                        frameBorder="0"
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                        loading="lazy"
                        className="rounded-lg"
                        style={{ backgroundColor: 'transparent', colorScheme: 'normal' }}
                      />
                    </div>
                  )}

                  {/* Footer: actions */}
                  <div className="mt-auto flex items-center gap-2 border-t border-border px-4 py-2.5">
                    {isSpotify ? (
                      <span className="flex items-center gap-1.5 text-xs text-[#1DB954]">
                        <SpotifyLogo className="h-4 w-4" weight="fill" />
                        Spotify
                      </span>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto gap-2"
                      onClick={() => onPlay(rec)}
                    >
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
