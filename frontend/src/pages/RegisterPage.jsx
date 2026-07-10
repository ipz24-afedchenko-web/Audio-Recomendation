import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { MusicNotes } from "@phosphor-icons/react";
import { useAuth } from "../utils/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.username) return setError(t("auth.usernameRequired"));
    if (!form.email) return setError(t("auth.emailRequired"));
    if (form.password.length < 8) return setError(t("auth.passwordMin"));
    setLoading(true);
    try {
      await register(form);
      navigate("/");
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) setError(detail[0]?.msg || t("auth.registerError"));
      else if (typeof detail === "string") setError(detail);
      else setError(t("auth.registerError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <MusicNotes className="h-6 w-6" weight="fill" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">{t("auth.registerTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.registerSubtitle")}</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="username">{t("auth.username")}</Label>
            <Input id="username" value={form.username} onChange={set("username")} autoComplete="username" placeholder={t("auth.username")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" type="email" value={form.email} onChange={set("email")} autoComplete="email" placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={set("password")}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.registering") : t("auth.registerButton")}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t("auth.loginLink")}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
