import { Box, FileText, House, Info, MapPin, Map as MapIcon, SlidersHorizontal, type LucideIcon } from "lucide-react";

export type PageId = "overview" | "simulation" | "navigation" | "map" | "logs" | "parameters" | "about";

export const NAV_ITEMS: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: House },
  { id: "simulation", label: "Simulation", icon: Box },
  { id: "navigation", label: "Navigation", icon: MapPin },
  { id: "map", label: "Map & RViz", icon: MapIcon },
  { id: "logs", label: "Logs", icon: FileText },
  { id: "parameters", label: "Parameters", icon: SlidersHorizontal },
  { id: "about", label: "About", icon: Info },
];
