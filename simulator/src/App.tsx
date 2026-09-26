import { useState } from "react";
import { StoreProvider, useStore } from "./store";
import { TopBar } from "./components/TopBar";
import { Phone } from "./components/Phone";
import { Inspector } from "./components/Inspector";
import { WalletPanel } from "./components/WalletPanel";
import { ScenarioDrawer } from "./components/Scenarios";

function Layout() {
  const { phones, addPhone, settings } = useStore();
  const [scenariosOpen, setScenariosOpen] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <TopBar onOpenScenarios={() => setScenariosOpen((o) => !o)} />

      <main
        className={`mx-auto grid max-w-[1680px] grid-cols-1 gap-4 p-4 transition-[padding] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:px-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_320px] ${
          scenariosOpen ? "xl:pr-[436px]" : ""
        }`}
      >
        {/* Phones */}
        <section aria-label="Phones" className="rounded-2xl border border-zinc-200 bg-[radial-gradient(ellipse_at_top,theme(colors.zinc.50),theme(colors.zinc.200))] p-4 dark:border-zinc-800 dark:bg-[radial-gradient(ellipse_at_top,#1f1f23,#0c0c0e)] lg:row-span-2 xl:row-span-1">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Phones</h2>
              <p className="text-xs text-zinc-500">
                Click a phone, type <span className="font-mono">{settings.serviceCode}</span>, press the green key. Keyboard works too.
              </p>
            </div>
            <button type="button" onClick={addPhone} className="btn-secondary shrink-0 whitespace-nowrap text-xs">
              <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              Add phone
            </button>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-8 pb-2">
            {phones.map((p, i) => (
              <Phone key={p.id} phone={p} index={i} />
            ))}
          </div>
        </section>

        <div className="min-w-0 lg:sticky lg:top-[88px] lg:self-start">
          <Inspector />
        </div>

        <div className="min-w-0 xl:sticky xl:top-[88px] xl:self-start">
          <WalletPanel />
        </div>
      </main>

      <ScenarioDrawer open={scenariosOpen} onClose={() => setScenariosOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Layout />
    </StoreProvider>
  );
}
