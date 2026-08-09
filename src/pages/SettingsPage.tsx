// Unlinked from the sidebar: this page is still a stub, and the preferences it
// promised already live where they are used — account details on /profile,
// alert preferences on /notifications/settings, and the light/dark switch in
// the dashboard sidebar. Keep this file only until the route is retired; do not
// re-add a nav entry for it while it has no content of its own.
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>
      <p className="text-muted-foreground">Manage your profile and preferences.</p>
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-muted-foreground">Profile settings coming soon</p>
      </div>
    </div>
  );
}
