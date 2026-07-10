import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { SpotifyLogo, Spinner, CheckCircle, Warning } from "@phosphor-icons/react";
import { musicAPI } from "../services/api";

export default function CallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState("processing"); // processing | success | error

  useEffect(() => {
    const code = params.get("code");
    let active = true;

    if (!code) {
      setState("error");
      return;
    }

    musicAPI.spotifyAuth
      .callback(code)
      .then(() => {
        if (active) setState("success");
      })
      .catch(() => {
        if (active) setState("error");
      })
      .finally(() => {
        if (active) setTimeout(() => navigate("/"), 1200);
      });

    return () => {
      active = false;
    };
  }, [params, navigate]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm text-center"
      >
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1DB954]/15 text-[#1DB954]">
          <SpotifyLogo className="h-7 w-7" weight="fill" />
        </span>
        {state === "processing" && (
          <>
            <Spinner className="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("callback.processing")}</p>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle className="mx-auto mb-3 h-7 w-7 text-primary" />
            <p className="text-sm font-medium text-foreground">{t("callback.success")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("callback.redirecting")}</p>
          </>
        )}
        {state === "error" && (
          <>
            <Warning className="mx-auto mb-3 h-7 w-7 text-destructive" />
            <p className="text-sm font-medium text-foreground">{t("callback.error")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("callback.redirecting")}</p>
          </>
        )}
      </motion.div>
    </div>
  );
}
