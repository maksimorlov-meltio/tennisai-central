// ============================================================
// TennisAI — per-match performance trend (recharts)
//
// Guards against a misleading trend, in order:
//   1. Every point comes from ONE logged match. Nothing is smoothed,
//      interpolated, resampled or zero-filled.
//   2. A match missing the counts for the selected metric produces a null →
//      `connectNulls={false}` draws a GAP rather than a straight line across it.
//   3. Fewer than MIN_TREND_POINTS usable points ⇒ no chart at all, just an
//      honest "not enough data yet" panel that says how many points exist.
//   4. The y axis is pinned to 0–100%, so the shape of the line can never be
//      exaggerated by auto-scaling to a narrow range.
//   5. The sample ("6 of 8 matches in this window have these counts") is
//      printed under the chart, always.
//
// Colours are CSS tokens only (`hsl(var(--primary))`, `hsl(var(--border))`),
// so the chart is theme-aware in light and dark and stays matte — no glow.
// ============================================================

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NO_VALUE, formatMatchDate, formatPct, matchCountLabel } from "@/lib/stats/format";
import {
  MIN_TREND_POINTS,
  TREND_METRICS,
  buildTrendSeries,
  trendMetricMeta,
  type TrendMetricId,
  type TrendPoint,
} from "@/components/stats/trend";
import type { MatchView } from "@/types";

function TrendTooltip({ point, metricLabel }: { point: TrendPoint | null; metricLabel: string }) {
  if (!point) return null;

  return (
    <div className="min-w-[10rem] space-y-1 border border-border bg-card px-3 py-2 text-xs">
      <p className="font-semibold text-foreground">{point.opponentName ?? "Opponent not recorded"}</p>
      <p className="text-muted-foreground">
        {formatMatchDate(point.dateIso)}
        {point.result ? ` · ${point.result === "win" ? "Win" : "Loss"}` : " · result not recorded"}
      </p>
      <p className="text-foreground">
        <span className="text-muted-foreground">{metricLabel}: </span>
        {/* A real 0% must print as "0%", so never test the value for truthiness. */}
        <span className="font-semibold tabular-nums">{formatPct(point.value)}</span>
      </p>
      {point.value === null && <p className="text-muted-foreground">These counts were not entered.</p>}
    </div>
  );
}

export interface PerformanceTrendChartProps {
  /** The full match list, newest first (as the API returns it). */
  matches: MatchView[];
  /** How many of the most recent matches to plot. */
  windowSize: number;
  /** Human label of the active window, e.g. "Last 10". */
  windowLabel: string;
}

export function PerformanceTrendChart({ matches, windowSize, windowLabel }: PerformanceTrendChartProps) {
  const [metric, setMetric] = useState<TrendMetricId>("firstServePct");

  const meta = trendMetricMeta(metric);
  const series = useMemo(() => buildTrendSeries(matches, metric, windowSize), [matches, metric, windowSize]);

  const chartConfig: ChartConfig = {
    value: { label: meta.label, color: "hsl(var(--primary))" },
  };

  const metricSelect = (
    <Select value={metric} onValueChange={(next) => setMetric(next as TrendMetricId)}>
      <SelectTrigger className="h-9 w-[190px] text-xs" aria-label="Trend metric">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TREND_METRICS.map((option) => (
          <SelectItem key={option.id} value={option.id} className="text-xs">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <DashboardCard
      title="Trend"
      description={`One point per logged match · ${windowLabel}`}
      icon={<LineChartIcon className="h-4 w-4" />}
      action={metricSelect}
    >
      {!series.plottable ? (
        <div className="space-y-2 border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium text-foreground">Not enough data yet to show a trend</p>
          <p className="text-sm text-muted-foreground">
            {series.usable === 0
              ? `None of the ${matchCountLabel(series.points.length)} in this window has ${meta.requires} recorded.`
              : `Only ${series.usable} of the ${matchCountLabel(series.points.length)} in this window ${
                  series.usable === 1 ? "has" : "have"
                } ${meta.requires} recorded — a trend needs at least ${MIN_TREND_POINTS} points.`}
          </p>
          <p className="text-xs text-muted-foreground">
            Two points are a pair of numbers, not a trend, so nothing is plotted here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
            <LineChart data={series.points} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="2 4" />
              <XAxis
                dataKey="x"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={16}
                tickFormatter={(value: string) => series.points[Number(value)]?.label ?? NO_VALUE}
              />
              <YAxis
                // Pinned 0–100: an auto domain would exaggerate small moves.
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={(value: number) => `${value}%`}
              />
              <ChartTooltip
                cursor={{ stroke: "hsl(var(--border))" }}
                // Keep null points in the payload so hovering a GAP explains
                // itself ("these counts were not entered") instead of nothing.
                filterNull={false}
                content={({ active, payload }) => (
                  <TrendTooltip
                    metricLabel={meta.label}
                    point={active && payload && payload.length > 0 ? payload[0].payload : null}
                  />
                )}
              />
              <Line
                dataKey="value"
                type="linear"
                stroke="var(--color-value)"
                strokeWidth={2}
                // A gap, not a bridge, wherever the counts were never entered.
                connectNulls={false}
                dot={{ r: 2.5, fill: "var(--color-value)", stroke: "var(--color-value)" }}
                activeDot={{ r: 4, fill: "var(--color-value)", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>

          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">{meta.definition}</p>
            <p className="text-xs text-muted-foreground">
              Plotted from{" "}
              <span className="font-medium text-foreground">
                {series.usable} of the {matchCountLabel(series.points.length)}
              </span>{" "}
              in this window.
              {series.missing > 0
                ? ` ${series.missing} ${series.missing === 1 ? "match has" : "matches have"} no ${
                    meta.requires
                  } recorded, so the line breaks there — the gap is never filled in.`
                : " Every match in the window has these counts."}
            </p>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
