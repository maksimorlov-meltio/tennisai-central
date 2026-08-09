// Draft privacy policy — placeholder content pending counsel review.
// Wired as a public route (/privacy) from App.tsx.
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-background">
      <div className="container max-w-3xl py-16 md:py-20">
        <div className="flex items-start gap-3 border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong className="font-semibold">DRAFT — not legal advice, pending counsel review.</strong>{" "}
            This page describes our current data practices in plain language. It has not been reviewed by a
            lawyer and is not a final or binding legal document.
          </p>
        </div>

        <h1 className="mt-10 text-3xl font-extrabold tracking-tight text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Draft — last updated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-bold text-foreground">Who this covers</h2>
            <p className="mt-2">
              Tennis AI is used by players, coaches, parents/observers and academy admins. Some players are
              minors; where that's the case, a parent or guardian typically holds the connected observer
              account and a coach or academy admin manages the player's profile with consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">What we collect</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Account details: name, email, role, and password (stored hashed).</li>
              <li>Profile answers you give during onboarding (playing level, goals, coaching focus, etc.).</li>
              <li>Activity data you or your coach enter: training sessions, session reviews and feedback, tournament entries, equipment, and calendar events.</li>
              <li>Finance entries you choose to log (training, travel, tournament and equipment costs).</li>
              <li>Connection data between accounts (e.g. player ↔ coach, player ↔ parent) and related notifications.</li>
              <li>Basic technical data needed to operate the app (session/auth tokens, error logs).</li>
            </ul>
            <p className="mt-2">
              We intentionally do not collect health or medical information as part of onboarding.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Why we collect it</h2>
            <p className="mt-2">
              To run the features you use directly: scheduling, the session builder, tournament tracking,
              equipment tracking, finance tracking, and connections between coaches, players and parents. We
              do not sell personal data or use it for third-party advertising.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Retention</h2>
            <p className="mt-2">
              We keep account and activity data for as long as your account is active. If you close your
              account, we plan to delete or anonymize personal data within a reasonable period, except where
              we need to retain something for a legal or security reason. Exact retention periods are still
              being finalized with counsel.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Your rights</h2>
            <p className="mt-2">
              Depending on where you live, you may have rights to access, correct, export or delete your
              personal data, and to object to or restrict certain processing. For a connected minor's data,
              a parent or guardian can exercise these rights on the player's behalf. To make a request, use
              the contact details below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">Contact</h2>
            <p className="mt-2">
              Questions about this draft or your data can be sent to the Tennis AI team at{" "}
              <a href="mailto:privacy@tennisai.example" className="text-primary hover:underline">privacy@tennisai.example</a>{" "}
              (placeholder address — to be confirmed).
            </p>
          </section>
        </div>

        <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm">
          <Link to="/" className="font-medium text-primary hover:underline">Back to home</Link>
          <Link to="/terms" className="font-medium text-primary hover:underline">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}
