// TODO: GET /api/player/stats
import { EmptyState } from "@/components/ui/shared";
import { BarChart3 } from "lucide-react";

export default function StatsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Statistics</h1>
        <p className="text-sm text-muted-foreground">Your season performance overview.</p>
      </div>

      <EmptyState
        icon={<BarChart3 className="h-6 w-6 text-muted-foreground" />}
        title="No match data recorded yet"
        description="Once your matches are recorded, your win rate, tournament results and match history will appear here."
      />
    </div>
  );
}
