"use client";

import { AppShell } from "@/components/AppShell";
import { JarvisProvider } from "@/components/jarvis-provider";

export default function Home() {
  return (
    <JarvisProvider>
      <AppShell />
    </JarvisProvider>
  );
}
