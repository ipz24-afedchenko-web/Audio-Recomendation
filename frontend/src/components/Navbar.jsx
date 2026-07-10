import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../utils/AuthContext";
import {
  MusicNotes,
  House,
  Sparkle,
  UploadSimple,
  Files,
  Shield,
  UserCircle,
  SignOut,
  ListPlus,
} from "@phosphor-icons/react";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitcher from "./LanguageSwitcher";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";

export default function Navbar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navLinkClass = ({ isActive }) =>
    `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
    }`;

  return (
    <header
      className={`sticky top-0 z-40 h-16 w-full border-b backdrop-blur transition-colors ${
        scrolled ? "border-border bg-background/80" : "border-transparent bg-background/40"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4">
        <Link to="/" className="mr-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MusicNotes className="h-[18px] w-[18px]" weight="fill" />
          </span>
          <span className="text-base font-semibold tracking-tight">{t("common.appName")}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLink to="/" end className={navLinkClass}>
            <House className="h-4 w-4" />
            {t("nav.dashboard")}
          </NavLink>
          <NavLink to="/recommendations" className={navLinkClass}>
            <Sparkle className="h-4 w-4" />
            {t("nav.recommendations")}
          </NavLink>
          {user?.is_superuser && (
            <NavLink to="/admin" className={navLinkClass}>
              <Shield className="h-4 w-4" />
              {t("nav.admin")}
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-2">
                <UploadSimple className="h-4 w-4" />
                <span className="hidden sm:inline">{t("nav.upload")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate("/upload")}>
                <UploadSimple className="h-4 w-4" />
                {t("upload.fromFile")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/bulk-upload")}>
                <Files className="h-4 w-4" />
                {t("nav.bulkUpload")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/upload?tab=spotify")}>
                <ListPlus className="h-4 w-4" />
                {t("upload.fromSpotify")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <LanguageSwitcher />
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]">
                <UserCircle className="h-6 w-6" />
                <span className="hidden max-w-[8rem] truncate sm:inline">{user?.username}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <SignOut className="h-4 w-4" />
                {t("nav.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
