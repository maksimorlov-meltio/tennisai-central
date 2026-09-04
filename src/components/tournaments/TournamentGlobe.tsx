// The season as a globe.
//
// A second view beside the flat map, not a replacement: the map is better for
// picking a tournament, and this is better for seeing the shape of a season —
// where the tennis actually is, and how far a trip really means.
//
// With three thousand events the continents draw themselves out of the pins,
// which is why there is no land texture here. Nothing is fetched; the whole
// thing is geometry.

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLOBE_RADIUS, PIN_ALTITUDE, toPointCloud } from "@/lib/geo/globe";
import type { Tournament } from "@/types";

/** Lines of latitude and longitude, so the sphere reads as a globe. */
function Graticule() {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const r = GLOBE_RADIUS + 0.001;
    const seg = 64;

    // Parallels every 30°, meridians every 30°.
    for (let lat = -60; lat <= 60; lat += 30) {
      const phi = (90 - lat) * (Math.PI / 180);
      for (let i = 0; i < seg; i++) {
        for (const t of [i, i + 1]) {
          const theta = (t / seg) * Math.PI * 2;
          points.push(
            new THREE.Vector3(
              r * Math.sin(phi) * Math.sin(theta),
              r * Math.cos(phi),
              r * Math.sin(phi) * Math.cos(theta),
            ),
          );
        }
      }
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const theta = lon * (Math.PI / 180);
      for (let i = 0; i < seg; i++) {
        for (const t of [i, i + 1]) {
          const phi = (t / seg) * Math.PI;
          points.push(
            new THREE.Vector3(
              r * Math.sin(phi) * Math.sin(theta),
              r * Math.cos(phi),
              r * Math.sin(phi) * Math.cos(theta),
            ),
          );
        }
      }
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#3f5b6b" transparent opacity={0.35} />
    </lineSegments>
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

/** The sphere, its pins, and the idle spin. */
function Scene({ tournaments, spinning }: { tournaments: Tournament[]; spinning: boolean }) {
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
      <Graticule />
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
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 2, 4]} intensity={1.1} />
        <Scene tournaments={plotted} spinning={spinning} />
      </Canvas>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-background/85 px-2.5 py-1.5 text-xs text-muted-foreground">
        {plotted.length.toLocaleString()} tournament{plotted.length === 1 ? "" : "s"} plotted
        {plotted.length !== tournaments.length && (
          <> · {(tournaments.length - plotted.length).toLocaleString()} without coordinates</>
        )}
      </div>
    </div>
  );
}
