// ============================================================
// On-demand browser geolocation for the tournaments map's "distance from me".
//
// PRIVACY: location is only requested on explicit user action (never on
// mount/auto), is persisted ONLY in localStorage on this device, and is
// NEVER sent to the server — every distance calculation happens client-side.
// ============================================================

import { useCallback, useEffect, useState } from "react";

export type GeolocationStatus = "idle" | "prompting" | "granted" | "denied" | "unsupported";

export interface UserCoords {
  lat: number;
  lng: number;
  /** Human-readable label, e.g. a manually-picked city name. */
  label?: string;
}

const STORAGE_KEY = "tai_user_location";

function readStored(): UserCoords | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat === "number" && typeof parsed?.lng === "number") {
      return { lat: parsed.lat, lng: parsed.lng, label: typeof parsed.label === "string" ? parsed.label : undefined };
    }
    return null;
  } catch {
    return null;
  }
}

function writeStored(coords: UserCoords | null) {
  try {
    if (coords) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(coords));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore storage errors (private browsing, quota, etc.) */
  }
}

export function useGeolocation() {
  const [status, setStatus] = useState<GeolocationStatus>("idle");
  const [coords, setCoords] = useState<UserCoords | null>(null);

  // Restore a previously chosen location from this device only — never fetched
  // from, or sent to, the server.
  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setCoords(stored);
      setStatus("granted");
    }
  }, []);

  /** Explicit user action — prompts the browser's geolocation permission. */
  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    setStatus("prompting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next: UserCoords = { lat: position.coords.latitude, lng: position.coords.longitude, label: "My location" };
        setCoords(next);
        setStatus("granted");
        writeStored(next);
      },
      () => {
        setStatus("denied");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  /** Manual fallback — e.g. picking a city from the curated list. */
  const setManual = useCallback((next: { lat: number; lng: number }, label?: string) => {
    const value: UserCoords = { lat: next.lat, lng: next.lng, label };
    setCoords(value);
    setStatus("granted");
    writeStored(value);
  }, []);

  const clear = useCallback(() => {
    setCoords(null);
    setStatus("idle");
    writeStored(null);
  }, []);

  return { status, coords, request, setManual, clear };
}
