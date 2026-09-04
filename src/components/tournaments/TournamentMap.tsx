// ============================================================
// Tournament map — plots the catalog's tournaments (this is our own
// tournament list, not a live feed) with an optional user-location marker,
// a "within X km" radius circle, and per-tournament Add/Hide actions.
//
// PERFORMANCE. This map holds ~3,300 tournaments and used to lock the browser.
// Three things were wrong, in descending order of cost:
//
//   1. Every plotted tournament became a marker whatever the map was showing.
//      Panning around Europe still paid for the pins in Australia, and each
//      zoom rebuilt all of them. The list is now culled to the padded viewport
//      before it is clustered — see `withinBounds` in lib/geo/cluster.
//   2. Single pins were DOM markers: a positioned <div> plus an <img> each,
//      which is the expensive way to draw a dot. They are CircleMarkers on a
//      shared canvas surface now (`preferCanvas`), so a hundred pins cost one
//      element instead of two hundred.
//   3. Every single ran `format()` and `haversineKm` on each render, for pins
//      nobody had clicked. That work happens once now, for the one tournament
//      actually selected.
//
// Clusters stay DOM markers deliberately: there are only ever a handful, and
// they carry a count label a canvas circle cannot.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  CircleMarker,
  Popup,
  Circle,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { format } from "date-fns";
import { Plus, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { haversineKm, formatDistanceKm, type LatLng } from "@/lib/geo/distance";
import { clusterForZoom, withinBounds, padBounds, type Bounds } from "@/lib/geo/cluster";
import type { Tournament } from "@/types";

// Leaflet's bundled marker images are gone with the DOM pins — the only
// remaining icons are the two divIcons below, which carry their own markup.

// Distinct marker for "where you are" — a filled dot in the accent colour so
// it reads differently from the tournament pins at a glance.
const userLocationIcon = L.divIcon({
  className: "tai-user-location-marker",
  html:
    '<span style="display:block;width:14px;height:14px;border-radius:9999px;' +
    'background-color:hsl(var(--primary));border:2px solid hsl(var(--background));' +
    'box-shadow:0 0 0 3px hsl(var(--primary) / 0.35);"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

/**
 * A numbered circle standing in for several tournaments.
 *
 * Sized by how many it holds, so density reads at a glance without counting —
 * with three thousand events the map's shape is the information.
 */
function clusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 34 : count < 100 ? 42 : 52;
  return L.divIcon({
    className: "tai-cluster-marker",
    html:
      `<span style="display:flex;align-items:center;justify-content:center;` +
      `width:${size}px;height:${size}px;border-radius:9999px;` +
      `background-color:hsl(var(--primary) / 0.85);color:hsl(var(--primary-foreground));` +
      `border:2px solid hsl(var(--background));box-shadow:0 0 0 4px hsl(var(--primary) / 0.25);` +
      `font-size:${count < 100 ? 13 : 12}px;font-weight:600;">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** How far beyond the viewport to keep pins, as a fraction of the view. */
const VIEWPORT_PAD = 0.35;

/**
 * Reports zoom AND the visible box, so the pin list can be culled to it.
 *
 * `moveend` and `zoomend` fire once per gesture, at the end — Leaflet throttles
 * for us, so there is nothing here to debounce. Listening to `move` instead
 * would rebuild every marker on each animation frame of a drag, which is the
 * mistake this component is recovering from.
 */
function ViewportWatcher({ onChange }: { onChange: (view: { zoom: number; bounds: Bounds }) => void }) {
  const read = useCallback(
    (map: L.Map) => {
      const b = map.getBounds();
      onChange({
        zoom: map.getZoom(),
        bounds: { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() },
      });
    },
    [onChange],
  );

  const map = useMapEvents({
    moveend: () => read(map),
    zoomend: () => read(map),
  });

  useEffect(() => {
    read(map);
  }, [map, read]);

  return null;
}

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

  const [view, setView] = useState<{ zoom: number; bounds: Bounds | null }>({ zoom: 3, bounds: null });

  // Cull first, then cluster. The other order would still walk every
  // tournament on the planet on every pan.
  const visible = useMemo(
    () => withinBounds(plotted, view.bounds ? padBounds(view.bounds, VIEWPORT_PAD) : null),
    [plotted, view.bounds],
  );

  const clusters = useMemo(() => clusterForZoom(visible, view.zoom), [visible, view.zoom]);
  const singles = useMemo(
    () => clusters.filter((c) => c.items.length === 1).map((c) => c.items[0]),
    [clusters],
  );

  // One popup, for whichever pin was last clicked, rather than one mounted per
  // marker. Its contents — date formatting, distance — are computed here once
  // instead of for every pin on every render.
  const [selected, setSelected] = useState<PlottableTournament | null>(null);
  const selectedDetail = useMemo(() => {
    if (!selected) return null;
    return {
      t: selected,
      dates: `${format(new Date(selected.startDate), "MMM d")} – ${format(new Date(selected.endDate), "MMM d, yyyy")}`,
      distance: userCoords
        ? haversineKm(userCoords, { lat: selected.latitude, lng: selected.longitude })
        : null,
    };
  }, [selected, userCoords]);

  // A pin panned out of view should not leave its popup floating over the sea.
  useEffect(() => {
    if (selected && !visible.some((t) => t.id === selected.id)) setSelected(null);
  }, [visible, selected]);

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
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="h-full w-full"
        scrollWheelZoom
        // Draws vector layers — every tournament pin — onto one canvas instead
        // of a DOM node each. This is what makes hundreds of pins cheap.
        preferCanvas
      >
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

        <ViewportWatcher onChange={setView} />

        {clusters.map((cluster) =>
          cluster.items.length > 1 ? (
            <Marker
              key={cluster.id}
              position={[cluster.latitude, cluster.longitude]}
              icon={clusterIcon(cluster.items.length)}
              eventHandlers={{
                // Zooming in is what a cluster is for; splitting it open in a
                // popup would just be a list with extra steps.
                click: (e) =>
                  e.target._map?.setView(
                    [cluster.latitude, cluster.longitude],
                    Math.min(view.zoom + 3, 14),
                  ),
              }}
            />
          ) : null,
        )}

        {singles.map((t) => (
          <CircleMarker
            key={t.id}
            center={[t.latitude, t.longitude]}
            // 6px core with a 2px ring — roughly the visual weight of the old
            // teardrop pin, and a large enough hit area for a finger.
            radius={6}
            pathOptions={{
              color: "hsl(var(--background))",
              weight: 2,
              fillColor: "hsl(var(--primary))",
              fillOpacity: 0.95,
            }}
            eventHandlers={{ click: () => setSelected(t) }}
          />
        ))}

        {selectedDetail && (
          <Popup
            position={[selectedDetail.t.latitude, selectedDetail.t.longitude]}
            minWidth={220}
            eventHandlers={{ remove: () => setSelected(null) }}
          >
            <div className="space-y-1.5">
              <p className="font-semibold text-foreground">{selectedDetail.t.name}</p>
              <p className="text-xs text-muted-foreground">
                {selectedDetail.t.city}, {selectedDetail.t.country}
              </p>
              <p className="text-xs text-muted-foreground">{selectedDetail.dates}</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">{selectedDetail.t.surface}</Badge>
                {selectedDetail.t.federation && (
                  <Badge variant="secondary">{selectedDetail.t.federation}</Badge>
                )}
              </div>
              {selectedDetail.distance != null && (
                <Badge variant="outline" className="border-primary/40 text-primary">
                  {formatDistanceKm(selectedDetail.distance)} away
                </Badge>
              )}
              <div className="flex gap-1.5 pt-1">
                {canAdd && (
                  <Button
                    size="sm"
                    className="h-7 flex-1 gap-1 px-2 text-xs"
                    onClick={() => onAdd(selectedDetail.t)}
                  >
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className={canAdd ? "h-7 flex-1 gap-1 px-2 text-xs text-muted-foreground" : "h-7 w-full gap-1 px-2 text-xs text-muted-foreground"}
                  onClick={() => onHide(selectedDetail.t.id)}
                >
                  <EyeOff className="h-3 w-3" /> Hide
                </Button>
              </div>
            </div>
          </Popup>
        )}
      </MapContainer>
    </div>
  );
}
