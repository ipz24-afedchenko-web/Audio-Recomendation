import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Users, MusicNotes, Waveform, ChartBar, ArrowUp, Spinner, Shield } from "@phosphor-icons/react";
import { adminAPI, recommendAPI } from "../services/api";
import { useToast } from "../components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../components/ui/table";

function StatTile({ icon: Icon, label, value }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [stats, setStats] = useState(null);
  const [ab, setAb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        adminAPI.getStats().catch(() => null),
        recommendAPI.getABStats().catch(() => null),
      ]);
      setStats(s?.data || null);
      setAb(a?.data || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const promote = async () => {
    setPromoting(true);
    try {
      const res = await recommendAPI.promote("best");
      toast({ title: t("admin.promoted", { algorithm: res.data?.algorithm || "best" }) });
      load();
    } catch {
      toast({ variant: "destructive", title: t("common.error") });
    } finally {
      setPromoting(false);
    }
  };

  const rows = ab?.stats || ab?.algorithms || [];
  const best = ab?.best_algorithm || ab?.best;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">{t("admin.title")}</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile icon={Users} label={t("admin.users")} value={stats?.users ?? stats?.total_users ?? 0} />
        <StatTile icon={MusicNotes} label={t("admin.tracks")} value={stats?.tracks ?? stats?.total_tracks ?? 0} />
        <StatTile icon={Waveform} label={t("admin.analyzed")} value={stats?.analyzed ?? stats?.analyzed_tracks ?? 0} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ChartBar className="h-4 w-4" />
            {t("admin.abTitle")}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={promote} disabled={promoting} className="gap-2">
            {promoting ? <Spinner className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            {t("admin.promote")}
          </Button>
        </CardHeader>
        <CardContent>
          {best && (
            <p className="mb-4 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
              {t("admin.best", { algorithm: best })}
            </p>
          )}
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.noData")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("recommend.algorithmCol")}</TableHead>
                  <TableHead>{t("recommend.impressions")}</TableHead>
                  <TableHead>{t("recommend.ctr")}</TableHead>
                  <TableHead>{t("admin.zScore")}</TableHead>
                  <TableHead>{t("admin.pValue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.algorithm}>
                    <TableCell className="font-medium">{row.algorithm}</TableCell>
                    <TableCell className="tabular-nums">{row.impressions ?? 0}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.ctr != null ? `${Math.round(row.ctr * 100)}%` : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{row.z_score?.toFixed?.(2) ?? row.zscore?.toFixed?.(2) ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{row.p_value?.toFixed?.(3) ?? row.pvalue?.toFixed?.(3) ?? "—"}</TableCell>
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
