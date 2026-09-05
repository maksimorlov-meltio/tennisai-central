// Notification Settings — Toggle preferences via React Query
import { useNotificationPreferences, useUpdateNotificationPreferences } from "@/hooks/api/queries";
import { LoadingState, ErrorState } from "@/components/ui/shared";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Dumbbell, Trophy, UserPlus, Wallet, Brain, Settings } from "lucide-react";
import type { NotificationSettings } from "@/types";

const SETTINGS: { key: keyof NotificationSettings; label: string; description: string; icon: React.ReactNode }[] = [
  { key: "trainingReminders", label: "Training Reminders", description: "Get notified about upcoming training sessions", icon: <Dumbbell className="h-4 w-4" /> },
  { key: "tournamentReminders", label: "Tournament Reminders", description: "Get notified about upcoming tournaments", icon: <Trophy className="h-4 w-4" /> },
  { key: "requestApprovals", label: "Connection Requests", description: "Get notified when someone sends you a request", icon: <UserPlus className="h-4 w-4" /> },
  { key: "financeUpdates", label: "Finance Updates", description: "Get notified about finance-related changes", icon: <Wallet className="h-4 w-4" /> },
  { key: "aiInsightUpdates", label: "AI Insights", description: "Get notified when new AI insights are available", icon: <Brain className="h-4 w-4" /> },
  { key: "systemNotifications", label: "System Notifications", description: "Important system updates and announcements", icon: <Settings className="h-4 w-4" /> },
];

export default function NotificationSettingsPage() {
  const { data: prefs, isLoading, error } = useNotificationPreferences();
  const updateMut = useUpdateNotificationPreferences();

  if (isLoading) return <LoadingState message="Loading preferences…" />;
  if (error) return <ErrorState message="Failed to load preferences" onRetry={() => window.location.reload()} />;
  if (!prefs) return null;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-foreground">Notification Settings</h1><p className="text-muted-foreground">Manage which notifications you receive.</p></div>
      <DashboardCard title="Preferences" icon={<Bell className="h-4 w-4" />}>
        <div className="space-y-6">
          {SETTINGS.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{s.icon}</div>
                <div><Label htmlFor={`notif-${s.key}`} className="text-sm font-medium">{s.label}</Label><p className="text-xs text-muted-foreground">{s.description}</p></div>
              </div>
              <Switch id={`notif-${s.key}`} checked={prefs[s.key]} onCheckedChange={(checked) => updateMut.mutate({ [s.key]: checked })} disabled={updateMut.isPending} />
            </div>
          ))}
        </div>
      </DashboardCard>
    </div>
  );
}
