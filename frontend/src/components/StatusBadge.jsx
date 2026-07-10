import { useTranslation } from "react-i18next";
import { Clock, Spinner, CheckCircle, Warning, Circle } from "@phosphor-icons/react";
import { Badge } from "./ui/badge";

const MAP = {
  pending: { variant: "muted", icon: Circle, key: "statusPending" },
  analyzing: { variant: "warning", icon: Spinner, key: "statusAnalyzing", spin: true },
  ready: { variant: "success", icon: CheckCircle, key: "statusReady" },
  error: { variant: "destructive", icon: Warning, key: "statusError" },
};

export default function StatusBadge({ status }) {
  const { t } = useTranslation();
  const conf = MAP[status] || MAP.pending;
  const Icon = conf.icon;
  return (
    <Badge variant={conf.variant} className="capitalize">
      <Icon className={conf.spin ? "h-3 w-3 animate-spin" : "h-3 w-3"} weight="bold" />
      {t(`dashboard.${conf.key}`)}
    </Badge>
  );
}
