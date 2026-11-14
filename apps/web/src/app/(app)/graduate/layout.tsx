import type { ReactNode } from "react";
export default function WorkspaceLayout({ children, detail }: { children: ReactNode; detail: ReactNode }) {
  return <>{children}{detail}</>;
}
