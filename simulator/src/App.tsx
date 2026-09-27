import { useState } from "react";
import { StoreProvider, useStore } from "./store";
import { Phone } from "./components/Phone";
import { WalletPanel } from "./components/WalletPanel";
import { ScenarioDrawer } from "./components/Scenarios";

function Layout() {
  const { phones, addPhone, settings, setSettings } = useStore();
  const dark = settings.theme === "dark";
  const [scenariosOpen, setScenariosOpen] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main
        className={`mx-auto flex max-w-[1200px] flex-col items-center gap-4 p-4 transition-[padding] lg:px-6 ${
          scenariosOpen ? "xl:max-w-none xl:pr-[436px]" : ""
        }`}
      >
        {/* Phones */}
        <section aria-label="Phones" className="w-full rounded-2xl border border-zinc-200 bg-[radial-gradient(ellipse_at_top,theme(colors.zinc.50),theme(colors.zinc.200))] p-4 dark:border-zinc-800 dark:bg-[radial-gradient(ellipse_at_top,#1f1f23,#0c0c0e)]">
          <div className="mb-3 flex flex-col items-center gap-2 text-center">
            <p className="text-xs text-zinc-500">
              Click a phone, type <span className="font-mono">{settings.serviceCode}</span>, press the green key. Keyboard works too.
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={addPhone} className="btn-secondary shrink-0 whitespace-nowrap text-xs">
                <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                Add phone
              </button>
              <button type="button" onClick={() => setScenariosOpen((o) => !o)} aria-expanded={scenariosOpen} className="btn-secondary shrink-0 whitespace-nowrap text-xs">
                <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden><path d="M7 5v14l11-7L7 5Z" fill="currentColor" /></svg>
                Scenarios
              </button>
              <button
                type="button"
                onClick={() => setSettings({ theme: dark ? "light" : "dark" })}
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
                title={dark ? "Light mode" : "Dark mode"}
                className="btn-secondary shrink-0 whitespace-nowrap text-xs"
              >
                {dark ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" fill="none" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="1.8" /></svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>
                )}
                {dark ? "Light" : "Dark"}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-8 pb-2">
            {phones.map((p, i) => (
              <Phone key={p.id} phone={p} index={i} />
            ))}
          </div>
        </section>

        <div className="w-full max-w-[720px] min-w-0">
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
