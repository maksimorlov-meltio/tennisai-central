// ============================================================
// Tournament map — plots the catalog's tournaments (this is our own
// tournament list, not a live feed) with an optional user-location marker,
// a "within X km" radius circle, and per-tournament Add/Hide actions.
// ============================================================
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { format } from "date-fns";
import { Plus, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { haversineKm, formatDistanceKm, type LatLng } from "@/lib/geo/distance";
import type { Tournament } from "@/types";

// ─── Vite serves these as hashed asset URLs; Leaflet's default marker icon
// paths are relative and break under bundlers unless re-pointed like this. ───
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Distinct marker for "where you are" — a filled dot in the accent colour so
// it reads differently from the default tournament pins at a glance.
const userLocationIcon = L.divIcon({
  className: "tai-user-location-marker",
  html:
    '<span style="display:block;width:14px;height:14px;border-radius:9999px;' +
    'background-color:hsl(var(--primary));border:2px solid hsl(var(--background));' +
    'box-shadow:0 0 0 3px hsl(var(--primary) / 0.35);"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

interface FitBoundsProps {
  points: Array<[number, number]>;
}

/** Fits the map's viewport to whatever markers are currently visible. */
function FitBounds({ points }: FitBoundsProps) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 7);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 9 });
    // `map` is stable across the component's lifetime; `points` is the only
    // real dependency and is memoized by the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  return null;
}

export interface TournamentMapProps {
  tournaments: Tournament[];
  userCoords: LatLng | null;
  radiusKm?: number | null;
  onAdd: (tournament: Tournament) => void;
  onHide: (tournamentId: string) => void;
  /** Whether the "Add to schedule" action applies to the current viewer (e.g. players only). Defaults to true. */
  canAdd?: boolean;
  className?: string;
}

type PlottableTournament = Tournament & { latitude: number; longitude: number };

function hasCoords(t: Tournament): t is PlottableTournament {
  return typeof t.latitude === "number" && typeof t.longitude === "number";
}

export function TournamentMap({ tournaments, userCoords, radiusKm, onAdd, onHide, canAdd = true, className }: TournamentMapProps) {
  const plotted = useMemo(() => tournaments.filter(hasCoords), [tournaments]);

  const boundsPoints = useMemo<Array<[number, number]>>(() => {
    const pts: Array<[number, number]> = plotted.map((t) => [t.latitude, t.longitude]);
    if (userCoords) pts.push([userCoords.lat, userCoords.lng]);
    return pts;
  }, [plotted, userCoords]);

  const initialCenter: [number, number] = userCoords
    ? [userCoords.lat, userCoords.lng]
    : plotted.length > 0
      ? [plotted[0].latitude, plotted[0].longitude]
      : [20, 0];
  const initialZoom = userCoords || plotted.length > 0 ? 5 : 2;

  return (
    <div className={className ?? "h-[60vh] min-h-[360px] w-full border border-border"}>
      <MapContainer center={initialCenter} zoom={initialZoom} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <FitBounds points={boundsPoints} />

        {userCoords && (
          <>
            <Marker position={[userCoords.lat, userCoords.lng]} icon={userLocationIcon}>
              <Popup>
                <div className="text-sm font-medium text-foreground">Your location</div>
              </Popup>
            </Marker>
            {radiusKm != null && radiusKm > 0 && (
              <Circle
                center={[userCoords.lat, userCoords.lng]}
                radius={radiusKm * 1000}
                pathOptions={{ color: "hsl(var(--primary))", fillColor: "hsl(var(--primary))", fillOpacity: 0.07, weight: 1 }}
              />
            )}
          </>
        )}

        {plotted.map((t) => {
          const distance = userCoords
            ? haversineKm(userCoords, { lat: t.latitude, lng: t.longitude })
            : null;
          return (
            <Marker key={t.id} position={[t.latitude, t.longitude]}>
              <Popup minWidth={220}>
                <div className="space-y-1.5">
                  <p className="font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.city}, {t.country}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(t.startDate), "MMM d")} – {format(new Date(t.endDate), "MMM d, yyyy")}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{t.surface}</Badge>
                    {t.federation && <Badge variant="secondary">{t.federation}</Badge>}
                  </div>
                  {distance != null && (
                    <Badge variant="outline" className="border-primary/40 text-primary">{formatDistanceKm(distance)} away</Badge>
                  )}
                  <div className="flex gap-1.5 pt-1">
                    {canAdd && (
                      <Button size="sm" className="h-7 flex-1 gap-1 px-2 text-xs" onClick={() => onAdd(t)}>
                        <Plus className="h-3 w-3" /> Add
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className={canAdd ? "h-7 flex-1 gap-1 px-2 text-xs text-muted-foreground" : "h-7 w-full gap-1 px-2 text-xs text-muted-foreground"}
                      onClick={() => onHide(t.id)}
                    >
                      <EyeOff className="h-3 w-3" /> Hide
                    </Button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
