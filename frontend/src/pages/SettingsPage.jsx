import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  SpotifyLogo,
  CheckCircle,
  Warning,
  Spinner,
  Link as LinkIcon,
  SignOut,
} from "@phosphor-icons/react";
import { musicAPI } from "../services/api";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

export default function SettingsPage() {
  const { t } = useTranslation();
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    musicAPI.spotifyAuth.status()
      .then((res) => setSpotifyConnected(res.data?.connected ?? false))
      .catch(() => setSpotifyConnected(false))
      .finally(() => setLoading(false));
  }, []);

  const handleConnect = async () => {
    try {
      const res = await musicAPI.spotifyAuth.login();
      const url = res.data?.url;
      if (url) window.location.href = url;
    } catch {
      // handled by global 401 interceptor
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await musicAPI.spotifyAuth.disconnect();
      setSpotifyConnected(false);
    } catch {
      // ignore
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>

        <Card className="p-6">
          <h2 className="mb-4 text-lg font-medium">{t("settings.spotifySection")}</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            {t("settings.spotifyDesc")}
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : spotifyConnected ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1DB954]/15 text-[#1DB954]">
                <CheckCircle className="h-5 w-5" weight="fill" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {t("settings.spotifyConnected")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.spotifyConnectedDesc")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="gap-2 shrink-0"
              >
                {disconnecting ? (
                  <Spinner className="h-4 w-4 animate-spin" />
                ) : (
                  <SignOut className="h-4 w-4" />
                )}
                {t("settings.disconnect")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Warning className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {t("settings.spotifyDisconnected")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.spotifyDisconnectedDesc")}
                  </p>
                </div>
              </div>
              <Button onClick={handleConnect} className="gap-2">
                <LinkIcon className="h-4 w-4" weight="bold" />
                {t("settings.connectSpotify")}
              </Button>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
