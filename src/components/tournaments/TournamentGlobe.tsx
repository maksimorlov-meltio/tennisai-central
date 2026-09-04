// The season as a globe.
//
// A second view beside the flat map, not a replacement: the map is better for
// picking a tournament, and this is better for seeing the shape of a season —
// where the tennis actually is, and how far a trip really means.
//
// With three thousand events the continents draw themselves out of the pins,
// which is why there is no land texture here. Nothing is fetched; the whole
// thing is geometry.

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  GLOBE_RADIUS,
  PIN_ALTITUDE,
  hourMeridians,
  solarHourAt,
  subsolarPoint,
  sunDirection,
  toPointCloud,
} from "@/lib/geo/globe";
import type { Tournament } from "@/types";

/** Builds a line-segment geometry from a list of points, pairwise. */
function segmentsFrom(points: THREE.Vector3[]): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints(points);
}

function onSphere(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = lon * (Math.PI / 180);
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.cos(theta),
  );
}

/**
 * Parallels, and one meridian per hour of the day.
 *
 * Twenty-four meridians rather than a decorative grid: that is what makes the
 * sphere read as time zones. Real zone borders follow politics and coastlines
 * and would need a boundary dataset — these are the solar hour lines, which is
 * the honest version and the one that lines up with the daylight.
 */
function Graticule({ noonLon }: { noonLon: number }) {
  const { grid, noon } = useMemo(() => {
    const r = GLOBE_RADIUS + 0.001;
    const seg = 64;
    const gridPoints: THREE.Vector3[] = [];

    for (let lat = -60; lat <= 60; lat += 30) {
      for (let i = 0; i < seg; i++) {
        for (const t of [i, i + 1]) gridPoints.push(onSphere(lat, (t / seg) * 360, r));
      }
    }

    // Nearest hour line to the subsolar longitude, drawn brighter as "noon".
    const nearestNoon = hourMeridians().reduce((best, lon) =>
      Math.abs(lon - noonLon) < Math.abs(best - noonLon) ? lon : best,
    );

    const noonPoints: THREE.Vector3[] = [];
    for (const lon of hourMeridians()) {
      const target = lon === nearestNoon ? noonPoints : gridPoints;
      for (let i = 0; i < seg; i++) {
        for (const t of [i, i + 1]) target.push(onSphere(-90 + (t / seg) * 180, lon, r));
      }
    }

    return { grid: segmentsFrom(gridPoints), noon: segmentsFrom(noonPoints) };
  }, [noonLon]);

  return (
    <>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#3f5b6b" transparent opacity={0.3} />
      </lineSegments>
      {/* The hour line where it is currently midday. */}
      <lineSegments geometry={noon}>
        <lineBasicMaterial color="#ffd9a0" transparent opacity={0.75} />
      </lineSegments>
    </>
  );
}

function Pins({ tournaments }: { tournaments: Tournament[] }) {
  // One buffer for every pin: three thousand meshes would be three thousand
  // draw calls, and this is one.
  const positions = useMemo(
    () => toPointCloud(tournaments, GLOBE_RADIUS + PIN_ALTITUDE),
    [tournaments],
  );

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        // Was 0.018 and barely visible against the sphere at this distance.
        size={0.032}
        sizeAttenuation
        color="#ff9a5c"
        // Depth-tested against the now-opaque sphere, so only the near
        // hemisphere's pins are drawn.
        depthTest
        depthWrite
      />
    </points>
  );
}

/** The sphere, its pins, the daylight, and the idle spin. */
function Scene({
  tournaments,
  spinning,
  sun,
  noonLon,
}: {
  tournaments: Tournament[];
  spinning: boolean;
  sun: { x: number; y: number; z: number };
  noonLon: number;
}) {
  const group = useRef<THREE.Group>(null);

  // Start looking at Europe. Facing 0°,0° means opening on the empty Atlantic
  // while almost every event sits off the top-left edge — the globe looked
  // half-broken until you dragged it.
  const initialRotation = useMemo<[number, number, number]>(() => [0.35, -0.35, 0], []);

  useFrame((_, delta) => {
    if (spinning && group.current) group.current.rotation.y += delta * 0.08;
  });

  return (
    <group ref={group} rotation={initialRotation}>
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS, 48, 48]} />
        {/* Opaque on purpose. At 0.92 the pins on the far side showed through
            and the globe read as a flat scatter of dots rather than a sphere. */}
        <meshPhongMaterial color="#0f2a38" shininess={6} />
      </mesh>
      <Graticule noonLon={noonLon} />
      <Pins tournaments={tournaments} />
    </group>
  );
}

export interface TournamentGlobeProps {
  tournaments: Tournament[];
  className?: string;
}

export function TournamentGlobe({ tournaments, className }: TournamentGlobeProps) {
  // Stops while the pointer is down, so dragging to look at something does not
  // fight a globe that is turning underneath.
  const [spinning, setSpinning] = useState(true);
  const plotted = useMemo(
    () => tournaments.filter((t) => t.latitude != null && t.longitude != null),
    [tournaments],
  );

  // Daylight, recomputed every minute. The terminator moves a quarter of a
  // degree in that time — far less than the width of the line — so anything
  // more frequent is work nobody can see.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sun = useMemo(() => sunDirection(now), [now]);
  const noon = useMemo(() => subsolarPoint(now), [now]);
  const utcLabel = now.toISOString().slice(11, 16);

  return (
    <div
      className={className ?? "relative h-[60vh] min-h-[360px] w-full border border-border bg-[#071720]"}
    >
      <Canvas
        camera={{ position: [0, 0, 2.8], fov: 45 }}
        onPointerDown={() => setSpinning(false)}
        onPointerUp={() => setSpinning(true)}
        onPointerLeave={() => setSpinning(true)}
        // Respect a reduced-motion preference: the spin is decoration.
        frameloop={
          typeof window !== "undefined" &&
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
            ? "demand"
            : "always"
        }
      >
        {/* Night is dim, not black — the pins on the dark side still have to be
            findable, and a coach looking at 3am in Tokyo still wants to see it. */}
        <ambientLight intensity={0.28} />
        {/* The sun, where it actually is right now. Positioned in world space
            rather than inside the rotating group, so the terminator stays put
            while the globe turns under it — which is what the real thing does. */}
        <directionalLight position={[sun.x * 5, sun.y * 5, sun.z * 5]} intensity={1.5} />
        <Scene tournaments={plotted} spinning={spinning} sun={sun} noonLon={noon.lon} />
      </Canvas>

      <div className="pointer-events-none absolute bottom-3 left-3 space-y-1">
        <div className="rounded-md bg-background/85 px-2.5 py-1.5 text-xs text-muted-foreground">
          {plotted.length.toLocaleString()} tournament{plotted.length === 1 ? "" : "s"} plotted
          {plotted.length !== tournaments.length && (
            <> · {(tournaments.length - plotted.length).toLocaleString()} without coordinates</>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-md bg-background/85 px-2.5 py-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-[#ffd9a0]" />
          Midday on the lit meridian · {utcLabel} UTC
        </div>
      </div>
    </div>
  );
}
