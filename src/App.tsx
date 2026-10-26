import { useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { SettingsDialog } from "@/components/dashboard/SettingsDialog";
import { NAV_ITEMS, type PageId } from "@/components/dashboard/navItems";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { AboutPage } from "@/components/pages/AboutPage";
import { LogsPage } from "@/components/pages/LogsPage";
import { MapPage } from "@/components/pages/MapPage";
import { NavigationPage } from "@/components/pages/NavigationPage";
import { OverviewPage } from "@/components/pages/OverviewPage";
import { ParametersPage } from "@/components/pages/ParametersPage";
import { SimulationPage } from "@/components/pages/SimulationPage";

function pageFromHash(): PageId {
  const id = window.location.hash.replace(/^#\/?/, "");
  return NAV_ITEMS.some((n) => n.id === id) ? (id as PageId) : "overview";
}

const PAGES: Record<PageId, () => JSX.Element> = {
  overview: OverviewPage,
  simulation: SimulationPage,
  navigation: NavigationPage,
  map: MapPage,
  logs: LogsPage,
  parameters: ParametersPage,
  about: AboutPage,
};

export default function App() {
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (id: PageId) => {
    window.location.hash = `/${id}`;
    setPage(id);
    setNavOpen(false);
  };

  const Page = PAGES[page];
  const title = NAV_ITEMS.find((n) => n.id === page)?.label ?? "";

  useEffect(() => {
    document.title = `${title} · TurtleBot3 Navigation Dashboard`;
  }, [title]);

  return (
    <div className="flex h-full flex-col">
      <DashboardHeader onOpenSettings={() => setSettingsOpen(true)} onToggleNav={() => setNavOpen((o) => !o)} />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar page={page} onNavigate={navigate} open={navOpen} />
        {navOpen && <div className="fixed inset-0 top-[84px] z-30 bg-black/50 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden />}
        <main className="min-w-0 flex-1 overflow-auto px-3 pb-6 pt-4 md:px-4 xl:pb-6 xl:pl-4 xl:pr-[14px] xl:pt-[22px]">
          <h1 className="sr-only">{title}</h1>
          <Page />
        </main>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onOpenParameters={() => navigate("parameters")} />
    </div>
  );
}
