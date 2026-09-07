import type { Metadata } from "next";
import { OrbMode } from "@/components/OrbMode";

export const metadata: Metadata = {
  title: "Jarvis Orb",
  description: "Jarvis Orb satellite display",
};

export default function OrbPage() {
  return <OrbMode />;
}
