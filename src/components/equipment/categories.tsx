// ============================================================
// Equipment categories, their condition ladders and the badge styling —
// shared by the player's own Equipment page and the coach's read-only
// PlayerEquipmentDrawer, so both describe a racket's state the same way.
// ============================================================
import type { ReactNode } from "react";
import { CircleDot, Zap, Footprints, Circle, Grip } from "lucide-react";
import type { EquipmentCategory } from "@/types";

// ─── Category config ───

export const CATEGORY_CONFIG: Record<EquipmentCategory, {
  label: string; plural: string; icon: ReactNode;
  conditions: { value: string; label: string; level: "excellent" | "good" | "fair" | "poor" }[];
}> = {
  racket: {
    label: "Racket", plural: "Rackets",
    icon: <CircleDot className="h-4 w-4" />,
    conditions: [
      { value: "New", label: "New — Fresh out of wrapper", level: "excellent" },
      { value: "Excellent", label: "Excellent — Minimal wear, no paint chips", level: "excellent" },
      { value: "Good", label: "Good — Minor cosmetic wear, plays great", level: "good" },
      { value: "Fair", label: "Fair — Visible wear, hairline cracks possible", level: "fair" },
      { value: "Poor", label: "Poor — Cracked frame, dead feel", level: "poor" },
    ],
  },
  string: {
    label: "Strings", plural: "Strings",
    icon: <Zap className="h-4 w-4" />,
    conditions: [
      { value: "Fresh", label: "Fresh — Just strung, full tension", level: "excellent" },
      { value: "Good", label: "Good — Holding tension well", level: "good" },
      { value: "Losing Tension", label: "Losing Tension — Noticeable drop", level: "fair" },
      { value: "Fraying", label: "Fraying — Visible notching, near breaking", level: "poor" },
      { value: "Broken", label: "Broken — Needs immediate restring", level: "poor" },
    ],
  },
  shoes: {
    label: "Shoes", plural: "Shoes",
    icon: <Footprints className="h-4 w-4" />,
    conditions: [
      { value: "New", label: "New — Unworn", level: "excellent" },
      { value: "Good", label: "Good — Solid tread, comfortable", level: "good" },
      { value: "Worn Tread", label: "Worn Tread — Reduced grip on court", level: "fair" },
      { value: "Worn Out", label: "Worn Out — No tread left, sole separation", level: "poor" },
    ],
  },
  balls: {
    label: "Balls", plural: "Balls",
    icon: <Circle className="h-4 w-4" />,
    conditions: [
      { value: "New", label: "New — Pressurized, full bounce", level: "excellent" },
      { value: "Practice", label: "Practice — Slightly used, still good bounce", level: "good" },
      { value: "Flat", label: "Flat — Low bounce, training only", level: "fair" },
      { value: "Dead", label: "Dead — No bounce, replace immediately", level: "poor" },
    ],
  },
  accessories: {
    label: "Accessories", plural: "Accessories",
    icon: <Grip className="h-4 w-4" />,
    conditions: [
      { value: "New", label: "New", level: "excellent" },
      { value: "Good", label: "Good — Functional", level: "good" },
      { value: "Worn", label: "Worn — Needs replacing soon", level: "fair" },
      { value: "Replace", label: "Replace — Past useful life", level: "poor" },
    ],
  },
};

export const CATEGORY_ORDER: EquipmentCategory[] = ["racket", "string", "shoes", "balls", "accessories"];

// ─── Condition badge colors ───

export const CONDITION_STYLES: Record<string, string> = {
  excellent: "bg-muted text-foreground dark:text-foreground border-border",
  good: "bg-muted text-foreground dark:text-foreground border-border",
  fair: "bg-primary/10 text-primary dark:text-primary border-primary/25",
  poor: "bg-primary/10 text-primary dark:text-primary border-primary/25",
};

export function getConditionLevel(category: EquipmentCategory, condition?: string): string {
  if (!condition) return "good";
  const cfg = CATEGORY_CONFIG[category];
  const found = cfg.conditions.find((c) => c.value === condition);
  return found?.level ?? "good";
}
