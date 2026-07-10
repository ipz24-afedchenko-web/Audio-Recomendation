import { useTranslation } from "react-i18next";
import { Globe } from "@phosphor-icons/react";
import i18n, { LANGUAGE_KEY } from "../i18n";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

const LANGS = [
  { code: "en", label: "English" },
  { code: "uk", label: "Українська" },
];

export default function LanguageSwitcher() {
  const { i18n: i18nInstance } = useTranslation();
  const current = i18nInstance.language || "en";

  const change = (code) => {
    i18n.changeLanguage(code);
    window.localStorage.setItem(LANGUAGE_KEY, code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Language"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
        >
          <Globe className="h-[18px] w-[18px]" />
          <span className="uppercase">{current}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => change(l.code)}
            className={current === l.code ? "text-primary" : ""}
          >
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
