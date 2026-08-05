// Barrel for the statistics surface — reusable by the coach-facing views.
export { HeadlineCard } from "./HeadlineCard";
export { MetricTile } from "./MetricTile";
export { SurfaceSplitList, SurfaceSplitRow } from "./SurfaceSplitList";
export { RecentFormStrip, FormChip } from "./RecentFormStrip";
export { MatchDetailPanel } from "./MatchDetailPanel";
export { ExpandableMatchRow } from "./ExpandableMatchRow";
export { PerformanceTrendChart } from "./PerformanceTrendChart";
export {
  StatsWindowControl,
  buildWindowOptions,
  recentParamFor,
  resolveWindow,
  MAX_RECENT,
} from "./StatsWindowControl";
export type { StatsWindowId, StatsWindowOption } from "./StatsWindowControl";
export {
  MIN_TREND_POINTS,
  TREND_METRICS,
  buildTrendSeries,
  trendMetricMeta,
  windowedChronological,
} from "./trend";
export type { TrendMetricId, TrendMetricMeta, TrendPoint, TrendSeries } from "./trend";
export type { MetricKind } from "./MetricTile";
