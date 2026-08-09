// Notification-settings surface: channel switches (Email/Push) + per-category
// toggles, plus a one-click "enable push on this device" action. Lives in the
// notify agent's area — rendered from NotificationsPage.
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/shared";
import { BellRing, Mail, Smartphone } from "lucide-react";
import {
  useNotificationPreferencesFull,
  useUpdateNotificationPreferencesFull,
  usePushPublicKey,
  useSubscribePush,
} from "@/hooks/api/notifications";
import { enablePushOnThisDevice, isPushSupported } from "./pushClient";
import type { NotificationPreferencesFull } from "@/api/endpoints/notificationPrefs";

const CATEGORY_FIELDS: { key: keyof NotificationPreferencesFull; label: string; description: string }[] = [
  { key: "trainingReminders", label: "Training reminders", description: "Upcoming sessions and schedule changes" },
  { key: "tournamentReminders", label: "Tournament reminders", description: "Entries, deadlines and upcoming events" },
  { key: "requestApprovals", label: "Request approvals", description: "Training requests, approvals and reschedules" },
  { key: "financeUpdates", label: "Finance updates", description: "New expenses and finance entries" },
  { key: "aiInsightUpdates", label: "AI insight updates", description: "New scouting reports, game plans and analysis" },
  { key: "systemNotifications", label: "System notifications", description: "Account and general app notifications" },
];

type DeviceStatus = "idle" | "enabled" | "unsupported" | "denied";

export function NotificationPreferencesCard() {
  const { data: prefs, isLoading, error, refetch } = useNotificationPreferencesFull();
  const update = useUpdateNotificationPreferencesFull();
  const { data: pushKey } = usePushPublicKey();
  const subscribePush = useSubscribePush();
  const [enabling, setEnabling] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("idle");

  if (isLoading) return <LoadingState message="Loading notification preferences…" />;
  if (error || !prefs) {
    return <ErrorState message="Failed to load notification preferences" onRetry={() => refetch()} />;
  }

  const toggle = (key: keyof NotificationPreferencesFull) => (checked: boolean) => {
    update.mutate({ [key]: checked });
  };

  const publicKey = pushKey?.publicKey ?? null;
  const pushConfigured = Boolean(publicKey);

  async function handleEnablePush() {
    if (!publicKey) return;
    setEnabling(true);
    try {
      const sub = await enablePushOnThisDevice(publicKey);
      await subscribePush.mutateAsync({
        endpoint: sub.endpoint,
        keys: sub.keys,
        userAgent: navigator.userAgent,
      });
      setDeviceStatus("enabled");
      toast.success("Push notifications enabled on this device");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't enable push on this device";
      setDeviceStatus(message.toLowerCase().includes("permission") ? "denied" : "unsupported");
      toast.error(message);
    } finally {
      setEnabling(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BellRing className="h-5 w-5 text-primary" /> Notification preferences
        </CardTitle>
        <CardDescription>Choose how you want to hear about activity, and what's worth a notification.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Channels</p>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <Label htmlFor="pref-email-enabled">Email</Label>
                <p className="text-xs text-muted-foreground">Send an email for notifications you've opted into</p>
              </div>
            </div>
            <Switch
              id="pref-email-enabled"
              checked={prefs.emailEnabled}
              onCheckedChange={toggle("emailEnabled")}
              disabled={update.isPending}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <Label htmlFor="pref-push-enabled">Push</Label>
                <p className="text-xs text-muted-foreground">
                  {pushConfigured
                    ? "Send a push notification to your registered devices"
                    : "Push isn't configured on this server yet"}
                </p>
              </div>
            </div>
            <Switch
              id="pref-push-enabled"
              checked={prefs.pushEnabled}
              onCheckedChange={toggle("pushEnabled")}
              disabled={update.isPending || !pushConfigured}
            />
          </div>

          {pushConfigured && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
              <div>
                <p className="text-sm text-foreground">This device</p>
                <p className="text-xs text-muted-foreground">
                  {deviceStatus === "enabled" && "Push is enabled on this device."}
                  {deviceStatus === "unsupported" && "This browser doesn't support push notifications, or enabling it failed."}
                  {deviceStatus === "denied" && "Notification permission was denied in the browser."}
                  {deviceStatus === "idle" && "Register this browser to receive push notifications."}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={handleEnablePush}
                disabled={enabling || deviceStatus === "enabled" || !isPushSupported()}
              >
                {enabling ? "Enabling…" : deviceStatus === "enabled" ? "Enabled" : "Enable push on this device"}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">What you're notified about</p>
          {CATEGORY_FIELDS.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label htmlFor={`pref-${key}`}>{label}</Label>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                id={`pref-${key}`}
                checked={prefs[key]}
                onCheckedChange={toggle(key)}
                disabled={update.isPending}
              />
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">{update.isPending ? "Saving…" : "Changes save automatically."}</p>
      </CardFooter>
    </Card>
  );
}
