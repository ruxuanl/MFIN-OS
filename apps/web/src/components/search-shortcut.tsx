"use client";

import { useEffect } from "react";

export function SearchShortcut() {
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (window.matchMedia("(min-width: 681px)").matches && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("workspace-search")?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  return null;
}
