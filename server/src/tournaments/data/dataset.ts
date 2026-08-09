// Static real-world snapshot (curated), NOT a live feed — see feed/ for the
// live-provider seam.
//
// A hand-curated slice of the 2026 professional tennis calendar spanning
// ATP / WTA / ITF / UTR and Challenger events across Europe (incl. several
// German events), the Americas and Asia. City names and coordinates are real
// public geographic facts (venue / host-city decimal-degree lat-lng). Dates are
// representative 2026 windows for each event and may differ from final official
// schedules — this is a demo/seed snapshot, not an authoritative calendar.
//
// The coordinate spread is what makes the "nearest tournaments" distance sort
// meaningful; keep every row's latitude in [-90, 90] and longitude in [-180, 180].

import type { FeedTournament } from "../feed/types";

export const TOURNAMENT_DATASET: FeedTournament[] = [
  // ── Australia / Oceania ─────────────────────────────────────────
  { name: "Australian Open", city: "Melbourne", country: "Australia", surface: "Hard", indoorOutdoor: "outdoor", federation: "ATP", category: "Grand Slam", level: "Professional", startDate: "2026-01-19T00:00:00.000Z", endDate: "2026-02-01T00:00:00.000Z", latitude: -37.8213, longitude: 144.9784 },

  // ── Europe (incl. Germany) ──────────────────────────────────────
  { name: "ABN AMRO Open", city: "Rotterdam", country: "Netherlands", surface: "Hard", indoorOutdoor: "indoor", federation: "ATP", category: "ATP 500", level: "Professional", startDate: "2026-02-09T00:00:00.000Z", endDate: "2026-02-15T00:00:00.000Z", latitude: 51.8869, longitude: 4.4890 },
  { name: "UTR Pro Tennis Tour Lisbon", city: "Lisbon", country: "Portugal", surface: "Hard", indoorOutdoor: "outdoor", federation: "UTR", category: "UTR Pro", level: "Professional", startDate: "2026-02-23T00:00:00.000Z", endDate: "2026-03-01T00:00:00.000Z", latitude: 38.7223, longitude: -9.1393 },
  { name: "ITF W35 Heraklion", city: "Heraklion", country: "Greece", surface: "Hard", indoorOutdoor: "outdoor", federation: "ITF", category: "ITF W35", level: "ITF World Tour", startDate: "2026-03-02T00:00:00.000Z", endDate: "2026-03-08T00:00:00.000Z", latitude: 35.3387, longitude: 25.1442 },
  { name: "BMW Open", city: "Munich", country: "Germany", surface: "Clay", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 500", level: "Professional", startDate: "2026-04-13T00:00:00.000Z", endDate: "2026-04-19T00:00:00.000Z", latitude: 48.1567, longitude: 11.6106 },
  { name: "Porsche Tennis Grand Prix", city: "Stuttgart", country: "Germany", surface: "Clay", indoorOutdoor: "indoor", federation: "WTA", category: "WTA 500", level: "Professional", startDate: "2026-04-18T00:00:00.000Z", endDate: "2026-04-26T00:00:00.000Z", latitude: 48.7758, longitude: 9.1829 },
  { name: "Monte-Carlo Masters", city: "Monte Carlo", country: "Monaco", surface: "Clay", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 1000", level: "Professional", startDate: "2026-04-11T00:00:00.000Z", endDate: "2026-04-19T00:00:00.000Z", latitude: 43.7602, longitude: 7.4386 },
  { name: "Mutua Madrid Open", city: "Madrid", country: "Spain", surface: "Clay", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 1000", level: "Professional", startDate: "2026-04-27T00:00:00.000Z", endDate: "2026-05-10T00:00:00.000Z", latitude: 40.4168, longitude: -3.7038 },
  { name: "Internazionali BNL d'Italia", city: "Rome", country: "Italy", surface: "Clay", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 1000", level: "Professional", startDate: "2026-05-11T00:00:00.000Z", endDate: "2026-05-18T00:00:00.000Z", latitude: 41.9281, longitude: 12.4547 },
  { name: "Neckarcup Heilbronn", city: "Heilbronn", country: "Germany", surface: "Clay", indoorOutdoor: "outdoor", federation: "ATP", category: "Challenger 100", level: "ATP Challenger Tour", startDate: "2026-05-25T00:00:00.000Z", endDate: "2026-05-31T00:00:00.000Z", latitude: 49.1427, longitude: 9.2109 },
  { name: "Roland-Garros", city: "Paris", country: "France", surface: "Clay", indoorOutdoor: "outdoor", federation: "ATP", category: "Grand Slam", level: "Professional", startDate: "2026-05-24T00:00:00.000Z", endDate: "2026-06-07T00:00:00.000Z", latitude: 48.8470, longitude: 2.2530 },
  { name: "BOSS Open", city: "Stuttgart", country: "Germany", surface: "Grass", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 250", level: "Professional", startDate: "2026-06-08T00:00:00.000Z", endDate: "2026-06-14T00:00:00.000Z", latitude: 48.7996, longitude: 9.1783 },
  { name: "Terra Wortmann Open", city: "Halle", country: "Germany", surface: "Grass", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 500", level: "Professional", startDate: "2026-06-15T00:00:00.000Z", endDate: "2026-06-21T00:00:00.000Z", latitude: 52.0570, longitude: 8.3550 },
  { name: "Wimbledon", city: "London", country: "United Kingdom", surface: "Grass", indoorOutdoor: "outdoor", federation: "ATP", category: "Grand Slam", level: "Professional", startDate: "2026-06-29T00:00:00.000Z", endDate: "2026-07-12T00:00:00.000Z", latitude: 51.4340, longitude: -0.2140 },
  { name: "Hamburg European Open", city: "Hamburg", country: "Germany", surface: "Clay", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 500", level: "Professional", startDate: "2026-07-13T00:00:00.000Z", endDate: "2026-07-19T00:00:00.000Z", latitude: 53.5836, longitude: 9.9906 },

  // ── Middle East ─────────────────────────────────────────────────
  { name: "Dubai Duty Free Tennis Championships", city: "Dubai", country: "United Arab Emirates", surface: "Hard", indoorOutdoor: "outdoor", federation: "WTA", category: "WTA 1000", level: "Professional", startDate: "2026-02-16T00:00:00.000Z", endDate: "2026-02-21T00:00:00.000Z", latitude: 25.2048, longitude: 55.2708 },

  // ── Americas ────────────────────────────────────────────────────
  { name: "BNP Paribas Open", city: "Indian Wells", country: "United States", surface: "Hard", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 1000", level: "Professional", startDate: "2026-03-09T00:00:00.000Z", endDate: "2026-03-22T00:00:00.000Z", latitude: 33.7206, longitude: -116.3053 },
  { name: "Miami Open", city: "Miami Gardens", country: "United States", surface: "Hard", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 1000", level: "Professional", startDate: "2026-03-23T00:00:00.000Z", endDate: "2026-04-05T00:00:00.000Z", latitude: 25.9580, longitude: -80.2389 },
  { name: "Mubadala Citi DC Open", city: "Washington", country: "United States", surface: "Hard", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 500", level: "Professional", startDate: "2026-07-27T00:00:00.000Z", endDate: "2026-08-02T00:00:00.000Z", latitude: 38.9540, longitude: -77.0470 },
  { name: "National Bank Open", city: "Toronto", country: "Canada", surface: "Hard", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 1000", level: "Professional", startDate: "2026-08-03T00:00:00.000Z", endDate: "2026-08-09T00:00:00.000Z", latitude: 43.6532, longitude: -79.3832 },
  { name: "Cincinnati Open", city: "Mason", country: "United States", surface: "Hard", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 1000", level: "Professional", startDate: "2026-08-10T00:00:00.000Z", endDate: "2026-08-17T00:00:00.000Z", latitude: 39.3600, longitude: -84.2700 },
  { name: "US Open", city: "New York", country: "United States", surface: "Hard", indoorOutdoor: "outdoor", federation: "USTA", category: "Grand Slam", level: "Professional", startDate: "2026-08-31T00:00:00.000Z", endDate: "2026-09-13T00:00:00.000Z", latitude: 40.7500, longitude: -73.8450 },
  { name: "Guadalajara Open", city: "Guadalajara", country: "Mexico", surface: "Hard", indoorOutdoor: "outdoor", federation: "WTA", category: "WTA 500", level: "Professional", startDate: "2026-09-14T00:00:00.000Z", endDate: "2026-09-20T00:00:00.000Z", latitude: 20.6597, longitude: -103.3496 },

  // ── Asia ────────────────────────────────────────────────────────
  { name: "Kinoshita Group Japan Open", city: "Tokyo", country: "Japan", surface: "Hard", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 500", level: "Professional", startDate: "2026-09-23T00:00:00.000Z", endDate: "2026-09-29T00:00:00.000Z", latitude: 35.6340, longitude: 139.7920 },
  { name: "China Open", city: "Beijing", country: "China", surface: "Hard", indoorOutdoor: "outdoor", federation: "WTA", category: "WTA 1000", level: "Professional", startDate: "2026-09-24T00:00:00.000Z", endDate: "2026-10-04T00:00:00.000Z", latitude: 39.9917, longitude: 116.3900 },
  { name: "Rolex Shanghai Masters", city: "Shanghai", country: "China", surface: "Hard", indoorOutdoor: "outdoor", federation: "ATP", category: "ATP 1000", level: "Professional", startDate: "2026-10-07T00:00:00.000Z", endDate: "2026-10-18T00:00:00.000Z", latitude: 31.0900, longitude: 121.2700 },
];
