import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { AmbientCourt } from "@/components/motion/AmbientCourt";

// ── Content ───────────────────────────────────────────────
const capabilities = [
  { title: "One season calendar", desc: "Trainings, matches and tournament entries on a single colour-coded calendar — the same view for coach, player and parent." },
  { title: "Session Builder", desc: "Set the focus and get a structured, best-practice training session to start from — the coach adjusts, never starts from zero." },
  { title: "Kit log", desc: "Each player keeps their own list of rackets, strings and shoes — brand, model, condition and when it was bought." },
  { title: "Tournaments", desc: "Browse tournaments by surface, level and location, and keep entries on the shared calendar." },
];

const steps = [
  { n: "01", lead: "Connect the roster.", desc: "Coaches, players and parents join one workspace and connect their accounts." },
  { n: "02", lead: "Let it build.", desc: "Set the focus for a session and the builder assembles a structured plan for the coach to fine-tune." },
  { n: "03", lead: "Play the right events.", desc: "Tournament entries and training sessions sit on one shared calendar, so the season is visible to everyone at once." },
];

// Small accent square — the recurring modernist marker.
function Marker() {
  return <span aria-hidden className="mb-5 block h-2.5 w-2.5 bg-primary" />;
}

const Index = () => {
  return (
    // `isolate` keeps the -z-10 background layer inside this element's own
    // stacking context, above the page fill and below every section.
    <div className="relative isolate bg-background">
      {/* Moving background, at the louder of its two settings — on the landing
          page the atmosphere is doing a job, where inside the app it must stay
          out of the way of a coach reading a training plan. */}
      <AmbientCourt intensity="hero" />

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="border-b border-foreground/15">
        <div className="container max-w-6xl py-20 md:py-28">
          {/* Hero animates on load rather than on scroll — it is already in
              view, so waiting for an intersection would leave it blank. The
              60ms steps read as one considered movement, not four separate
              ones. */}
          <h1 className="max-w-4xl animate-rise-in text-5xl font-extrabold leading-[0.95] tracking-[-0.03em] text-foreground sm:text-6xl md:text-7xl">
            Run the season like a system.
          </h1>
          <p className="mt-8 max-w-2xl animate-rise-in text-lg leading-relaxed text-muted-foreground [animation-delay:90ms] md:text-xl">
            Tennis AI keeps the season between coach and player in one place — trainings
            scheduled, sessions planned, kit logged, tournaments chosen. Built for coaches,
            players and the parents who drive.
          </p>
          <div className="mt-10 flex animate-rise-in flex-wrap items-center gap-6 [animation-delay:180ms]">
            <Button size="lg" className="h-12 px-7 text-sm font-semibold" asChild>
              <Link to="/signup">Get Started</Link>
            </Button>
            <a
              href="#how-it-works"
              className="group inline-flex items-center gap-2 text-sm font-semibold text-foreground"
            >
              {/* Underline sweeps out from the left on hover. */}
              <span className="relative after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform after:duration-300 after:ease-editorial group-hover:after:scale-x-100 motion-reduce:after:transition-none">
                See how it works
              </span>
              <ArrowRight className="h-4 w-4 text-primary transition-transform duration-300 ease-editorial group-hover:translate-x-1 motion-reduce:transition-none" />
            </a>
          </div>
        </div>
      </section>

      {/* ── Capabilities (2×2 ruled grid) ─────────────────── */}
      <section className="border-b border-foreground/15">
        <div className="container max-w-6xl px-0">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {capabilities.map((c, i) => (
              <Reveal
                key={c.title}
                // Reading order, not grid order: each cell follows the last by
                // 80ms so the eye is led through them.
                delay={i * 80}
                className={
                  "px-6 py-12 md:px-10 md:py-16 " +
                  // hairline rules between cells only
                  (i % 2 === 0 ? "md:border-r " : "") +
                  (i < 2 ? "md:border-b " : "border-t md:border-t-0 ") +
                  "border-border"
                }
              >
                <Marker />
                <h3 className="text-2xl font-bold tracking-tight text-foreground">{c.title}</h3>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">{c.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────── */}
      <section id="how-it-works" className="border-b border-foreground/15 scroll-mt-20">
        <div className="container max-w-6xl py-20 md:py-24">
          <Reveal as="span" className="block">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">How it works</p>
          </Reveal>
          <div className="mt-10">
            {steps.map((s, i) => (
              <Reveal
                key={s.n}
                delay={i * 110}
                className="grid grid-cols-[auto_1fr] gap-6 border-t border-border py-8 md:grid-cols-[6rem_1fr] md:gap-10 md:py-10"
              >
                <span className="font-mono text-2xl font-bold text-foreground md:text-3xl">{s.n}</span>
                <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
                  <span className="font-semibold text-foreground">{s.lead}</span> {s.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Access (private trial — no invented paid tiers) ── */}
      <section id="pricing" className="border-b border-foreground/15 scroll-mt-20">
        <div className="container max-w-6xl py-20 md:py-24">
          <Reveal as="span" className="block">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Access</p>
          </Reveal>
          <Reveal delay={80} className="mt-10 max-w-2xl">
            {/* Not "invite-only" any more — signup takes no invite code, so
                claiming otherwise would be false. */}
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Currently a free early trial.</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Tennis AI is being trialled with a small group of coaches, players and parents.
              There's no paid plan yet — sign up and we'll get you connected.
            </p>
            <div className="mt-8">
              <Button size="lg" className="h-12 px-7 text-sm font-semibold" asChild>
                <Link to="/signup">Get Started</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Closing CTA ───────────────────────────────────── */}
      <section className="border-b border-foreground/15">
        <div className="container max-w-6xl py-24 md:py-28">
          <Reveal>
            <h2 className="max-w-3xl text-4xl font-extrabold leading-[0.98] tracking-[-0.03em] text-foreground md:text-6xl">
              Step on court with the season already handled.
            </h2>
          </Reveal>
          <Reveal delay={120} className="mt-10 flex flex-wrap items-center gap-6">
            <Button size="lg" className="h-12 px-7 text-sm font-semibold" asChild>
              <Link to="/signup">Get Started</Link>
            </Button>
            <Link to="/login" className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">
              Already on Tennis AI? Sign in
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="py-10">
        <div className="container max-w-6xl flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 bg-primary" />
            © {new Date().getFullYear()} Tennis AI
          </span>
          <nav className="flex items-center gap-6">
            <a href="#how-it-works" className="hover:text-foreground">How it works</a>
            <a href="#pricing" className="hover:text-foreground">Access</a>
            <Link to="/login" className="hover:text-foreground">Sign in</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
};

export default Index;
