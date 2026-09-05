// Admin management — the tools themselves (users, relationships, alerts) are
// not built yet. Rather than a "coming soon" box, say what this page will be
// for and send the admin to the one place with a real overview today.
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/shared";
import { useT } from "@/lib/i18n";

export default function AdminPage() {
  const { t } = useT();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Admin Management</h1>
      <p className="text-muted-foreground">User management, tournaments, and system alerts.</p>
      <EmptyState
        icon={<Shield className="h-6 w-6 text-muted-foreground" />}
        title={t("empty.admin.title")}
        description={t("empty.admin.description")}
        action={
          <Button asChild variant="outline" className="gap-1.5">
            <Link to="/dashboard/admin">{t("empty.admin.action")}</Link>
          </Button>
        }
      />
    </div>
  );
}
