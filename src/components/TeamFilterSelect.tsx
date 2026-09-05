// Reusable team filter dropdown for coach views
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { Shield } from "lucide-react";
import type { Team } from "@/types";

const ALL = "__all__";

interface TeamFilterSelectProps {
  teams: Team[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  showIcon?: boolean;
}

export function TeamFilterSelect({ teams, value, onValueChange, className, showIcon }: TeamFilterSelectProps) {
  const { t: tr } = useT();
  if (teams.length === 0) return null;
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={tr("a11y.filters.team")} className={className ?? "w-[160px]"}>
        {showIcon && <Shield className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />}
        <SelectValue placeholder="All Teams" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All Teams</SelectItem>
        {teams.map((t) => (
          <SelectItem key={t.id} value={t.id}>{t.name} ({t.players.length})</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

TeamFilterSelect.ALL = ALL;
