import { Check } from "lucide-react";
import clayImg from "@/assets/surface-clay.jpg";
import grassImg from "@/assets/surface-grass.jpg";
import hardImg from "@/assets/surface-hard.jpg";
import { SurfaceImage } from "@/components/SurfaceImage";
import { SURFACE_COLOR } from "@/lib/calendar/colors";
import type { Surface } from "@/types";
import { cn } from "@/lib/utils";

const SURFACES: { value: Surface; label: string; src?: string }[] = [
  { value: "hard", label: "Hard", src: hardImg },
  { value: "clay", label: "Clay", src: clayImg },
  { value: "grass", label: "Grass", src: grassImg },
  { value: "indoor", label: "Indoor" }, // no photo → painted-court fallback
];

/**
 * Court-type picker: selectable image tiles (with a graceful painted-court
 * fallback for surfaces without a photo). Replaces a plain surface dropdown
 * so the coach/player sees the actual court when choosing.
 */
export function SurfacePicker({
  value,
  onChange,
}: {
  value: Surface;
  onChange: (surface: Surface) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {SURFACES.map((s) => {
        const active = value === s.value;
        return (
          <button
            type="button"
            key={s.value}
            onClick={() => onChange(s.value)}
            aria-pressed={active}
            className={cn(
              "group relative overflow-hidden rounded-lg border-2 transition-all",
              active ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/40",
            )}
          >
            <div className="aspect-[4/3]">
              {s.src ? (
                <SurfaceImage src={s.src} name={s.label} color={SURFACE_COLOR[s.value]} />
              ) : (
                <SurfaceImage src="" name={s.label} color={SURFACE_COLOR[s.value]} />
              )}
            </div>
            <span
              className={cn(
                "absolute bottom-1 left-1 rounded-sm bg-background/85 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur",
                active ? "text-primary" : "text-foreground",
              )}
            >
              {s.label}
            </span>
            {active && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
