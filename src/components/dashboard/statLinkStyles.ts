// Shared styling for a <StatCard> wrapped in a <Link>.
//
// StatCard is a plain presentational tile owned elsewhere, so the "this is
// clickable" affordance (hover shift + focus ring) lives on the wrapper. Matte
// only: a border/background shift, no glow, no brightness pop.

export const statLinkClass =
  "block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const statCardClass = "h-full transition-colors hover:border-primary/50 hover:bg-accent/30";
