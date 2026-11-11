import { AppShell } from "@/components/app-shell";
import { WorkspaceSyncManager } from "@/components/workspace-sync-manager";
import { requireUser } from "@/lib/auth/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}><WorkspaceSyncManager enabled={!user.isMock} />{children}</AppShell>;
}
