import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT, SUPPORTED_LOCALES } from "@/lib/i18n";

/** Small icon-button toggle between the two supported locales — the signed-out
 * landing page has no account menu to hang a fuller switcher off of, so this
 * stays a single tap rather than a dropdown. */
function LanguageToggle() {
  const { t, locale, setLocale } = useT();
  const nextLocale = SUPPORTED_LOCALES[(SUPPORTED_LOCALES.indexOf(locale) + 1) % SUPPORTED_LOCALES.length];

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setLocale(nextLocale)}
      aria-label={t("language.switchAria")}
      title={t("language.switchAria")}
      className="text-xs font-bold uppercase"
    >
      {locale}
    </Button>
  );
}

export function Navbar() {
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const { t } = useT();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border/50 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        isLanding ? "bg-background/60" : "bg-background/95"
      )}
    >
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center bg-primary">
            <span className="text-sm font-bold text-primary-foreground">T</span>
          </div>
          <span className="text-base font-bold tracking-tight text-foreground">
            {t("navbar.brand")}
          </span>
        </Link>

        {isLanding && (
          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#how-it-works" className="hover:text-foreground">{t("navbar.howItWorks")}</a>
            <a href="#pricing" className="hover:text-foreground">{t("navbar.access")}</a>
          </nav>
        )}

        <div className="flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">{t("navbar.signIn")}</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/signup">{t("navbar.getStarted")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
