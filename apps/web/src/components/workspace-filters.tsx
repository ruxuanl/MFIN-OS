"use client";

import type { ReactNode } from "react";

export function WorkspaceFilters({ children }: { children: ReactNode }) {
  return <form className="filter-bar" method="get" onChange={(event) => {
    if (event.target instanceof HTMLSelectElement && window.matchMedia("(min-width: 681px)").matches) event.currentTarget.requestSubmit();
  }}>{children}</form>;
}
