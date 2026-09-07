"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Development toggle between the chat app and Orb Mode.
 * Ctrl+Shift+O navigates / ↔ /orb. No visible control on the Orb screen.
 */
export function OrbModeShortcut() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || !event.shiftKey) return;
      if (event.key !== "O" && event.key !== "o") return;
      event.preventDefault();
      router.push(pathname === "/orb" ? "/" : "/orb");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname, router]);

  return null;
}
