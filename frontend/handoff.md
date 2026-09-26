# ZAKA Wallet — Frontend Handoff for Claude Code

Recreate this frontend as a standalone **Vite + React + Tailwind CSS** app. Everything below is copy-paste ready. The app is a mobile-first ZAR wallet with a marketing landing page and a phone-shell wallet app. It runs entirely on a **static mock data layer** (no backend, no auth server) so every screen renders and every flow completes instantly.

---

## 1. Tech stack & goal

- **Vite** + **React 18** + **Tailwind CSS** + **JavaScript (JSX)**
- **react-router-dom** for routing
- **framer-motion** for step transitions / animations
- **lucide-react** for icons
- **jspdf** + **html2canvas** for the "export all pages to PDF" feature
- Design language: dark charcoal background, teal + gold accents, cream ink, rounded cards, mono labels, iOS-like slide transitions between steps.

The wallet has two surfaces:
1. `/` — public marketing landing page (nav, hero, how-it-works, features, footer).
2. `/app`, `/balance`, `/send`, `/claim`, `/address`, `/onboarding` — a phone-shell wallet app (max-width 440px, centered), all flows walkable with mock data.

---

## 2. Project setup

```bash
npm create vite@latest zaka-wallet -- --template react
cd zaka-wallet
npm install react-router-dom framer-motion lucide-react jspdf html2canvas
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### `vite.config.js`
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

### `jsconfig.json`
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

> Everywhere in the code, imports use the `@/` alias (e.g. `@/lib/wallet`). Configure it as above so those imports resolve.

### `index.html`
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>ZAKA — ZAR Smart Wallet</title>
    <script>
      // apply saved theme before paint to avoid flash
      try {
        var t = localStorage.getItem('zaka-theme');
        if (t === 'light') document.documentElement.classList.remove('dark');
        else document.documentElement.classList.add('dark');
      } catch (e) { document.documentElement.classList.add('dark'); }
    </script>
  </head>
  <body class="dark">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

---

## 3. Tailwind & design tokens

### `tailwind.config.js`
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      opacity: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [i, `${i / 100}`])),
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        zaka: {
          ink: 'rgb(var(--zaka-ink) / <alpha-value>)',
          panel: 'rgb(var(--zaka-panel) / <alpha-value>)',
          line: 'rgb(var(--zaka-line) / <alpha-value>)',
          teal: 'rgb(var(--zaka-teal) / <alpha-value>)',
          ochre: '#b07a4a',
          gold: 'rgb(var(--zaka-gold) / <alpha-value>)',
          cream: 'rgb(var(--zaka-cream) / <alpha-value>)',
          mute: 'rgb(var(--zaka-mute) / <alpha-value>)',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
      },
      fontFamily: {
        heading: ['var(--font-heading)'],
        body: ['var(--font-body)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
```

> Requires `tailwindcss-animate` (`npm i -D tailwindcss-animate`).

### `src/index.css`
```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.9%;
    --primary: 0 0% 9%; --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%; --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%; --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%; --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%; --destructive-foreground: 0 0% 98%;
    --radius: 0.5rem;
    /* ZAKA palette — LIGHT mode (RGB channels) */
    --zaka-ink: 247 245 240;
    --zaka-panel: 255 255 255;
    --zaka-line: 226 223 215;
    --zaka-cream: 24 26 28;
    --zaka-mute: 110 114 118;
    --zaka-teal: 38 138 130;
    --zaka-gold: 176 128 44;
    --font-heading: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
    --font-body: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
    --font-display: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .dark {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --ring: 0 0% 83.1%;
    --primary: 0 0% 98%; --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%; --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%; --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 14.9%; --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%; --destructive-foreground: 0 0% 98%;
    /* ZAKA palette — DARK mode (RGB channels) */
    --zaka-ink: 15 17 18;
    --zaka-panel: 23 25 27;
    --zaka-line: 42 45 48;
    --zaka-cream: 244 241 234;
    --zaka-mute: 141 145 149;
    --zaka-teal: 58 163 155;
    --zaka-gold: 226 184 87;
  }
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-zaka-ink text-foreground font-body; }
}
```

---

## 4. File structure

```
zaka-wallet/
  index.html
  vite.config.js
  jsconfig.json
  tailwind.config.js
  postcss.config.js
  src/
    main.jsx
    App.jsx
    index.css
    lib/
      wallet.js
      AuthContext.jsx
    hooks/
      useWallet.js
    components/
      zaka/
        ThemeProvider.jsx
        ThemeToggle.jsx
        PhoneShell.jsx
        Step.jsx
        TopBar.jsx
        Btn.jsx
        Logo.jsx
        Loader.jsx
        Title.jsx
        Field.jsx
        StatusBadge.jsx
        SponsoredNote.jsx
        Result.jsx
        Processing.jsx
        PinPad.jsx
        PinStep.jsx
        TxDetails.jsx
        RequireWallet.jsx
        dashboard/
          Dashboard.jsx
          BalanceCard.jsx
          ActionTile.jsx
        send/
          SendRecipient.jsx
          SendAmount.jsx
          SendSummary.jsx
        onboarding/
          Onboarding.jsx
          WelcomeStep.jsx
          PhoneStep.jsx
          CreatedStep.jsx
      landing/
        LandingNav.jsx
        Hero.jsx
        HowItWorks.jsx
        Features.jsx
        LandingFooter.jsx
    pages/
      Landing.jsx
      WalletHome.jsx
      CheckBalance.jsx
      SendMoney.jsx
      ClaimFunds.jsx
      WalletAddress.jsx
      Onboarding.jsx
      ExportPdf.jsx
```

---

## 5. Entry & routing

### `src/main.jsx`
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### `src/App.jsx`
```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/components/zaka/ThemeProvider';
import { AuthProvider } from '@/lib/AuthContext';
import PhoneShell from '@/components/zaka/PhoneShell';
import Landing from '@/pages/Landing';
import WalletHome from '@/pages/WalletHome';
import CheckBalance from '@/pages/CheckBalance';
import SendMoney from '@/pages/SendMoney';
import ClaimFunds from '@/pages/ClaimFunds';
import WalletAddress from '@/pages/WalletAddress';
import OnboardingPage from '@/pages/Onboarding';
import ExportPdf from '@/pages/ExportPdf';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/export" element={<ExportPdf />} />
            <Route element={<PhoneShell />}>
              <Route path="/app" element={<WalletHome />} />
              <Route path="/balance" element={<CheckBalance />} />
              <Route path="/send" element={<SendMoney />} />
              <Route path="/claim" element={<ClaimFunds />} />
              <Route path="/address" element={<WalletAddress />} />
              <Route path="/onboarding" element={<OnboardingPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

---

## 6. Mock data layer

### `src/lib/wallet.js`
Fully static — no backend. Any 4–6 digit PIN works; Send/Claim succeed instantly.

```js
// Fully static mock wallet layer — no database calls anywhere.

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const randomHex = (bytes) =>
  '0x' + Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

export const shortAddr = (a, s = 8, e = 6) => (a ? `${a.slice(0, s)}...${a.slice(-e)}` : '');

export const zar = (n) =>
  'R' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function normalizePhone(input) {
  const d = String(input).replace(/\D/g, '');
  const local = d.startsWith('27') && d.length === 11 ? '0' + d.slice(2) : d;
  return /^0\d{9}$/.test(local) ? local : null;
}

export const formatPhone = (p) => (p ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : '');

export const MOCK_WALLET = {
  id: 'mock-wallet-1',
  phone: '0721234567',
  address: '0x95e079ab3f5c2d14e0a8b7c6f9d8e1a2b3c4d5e6',
  pin_hash: 'mock',
  balance: 100,
  deployed: true,
};

export const refreshWallet = () => {};

export async function findWalletByPhone(phone) {
  await wait(400);
  return { id: 'mock-recipient', phone, address: randomHex(20), balance: 0, deployed: true };
}

export async function createWallet(phone, pin) {
  await wait(800);
  return { ...MOCK_WALLET, phone, pin_hash: 'mock' };
}

export const verifyPin = async () => true;

export async function sendWelcomeBonus() {
  await wait(600);
}

export async function claimFaucet() {
  await wait(1600);
  return randomHex(32);
}

export async function sendMoney() {
  await wait(1600);
  return randomHex(32);
}
```

### `src/hooks/useWallet.js`
```jsx
import { useQuery } from '@tanstack/react-query';
import { MOCK_WALLET } from '@/lib/wallet';

export default function useWallet() {
  return useQuery({ queryKey: ['wallet'], queryFn: async () => MOCK_WALLET });
}
```
> Also `npm i @tanstack/react-query`. If you'd rather avoid react-query, replace this hook with a plain `useState`/`useEffect` returning `{ data: MOCK_WALLET, isLoading: false }`.

### `src/lib/AuthContext.jsx`
The landing page reads an auth state to decide which buttons to show. Stub it to "logged out" so the marketing CTAs render.

```jsx
import { createContext, useContext } from 'react';

const AuthCtx = createContext({ isAuthenticated: false });

export function AuthProvider({ children }) {
  return <AuthCtx.Provider value={{ isAuthenticated: false }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
```

---

## 7. Theme

### `src/components/zaka/ThemeProvider.jsx`
```jsx
import { createContext, useContext, useEffect, useState } from 'react';

const KEY = 'zaka-theme';
const ThemeCtx = createContext({ theme: 'dark', toggle: () => {} });

function getInitial() {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitial);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(KEY, theme);
  }, [theme]);
  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
```

### `src/components/zaka/ThemeToggle.jsx`
```jsx
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`flex h-10 w-10 items-center justify-center rounded-full text-zaka-mute transition hover:bg-zaka-cream/5 hover:text-zaka-cream ${className}`}
    >
      {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
```

---

## 8. Shared components

### `src/components/zaka/PhoneShell.jsx`
```jsx
import { Outlet } from 'react-router-dom';

export default function PhoneShell() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-zaka-ink font-body text-zaka-cream antialiased">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-zaka-teal/10 blur-3xl" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[440px] flex-col px-6 pb-8 pt-6">
        <Outlet />
      </div>
    </div>
  );
}
```

### `src/components/zaka/Step.jsx`
```jsx
import { motion } from 'framer-motion';

export default function Step({ children, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`flex flex-1 flex-col ${className}`}
    >
      {children}
    </motion.div>
  );
}
```

### `src/components/zaka/TopBar.jsx`
```jsx
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

export default function TopBar({ label, onBack }) {
  const navigate = useNavigate();
  return (
    <div className="mb-8 flex h-12 items-center justify-between">
      <button
        type="button"
        onClick={onBack || (() => navigate('/app'))}
        className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-zaka-cream/5"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-mute">{label}</span>
      <ThemeToggle />
    </div>
  );
}
```

### `src/components/zaka/Btn.jsx`
```jsx
const V = {
  primary: 'bg-zaka-cream text-zaka-ink hover:bg-white',
  teal: 'bg-zaka-teal text-zaka-ink hover:brightness-110',
  ghost: 'border border-zaka-line text-zaka-cream hover:bg-white/5',
};

export default function Btn({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      {...props}
      className={`h-14 w-full rounded-2xl font-medium tracking-tight transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${V[variant]} ${className}`}
    />
  );
}
```

### `src/components/zaka/Logo.jsx`
```jsx
export default function Logo({ size = 40 }) {
  return (
    <div className="relative flex items-center" style={{ width: size * 1.35, height: size }}>
      <div className="grid grid-cols-2 gap-[2px]" style={{ width: size * 0.56, height: size * 0.62 }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="rounded-[2px] bg-zaka-teal" />
        ))}
      </div>
      <div
        className="absolute right-0 top-0 flex h-full items-center justify-end rounded-[22%] bg-zaka-cream"
        style={{ width: size * 0.9, paddingRight: size * 0.1 }}
      >
        <span
          className="flex items-center justify-center rounded-[30%] border-2 border-zaka-ink/80"
          style={{ width: size * 0.36, height: size * 0.3 }}
        >
          <span className="rounded-full bg-zaka-gold" style={{ width: size * 0.11, height: size * 0.11 }} />
        </span>
      </div>
    </div>
  );
}
```

### `src/components/zaka/Loader.jsx`
```jsx
export default function Loader() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zaka-line border-t-zaka-teal" />
    </div>
  );
}
```

### `src/components/zaka/Title.jsx`
```jsx
export default function Title({ title, sub }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-[30px] leading-[1.1] tracking-tight">{title}</h1>
      {sub && <p className="mt-3 text-zaka-mute">{sub}</p>}
    </div>
  );
}
```

### `src/components/zaka/Field.jsx`
```jsx
export default function Field({ error, helper, prefix, ...props }) {
  return (
    <div>
      <div
        className={`flex items-baseline gap-2 border-b-2 pb-3 transition-colors ${
          error ? 'border-rose-400/70' : 'border-zaka-line focus-within:border-zaka-teal'
        }`}
      >
        {prefix && <span className="text-3xl text-zaka-mute">{prefix}</span>}
        <input
          {...props}
          className="w-full bg-transparent text-3xl font-medium tracking-tight outline-none placeholder:text-zaka-line"
        />
      </div>
      <p className={`mt-3 text-sm ${error ? 'text-rose-500' : 'text-zaka-mute'}`}>{error || helper}</p>
    </div>
  );
}
```

### `src/components/zaka/StatusBadge.jsx`
```jsx
export default function StatusBadge({ deployed }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
        deployed ? 'bg-zaka-teal/15 text-zaka-teal' : 'bg-zaka-gold/10 text-zaka-gold'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${deployed ? 'bg-zaka-teal' : 'bg-zaka-gold'}`} />
      {deployed ? 'Active' : 'Activates on first payment'}
    </span>
  );
}
```

### `src/components/zaka/SponsoredNote.jsx`
```jsx
import { ShieldCheck } from 'lucide-react';

export default function SponsoredNote({ text = 'No fees — covered for you' }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zaka-teal/30 bg-zaka-teal/10 px-3 py-1.5 text-xs text-zaka-teal">
      <ShieldCheck className="h-3.5 w-3.5" />
      {text}
    </div>
  );
}
```

### `src/components/zaka/Result.jsx`
```jsx
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import Step from './Step';

export default function Result({ ok = true, title, children, actions }) {
  return (
    <Step>
      <div className="flex flex-1 flex-col justify-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className={`flex h-16 w-16 items-center justify-center rounded-full ${
            ok ? 'bg-zaka-teal text-zaka-ink' : 'bg-rose-400/15 text-rose-500'
          }`}
        >
          {ok ? <Check className="h-8 w-8" strokeWidth={2.5} /> : <X className="h-8 w-8" />}
        </motion.div>
        <h1 className="mt-8 font-display text-[34px] leading-[1.05] tracking-tight">{title}</h1>
        <div className="mt-5 space-y-4 text-zaka-mute">{children}</div>
      </div>
      <div className="space-y-3 pt-6">{actions}</div>
    </Step>
  );
}
```

### `src/components/zaka/Processing.jsx`
```jsx
import { motion } from 'framer-motion';
import Step from './Step';

export default function Processing({ label = 'Processing' }) {
  return (
    <Step className="items-center justify-center text-center">
      <div className="relative h-28 w-28">
        {[0, 0.8].map((d) => (
          <motion.span
            key={d}
            className="absolute inset-0 rounded-full border border-zaka-teal/50"
            animate={{ scale: [1, 1.6], opacity: [0.8, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: d, ease: 'easeOut' }}
          />
        ))}
        <div className="absolute inset-5 animate-spin rounded-full border-2 border-zaka-line border-t-zaka-teal" />
      </div>
      <p className="mt-10 font-display text-2xl tracking-tight">{label}</p>
      <p className="mt-2 text-sm text-zaka-mute">This takes a few seconds. No fees are charged.</p>
    </Step>
  );
}
```

### `src/components/zaka/PinPad.jsx`
```jsx
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Delete } from 'lucide-react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function PinPad({ value, onChange, error, max = 6 }) {
  const press = (k) => {
    if (k === 'del') onChange(value.slice(0, -1));
    else if (k && value.length < max) onChange(value + k);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const slots = Math.max(4, value.length);
  return (
    <div>
      <motion.div key={error} animate={error ? { x: [0, -8, 8, -6, 6, 0] } : {}} className="flex h-6 items-center justify-center gap-4">
        {Array.from({ length: slots }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full transition-all duration-200 ${
              i < value.length ? 'scale-100 bg-zaka-cream' : 'scale-90 border border-zaka-mute/50'
            }`}
          />
        ))}
      </motion.div>
      <p className="mt-3 min-h-[20px] text-center text-sm text-rose-500">{error}</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button
              type="button"
              key={i}
              onClick={() => press(k)}
              aria-label={k === 'del' ? 'Delete' : k}
              className="flex h-[52px] items-center justify-center rounded-2xl text-xl font-medium transition hover:bg-zaka-cream/5 active:scale-95 active:bg-zaka-cream/10"
            >
              {k === 'del' ? <Delete className="h-5 w-5" /> : k}
            </button>
          )
        )}
      </div>
    </div>
  );
}
```

### `src/components/zaka/PinStep.jsx`
```jsx
import { useState } from 'react';
import Step from './Step';
import TopBar from './TopBar';
import Btn from './Btn';
import PinPad from './PinPad';

export default function PinStep({ eyebrow, title, sub, cta, onSubmit, onBack, children }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^\d{4,6}$/.test(pin)) return setError('PIN must be 4–6 digits only');
    setBusy(true);
    const err = await onSubmit(pin);
    setBusy(false);
    if (err) {
      setError(err);
      setPin('');
    }
  };

  return (
    <Step>
      <TopBar label={eyebrow} onBack={onBack} />
      <h1 className="font-display text-[28px] leading-[1.12] tracking-tight">{title}</h1>
      {sub && <p className="mt-2 text-zaka-mute">{sub}</p>}
      <div className="mt-6">{children}</div>
      <div className="mt-auto pt-4">
        <PinPad value={pin} onChange={(v) => { setPin(v); setError(''); }} error={error} />
        <Btn className="mt-4" onClick={submit} disabled={busy || pin.length < 4}>
          {busy ? 'Checking…' : cta}
        </Btn>
      </div>
    </Step>
  );
}
```

### `src/components/zaka/TxDetails.jsx`
```jsx
import { ArrowUpRight } from 'lucide-react';
import SponsoredNote from './SponsoredNote';

export default function TxDetails({ hash }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zaka-line bg-zaka-panel p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zaka-mute">Receipt</p>
        <p className="mt-1 font-mono text-sm text-zaka-cream">Ref: {hash.slice(0, 8)}...</p>
        <a
          href={`https://jiffyscan.xyz/userOpHash/${hash}?network=sepolia`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm text-zaka-teal hover:underline"
        >
          View on explorer <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
      <SponsoredNote />
    </div>
  );
}
```

### `src/components/zaka/RequireWallet.jsx`
```jsx
import Loader from './Loader';
import useWallet from '@/hooks/useWallet';

export default function RequireWallet({ children }) {
  const { data: wallet, isLoading } = useWallet();
  if (isLoading) return <Loader />;
  if (!wallet) return null;
  return children(wallet);
}
```

---

## 9. Dashboard components

### `src/components/zaka/dashboard/BalanceCard.jsx`
```jsx
import { motion } from 'framer-motion';
import StatusBadge from '../StatusBadge';
import { zar } from '@/lib/wallet';

export default function BalanceCard({ wallet }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-zaka-line bg-gradient-to-br from-zaka-panel to-zaka-ink p-6">
      <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-zaka-teal/15 blur-2xl" />
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-mute">Available balance</p>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-mono text-sm text-zaka-mute">ZAR</span>
        <motion.span
          key={wallet.balance}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-5xl font-semibold tracking-tight"
        >
          {zar(wallet.balance)}
        </motion.span>
      </div>
      <div className="mt-6">
        <StatusBadge deployed={wallet.deployed} />
      </div>
    </div>
  );
}
```

### `src/components/zaka/dashboard/ActionTile.jsx`
```jsx
import { Link } from 'react-router-dom';

export default function ActionTile({ n, icon: Icon, label, sub, to }) {
  return (
    <Link
      to={to}
      className="group flex h-40 flex-col justify-between rounded-3xl border border-zaka-line bg-zaka-panel/60 p-5 transition-all duration-300 hover:border-zaka-teal/50 hover:bg-zaka-panel active:scale-[0.98]"
    >
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zaka-cream/5 text-zaka-teal transition-colors duration-300 group-hover:bg-zaka-teal group-hover:text-zaka-ink">
          <Icon className="h-5 w-5" />
        </span>
        <span className="font-mono text-[11px] text-zaka-mute">{n}</span>
      </div>
      <span>
        <span className="block font-medium leading-snug">{label}</span>
        <span className="mt-0.5 block text-xs text-zaka-mute">{sub}</span>
      </span>
    </Link>
  );
}
```

### `src/components/zaka/dashboard/Dashboard.jsx`
```jsx
import { Link } from 'react-router-dom';
import { Wallet, ArrowUpRight, Gift, QrCode, LogOut, ChevronRight } from 'lucide-react';
import Step from '../Step';
import Logo from '../Logo';
import BalanceCard from './BalanceCard';
import ActionTile from './ActionTile';
import ThemeToggle from '../ThemeToggle';
import { formatPhone, shortAddr } from '@/lib/wallet';

const ACTIONS = [
  { n: '01', icon: Wallet, label: 'Check Balance', sub: 'See what you have', to: '/balance' },
  { n: '02', icon: ArrowUpRight, label: 'Send Money', sub: 'Free & instant', to: '/send' },
  { n: '03', icon: Gift, label: 'Claim R100 Demo Funds', sub: 'Top up to try it', to: '/claim' },
  { n: '04', icon: QrCode, label: 'My Wallet Address', sub: 'Receive ZAR', to: '/address' },
];

export default function Dashboard({ wallet }) {
  return (
    <Step>
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo size={28} />
          <div>
            <p className="text-sm font-medium">{formatPhone(wallet.phone)}</p>
            <p className="font-mono text-[11px] text-zaka-mute">{shortAddr(wallet.address, 6, 4)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link to="/" aria-label="Log out" className="flex h-10 w-10 items-center justify-center rounded-full text-zaka-mute transition hover:bg-zaka-cream/5 hover:text-zaka-cream">
            <LogOut className="h-4 w-4" />
          </Link>
        </div>
      </header>
      <BalanceCard wallet={wallet} />
      {!wallet.balance && (
        <Link to="/claim" className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-zaka-gold/30 px-4 py-3 text-sm text-zaka-gold transition hover:bg-zaka-gold/5">
          Your wallet is empty — claim R100 or ask someone to send you ZAR
          <ChevronRight className="h-4 w-4 shrink-0" />
        </Link>
      )}
      <div className="mt-6 grid grid-cols-2 gap-3">
        {ACTIONS.map((a) => <ActionTile key={a.n} {...a} />)}
      </div>
      <div className="mt-auto pt-8 text-center">
        <Link to="/onboarding" className="font-mono text-[11px] uppercase tracking-[0.2em] text-zaka-teal hover:underline">
          Preview onboarding →
        </Link>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-zaka-mute">
          No fees · Also works on *384#
        </p>
      </div>
    </Step>
  );
}
```

---

## 10. Send flow components

### `src/components/zaka/send/SendRecipient.jsx`
```jsx
import { useState } from 'react';
import Step from '../Step';
import TopBar from '../TopBar';
import Title from '../Title';
import Field from '../Field';
import Btn from '../Btn';
import { normalizePhone, findWalletByPhone } from '@/lib/wallet';

export default function SendRecipient({ wallet, onNext }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = async (e) => {
    e.preventDefault();
    const phone = normalizePhone(value);
    if (!phone) return setError('Enter a valid SA number, e.g. 082 123 4567');
    if (phone === wallet.phone) return setError("You can't send money to yourself");
    setBusy(true);
    const r = await findWalletByPhone(phone);
    setBusy(false);
    if (!r) return setError('Recipient has not registered yet — ask them to dial *384# first');
    onNext(r);
  };

  return (
    <Step>
      <TopBar label="Send · 1 of 3" />
      <form onSubmit={next} className="flex flex-1 flex-col">
        <Title title="Enter recipient phone number" />
        <Field
          type="tel" inputMode="tel" autoFocus placeholder="082 123 4567"
          value={value} onChange={(e) => { setValue(e.target.value); setError(''); }}
          error={error} helper="They must have a ZAR Wallet to receive funds"
        />
        <Btn type="submit" className="mt-auto" disabled={busy || !value}>{busy ? 'Checking…' : 'Next'}</Btn>
      </form>
    </Step>
  );
}
```

### `src/components/zaka/send/SendAmount.jsx`
```jsx
import { useState } from 'react';
import Step from '../Step';
import TopBar from '../TopBar';
import Title from '../Title';
import Field from '../Field';
import Btn from '../Btn';
import { zar, formatPhone } from '@/lib/wallet';

export default function SendAmount({ wallet, recipient, onNext, onBack }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const next = (e) => {
    e.preventDefault();
    if (!/^\d+$/.test(value) || Number(value) <= 0) return setError('Enter a positive whole number');
    onNext(Number(value));
  };

  return (
    <Step>
      <TopBar label="Send · 2 of 3" onBack={onBack} />
      <form onSubmit={next} className="flex flex-1 flex-col">
        <Title title="Enter amount in ZAR (whole number)" sub={`To ${formatPhone(recipient.phone)}`} />
        <Field
          prefix="R" inputMode="numeric" autoFocus placeholder="25"
          value={value} onChange={(e) => { setValue(e.target.value.replace(/[^\d]/g, '')); setError(''); }}
          error={error} helper={`Available: ${zar(wallet.balance)}`}
        />
        <Btn type="submit" className="mt-auto" disabled={!value}>Next</Btn>
      </form>
    </Step>
  );
}
```

### `src/components/zaka/send/SendSummary.jsx`
```jsx
import { zar, formatPhone } from '@/lib/wallet';

export default function SendSummary({ amount, phone }) {
  return (
    <div className="rounded-2xl border border-zaka-line bg-zaka-panel p-4">
      <p className="text-lg text-zaka-cream">
        Send <span className="font-semibold">{zar(amount)}</span> to{' '}
        <span className="font-semibold">{formatPhone(phone)}</span>
      </p>
      <div className="mt-3 flex justify-between border-t border-zaka-line pt-3 text-sm">
        <span className="text-zaka-mute">Fees</span>
        <span className="text-zaka-teal">Free</span>
      </div>
    </div>
  );
}
```

---

## 11. Onboarding components

### `src/components/zaka/onboarding/Onboarding.jsx`
```jsx
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import WelcomeStep from './WelcomeStep';
import PhoneStep from './PhoneStep';
import CreatedStep from './CreatedStep';
import PinStep from '../PinStep';
import { createWallet, sendWelcomeBonus } from '@/lib/wallet';

export default function Onboarding({ onCreated, onDone }) {
  const [step, setStep] = useState('welcome');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [wallet, setWallet] = useState(null);

  const confirm = async (p) => {
    if (p !== pin) return 'PINs do not match — try again';
    const w = await createWallet(phone, p);
    onCreated();
    setWallet(w);
    setStep('done');
    sendWelcomeBonus(w);
  };

  return (
    <div className="flex flex-1 flex-col">
      <AnimatePresence mode="wait">
        {step === 'welcome' && <WelcomeStep key="w" onNext={() => setStep('phone')} />}
        {step === 'phone' && (
          <PhoneStep key="p" onBack={() => setStep('welcome')} onNext={(ph) => { setPhone(ph); setStep('create'); }} />
        )}
        {step === 'create' && (
          <PinStep
            key="c" eyebrow="Step 2 of 3" cta="Continue"
            title="Create a 4-digit PIN to secure your wallet"
            sub="Use 4 to 6 digits. You'll need it to approve payments."
            onBack={() => setStep('phone')}
            onSubmit={(p) => { setPin(p); setStep('confirm'); }}
          />
        )}
        {step === 'confirm' && (
          <PinStep key="cf" eyebrow="Step 3 of 3" cta="Create Wallet" title="Confirm your PIN" onBack={() => setStep('create')} onSubmit={confirm} />
        )}
        {step === 'done' && <CreatedStep key="d" wallet={wallet} onDone={onDone} />}
      </AnimatePresence>
    </div>
  );
}
```

### `src/components/zaka/onboarding/WelcomeStep.jsx`
```jsx
import Step from '../Step';
import Btn from '../Btn';
import Logo from '../Logo';
import ThemeToggle from '../ThemeToggle';

const FACTS = [
  ['R0', 'Fees'],
  ['R100', 'Free bonus'],
  ['*384#', 'Any phone'],
];

export default function WelcomeStep({ onNext }) {
  return (
    <Step>
      <div className="-mr-2 flex justify-end">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <Logo size={52} />
        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">Simple · Secure · ZAR</p>
        <h1 className="mt-4 font-display text-[46px] font-semibold leading-[1.02] tracking-tight">
          ZAR Smart
          <br />
          Wallet
        </h1>
        <p className="mt-5 max-w-[18rem] text-lg text-zaka-mute">No bank account needed. You only need this phone.</p>
        <div className="mt-12 grid grid-cols-3 gap-3 border-t border-zaka-line pt-6">
          {FACTS.map(([v, l]) => (
            <div key={l}>
              <p className="font-display text-xl text-zaka-gold">{v}</p>
              <p className="mt-1 text-xs text-zaka-mute">{l}</p>
            </div>
          ))}
        </div>
      </div>
      <Btn onClick={onNext}>Get Started</Btn>
    </Step>
  );
}
```

### `src/components/zaka/onboarding/PhoneStep.jsx`
```jsx
import { useState } from 'react';
import Step from '../Step';
import TopBar from '../TopBar';
import Title from '../Title';
import Field from '../Field';
import Btn from '../Btn';
import { normalizePhone, findWalletByPhone } from '@/lib/wallet';

export default function PhoneStep({ onNext, onBack }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = async (e) => {
    e.preventDefault();
    const phone = normalizePhone(value);
    if (!phone) return setError('Enter a valid SA number, e.g. 082 123 4567');
    setBusy(true);
    const existing = await findWalletByPhone(phone);
    setBusy(false);
    if (existing) return setError('This number already has a wallet');
    onNext(phone);
  };

  return (
    <Step>
      <TopBar label="Step 1 of 3" onBack={onBack} />
      <form onSubmit={next} className="flex flex-1 flex-col">
        <Title title="What's your phone number?" sub="People will send you money using this number." />
        <Field
          type="tel" inputMode="tel" autoFocus placeholder="082 123 4567"
          value={value} onChange={(e) => { setValue(e.target.value); setError(''); }}
          error={error} helper="South African numbers only"
        />
        <Btn type="submit" className="mt-auto" disabled={busy || !value}>
          {busy ? 'Checking…' : 'Continue'}
        </Btn>
      </form>
    </Step>
  );
}
```

### `src/components/zaka/onboarding/CreatedStep.jsx`
```jsx
import { Gift } from 'lucide-react';
import Result from '../Result';
import Btn from '../Btn';
import { shortAddr } from '@/lib/wallet';

export default function CreatedStep({ wallet, onDone }) {
  return (
    <Result title="Wallet Created!" actions={<Btn onClick={onDone}>Go to Dashboard</Btn>}>
      <div className="rounded-2xl border border-zaka-line bg-zaka-panel p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zaka-mute">Your wallet</p>
        <p className="mt-1 font-mono text-base text-zaka-cream">{shortAddr(wallet.address)}</p>
      </div>
      <div className="flex gap-3 rounded-2xl border border-zaka-gold/25 bg-zaka-gold/5 p-4">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-zaka-gold" />
        <div>
          <p className="text-zaka-cream">We are sending you a R100 welcome bonus.</p>
          <p className="mt-1 text-sm">Check your balance after a few seconds.</p>
        </div>
      </div>
    </Result>
  );
}
```

---

## 12. Pages

### `src/pages/Landing.jsx`
```jsx
import LandingNav from '@/components/landing/LandingNav';
import Hero from '@/components/landing/Hero';
import HowItWorks from '@/components/landing/HowItWorks';
import Features from '@/components/landing/Features';
import LandingFooter from '@/components/landing/LandingFooter';

export default function Landing() {
  return (
    <div className="min-h-screen bg-zaka-ink font-body text-zaka-cream">
      <LandingNav />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
      </main>
      <LandingFooter />
    </div>
  );
}
```

### `src/pages/WalletHome.jsx`
```jsx
import { useState } from 'react';
import useWallet from '@/hooks/useWallet';
import Loader from '@/components/zaka/Loader';
import Onboarding from '@/components/zaka/onboarding/Onboarding';
import Dashboard from '@/components/zaka/dashboard/Dashboard';
import { refreshWallet } from '@/lib/wallet';

export default function WalletHome() {
  const { data: wallet, isLoading } = useWallet();
  const [justCreated, setJustCreated] = useState(false);

  if (isLoading) return <Loader />;
  if (!wallet || justCreated) {
    return (
      <Onboarding
        onCreated={() => setJustCreated(true)}
        onDone={async () => { await refreshWallet(); setJustCreated(false); }}
      />
    );
  }
  return <Dashboard wallet={wallet} />;
}
```

### `src/pages/CheckBalance.jsx`
```jsx
import { useNavigate } from 'react-router-dom';
import RequireWallet from '@/components/zaka/RequireWallet';
import Step from '@/components/zaka/Step';
import TopBar from '@/components/zaka/TopBar';
import Btn from '@/components/zaka/Btn';
import { zar } from '@/lib/wallet';

export default function CheckBalance() {
  const navigate = useNavigate();
  return (
    <RequireWallet>
      {(wallet) => (
        <Step>
          <TopBar label="Balance" />
          <div className="flex flex-1 flex-col justify-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">Your balance</p>
            <p className="mt-4 flex items-baseline gap-3">
              <span className="font-mono text-sm text-zaka-mute">ZAR</span>
              <span className="font-display text-6xl font-semibold tracking-tight">{zar(wallet.balance)}</span>
            </p>
            <p className="mt-6 text-zaka-cream/90">Your wallet is ready to use.</p>
            <p className="mt-2 font-mono text-sm text-zaka-mute">{wallet.address.slice(0, 8)}...</p>
            {!wallet.balance && (
              <p className="mt-6 text-sm text-zaka-gold">Claim R100 demo funds or ask someone to send you ZAR.</p>
            )}
          </div>
          <Btn onClick={() => navigate('/app')}>Back to Menu</Btn>
        </Step>
      )}
    </RequireWallet>
  );
}
```

### `src/pages/SendMoney.jsx`
```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import RequireWallet from '@/components/zaka/RequireWallet';
import SendRecipient from '@/components/zaka/send/SendRecipient';
import SendAmount from '@/components/zaka/send/SendAmount';
import SendSummary from '@/components/zaka/send/SendSummary';
import PinStep from '@/components/zaka/PinStep';
import Processing from '@/components/zaka/Processing';
import Result from '@/components/zaka/Result';
import TxDetails from '@/components/zaka/TxDetails';
import Btn from '@/components/zaka/Btn';
import { verifyPin, sendMoney, zar, formatPhone } from '@/lib/wallet';

function SendFlow({ wallet }) {
  const navigate = useNavigate();
  const [step, setStep] = useState('recipient');
  const [to, setTo] = useState(null);
  const [amount, setAmount] = useState(0);
  const [hash, setHash] = useState('');
  const [err, setErr] = useState('');
  const menu = <Btn variant="ghost" onClick={() => navigate('/app')}>Back to Menu</Btn>;

  const confirm = async (pin) => {
    if (!(await verifyPin(wallet, pin))) return 'Incorrect PIN — transaction cancelled';
    if ((wallet.balance || 0) < amount) return `Insufficient balance — your balance is ${zar(wallet.balance)}, tried to send ${zar(amount)}`;
    setStep('processing');
    sendMoney(wallet, to, amount)
      .then((h) => { setHash(h); setStep('success'); })
      .catch((e) => { setErr(e.message); setStep('failed'); });
  };

  return (
    <div className="flex flex-1 flex-col">
      <AnimatePresence mode="wait">
        {step === 'recipient' && <SendRecipient key="r" wallet={wallet} onNext={(r) => { setTo(r); setStep('amount'); }} />}
        {step === 'amount' && <SendAmount key="a" wallet={wallet} recipient={to} onBack={() => setStep('recipient')} onNext={(a) => { setAmount(a); setStep('confirm'); }} />}
        {step === 'confirm' && (
          <PinStep key="c" eyebrow="Send · 3 of 3" title="Confirm payment" sub="Enter your 4-digit PIN to confirm" cta="Confirm & Send" onBack={() => setStep('amount')} onSubmit={confirm}>
            <SendSummary amount={amount} phone={to.phone} />
          </PinStep>
        )}
        {step === 'processing' && <Processing key="p" label="Sending your money" />}
        {step === 'success' && (
          <Result key="s" title="Sent!" actions={<Btn onClick={() => navigate('/app')}>Back to Menu</Btn>}>
            <p className="text-lg text-zaka-cream">{zar(amount)} sent to {formatPhone(to.phone)}</p>
            <TxDetails hash={hash} />
          </Result>
        )}
        {step === 'failed' && (
          <Result key="f" ok={false} title="Transaction Failed" actions={<><Btn onClick={() => setStep('confirm')}>Try Again</Btn>{menu}</>}>
            <p>{err || 'Something went wrong. No money was sent.'}</p>
          </Result>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SendMoney() {
  return <RequireWallet>{(wallet) => <SendFlow wallet={wallet} />}</RequireWallet>;
}
```

### `src/pages/ClaimFunds.jsx`
```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import RequireWallet from '@/components/zaka/RequireWallet';
import PinStep from '@/components/zaka/PinStep';
import Processing from '@/components/zaka/Processing';
import Result from '@/components/zaka/Result';
import TxDetails from '@/components/zaka/TxDetails';
import SponsoredNote from '@/components/zaka/SponsoredNote';
import Btn from '@/components/zaka/Btn';
import { verifyPin, claimFaucet } from '@/lib/wallet';

function ClaimFlow({ wallet }) {
  const navigate = useNavigate();
  const [step, setStep] = useState('confirm');
  const [hash, setHash] = useState('');

  const claim = async (pin) => {
    if (!(await verifyPin(wallet, pin))) return 'Incorrect PIN — try again';
    setStep('processing');
    claimFaucet(wallet)
      .then((h) => { setHash(h); setStep('success'); })
      .catch(() => setStep('failed'));
  };

  return (
    <div className="flex flex-1 flex-col">
      <AnimatePresence mode="wait">
        {step === 'confirm' && (
          <PinStep key="c" eyebrow="Demo funds" title="Claim your R100 demo funds" sub="Enter your 4-digit PIN to confirm" cta="Claim" onBack={() => navigate('/app')} onSubmit={claim}>
            <SponsoredNote text="Free — no fees" />
          </PinStep>
        )}
        {step === 'processing' && <Processing key="p" label="Claiming your R100" />}
        {step === 'success' && (
          <Result
            key="s" title="R100 ZAR Claimed!"
            actions={<><Btn onClick={() => navigate('/balance')}>Check Balance</Btn><Btn variant="ghost" onClick={() => navigate('/app')}>Back to Menu</Btn></>}
          >
            <TxDetails hash={hash} />
          </Result>
        )}
        {step === 'failed' && (
          <Result key="f" ok={false} title="Faucet claim failed" actions={<Btn onClick={() => setStep('confirm')}>Try Again</Btn>}>
            <p>Please try again.</p>
          </Result>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ClaimFunds() {
  return <RequireWallet>{(wallet) => <ClaimFlow wallet={wallet} />}</RequireWallet>;
}
```

### `src/pages/WalletAddress.jsx`
```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RequireWallet from '@/components/zaka/RequireWallet';
import Step from '@/components/zaka/Step';
import TopBar from '@/components/zaka/TopBar';
import Btn from '@/components/zaka/Btn';
import { formatPhone } from '@/lib/wallet';

function AddressView({ wallet }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const share = () =>
    navigator.share
      ? navigator.share({ title: 'My ZAR Wallet', text: `Send me ZAR: ${wallet.address} (or phone ${formatPhone(wallet.phone)})` }).catch(() => {})
      : copy();

  return (
    <Step>
      <TopBar label="Receive" />
      <div className="mx-auto rounded-[28px] bg-zaka-panel p-5 ring-1 ring-zaka-line">
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&color=1a1c1e&bgcolor=ffffff&data=${wallet.address}`}
          alt="QR code of your wallet address"
          className="h-48 w-48"
        />
      </div>
      <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">Wallet address</p>
      <p className="mt-2 break-all font-mono text-[15px] leading-relaxed">{wallet.address}</p>
      <p className="mt-4 text-sm text-zaka-mute">
        Share this address or your phone number ({formatPhone(wallet.phone)}) to receive ZAR.
      </p>
      <div className="mt-auto space-y-3 pt-8">
        <div className="grid grid-cols-2 gap-3">
          <Btn onClick={copy}>{copied ? 'Copied' : 'Copy Address'}</Btn>
          <Btn variant="ghost" onClick={share}>Share</Btn>
        </div>
        <Btn variant="ghost" onClick={() => navigate('/app')}>Back to Menu</Btn>
      </div>
    </Step>
  );
}

export default function WalletAddress() {
  return <RequireWallet>{(wallet) => <AddressView wallet={wallet} />}</RequireWallet>;
}
```

### `src/pages/Onboarding.jsx`
```jsx
import { useNavigate } from 'react-router-dom';
import Onboarding from '@/components/zaka/onboarding/Onboarding';

export default function OnboardingPage() {
  const navigate = useNavigate();
  return <Onboarding onCreated={() => {}} onDone={() => navigate('/app')} />;
}
```

### `src/pages/ExportPdf.jsx`
Renders every screen off-screen, captures each with html2canvas, compiles a multi-page A4 PDF with jsPDF, and downloads it.

```jsx
import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import WalletHome from '@/pages/WalletHome';
import CheckBalance from '@/pages/CheckBalance';
import SendMoney from '@/pages/SendMoney';
import ClaimFunds from '@/pages/ClaimFunds';
import WalletAddress from '@/pages/WalletAddress';
import OnboardingPage from '@/pages/Onboarding';
import Landing from '@/pages/Landing';

const PAGES = [
  { label: 'Landing', Comp: Landing },
  { label: 'Dashboard', Comp: WalletHome },
  { label: 'Check Balance', Comp: CheckBalance },
  { label: 'Send Money', Comp: SendMoney },
  { label: 'Claim Funds', Comp: ClaimFunds },
  { label: 'Wallet Address', Comp: WalletAddress },
  { label: 'Onboarding', Comp: OnboardingPage },
];

export default function ExportPdf() {
  const refs = useRef([]);
  const [status, setStatus] = useState('Preparing pages…');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 800));
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      for (let i = 0; i < PAGES.length; i++) {
        const node = refs.current[i];
        if (!node) continue;
        setStatus(`Capturing ${PAGES[i].label}…`);
        const canvas = await html2canvas(node, { backgroundColor: '#0f1112', scale: 1.5, useCORS: true });
        const img = canvas.toDataURL('image/jpeg', 0.85);
        const ratio = canvas.width / canvas.height;
        let w = pageW - 48, h = w / ratio;
        if (h > pageH - 96) { h = pageH - 96; w = h * ratio; }
        if (i > 0) pdf.addPage();
        pdf.setFontSize(11);
        pdf.setTextColor(120);
        pdf.text(PAGES[i].label, 24, 32);
        pdf.addImage(img, 'JPEG', (pageW - w) / 2, 48, w, h);
      }
      if (cancelled) return;
      setStatus('Saving…');
      pdf.save('zaka-pages.pdf');
      setDone(true);
      setStatus('Done — your PDF has downloaded.');
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-zaka-ink px-6 py-12 text-zaka-cream">
      <div className="mx-auto max-w-md text-center">
        <h1 className="font-heading text-2xl">Export all pages to PDF</h1>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-zaka-mute">{status}</p>
        {done && (
          <a href="/export" className="mt-6 inline-block rounded-2xl bg-zaka-teal px-5 py-3 font-medium text-zaka-ink">
            Re-run export
          </a>
        )}
      </div>
      <div className="fixed top-0 flex flex-col gap-8" style={{ left: -9999 }}>
        {PAGES.map((p, i) => (
          <div key={p.label} ref={(el) => (refs.current[i] = el)} className="h-[760px] w-[375px] overflow-hidden rounded-[28px] bg-zaka-ink">
            <p.Comp />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 13. Landing components

### `src/components/landing/LandingNav.jsx`
```jsx
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import Logo from '@/components/zaka/Logo';
import ThemeToggle from '@/components/zaka/ThemeToggle';

export default function LandingNav() {
  const { isAuthenticated } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-zaka-line/60 bg-zaka-ink/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2">
          <Logo size={26} />
          <span className="font-display text-lg font-semibold tracking-tight">ZAKA</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isAuthenticated ? (
            <Link to="/app" className="rounded-full bg-zaka-cream px-5 py-2.5 text-sm font-medium text-zaka-ink transition hover:opacity-90">
              Open wallet
            </Link>
          ) : (
            <>
              <Link to="/login?returnTo=/app" className="hidden rounded-full px-4 py-2.5 text-sm font-medium text-zaka-cream transition hover:bg-zaka-cream/5 sm:inline-block">
                Sign in
              </Link>
              <Link to="/register?returnTo=/app" className="rounded-full bg-zaka-cream px-5 py-2.5 text-sm font-medium text-zaka-ink transition hover:opacity-90">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
```

### `src/components/landing/Hero.jsx`
```jsx
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import Logo from '@/components/zaka/Logo';

const STATS = [
  ['R0', 'Fees'],
  ['R100', 'Welcome bonus'],
  ['*384#', 'Any phone'],
];

export default function Hero() {
  const { isAuthenticated } = useAuth();
  const primary = isAuthenticated
    ? { label: 'Open my wallet', to: '/app' }
    : { label: "Get started \u2014 it's free", to: '/register?returnTo=/app' };
  const secondary = isAuthenticated ? null : { label: 'I already have a wallet', to: '/login?returnTo=/app' };

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-zaka-teal/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">Simple · Secure · ZAR</p>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            Money on your phone. <br className="hidden sm:block" /> No bank account needed.
          </h1>
          <p className="mt-6 max-w-md text-lg text-zaka-mute">
            ZAKA is a Rand wallet that works on any phone. Send and receive money instantly — no fees, no apps to install, no bank account required.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to={primary.to} className="inline-flex h-14 items-center justify-center rounded-2xl bg-zaka-cream px-8 font-medium text-zaka-ink transition hover:opacity-90">
              {primary.label}
            </Link>
            {secondary && (
              <Link to={secondary.to} className="inline-flex h-14 items-center justify-center rounded-2xl border border-zaka-line px-8 font-medium text-zaka-cream transition hover:bg-zaka-cream/5">
                {secondary.label}
              </Link>
            )}
          </div>
          <div className="mt-12 grid max-w-md grid-cols-3 gap-4 border-t border-zaka-line pt-6">
            {STATS.map(([v, l]) => (
              <div key={l}>
                <p className="font-display text-xl text-zaka-gold">{v}</p>
                <p className="mt-1 text-xs text-zaka-mute">{l}</p>
              </div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[300px]"
        >
          <PhoneMock />
        </motion.div>
      </div>
    </section>
  );
}

function PhoneMock() {
  return (
    <div className="relative rounded-[2.2rem] border border-zaka-line bg-gradient-to-b from-zaka-panel to-zaka-ink p-5 shadow-2xl">
      <div className="flex items-center gap-2">
        <Logo size={22} />
        <span className="text-xs text-zaka-mute">072 123 4567</span>
      </div>
      <div className="mt-5 rounded-2xl bg-zaka-cream/5 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zaka-mute">Available balance</p>
        <p className="mt-2 font-display text-3xl font-semibold">R100.00</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-zaka-teal/15 px-2.5 py-1 text-[11px] text-zaka-teal">
          <span className="h-1.5 w-1.5 rounded-full bg-zaka-teal" /> Active
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {['Check balance', 'Send money', 'Claim funds', 'My address'].map((t) => (
          <div key={t} className="rounded-xl border border-zaka-line bg-zaka-panel/60 p-3 text-xs">{t}</div>
        ))}
      </div>
      <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-zaka-mute">No fees · *384#</p>
    </div>
  );
}
```

### `src/components/landing/HowItWorks.jsx`
```jsx
import { motion } from 'framer-motion';
import { Smartphone, Gift, ArrowUpRight, Phone } from 'lucide-react';

const STEPS = [
  { icon: Smartphone, title: 'Create your wallet', body: 'Sign up with your phone number and pick a 4-digit PIN. No paperwork, no bank account.' },
  { icon: Gift, title: 'Add money', body: 'Claim your R100 welcome bonus, or ask someone to send you Rands by your phone number.' },
  { icon: ArrowUpRight, title: 'Send & receive', body: 'Move money instantly to anyone with a ZAKA wallet. Just enter their phone number.' },
  { icon: Phone, title: 'Works on any phone', body: 'Use it here on the web, or dial *384# on any phone — even without internet.' },
];

export default function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">How it works</p>
      <h2 className="mt-4 max-w-xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Four simple steps. That's the whole wallet.
      </h2>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="rounded-3xl border border-zaka-line bg-zaka-panel/50 p-6"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zaka-teal/15 text-zaka-teal">
              <s.icon className="h-5 w-5" />
            </span>
            <p className="mt-5 font-mono text-xs text-zaka-mute">Step {i + 1}</p>
            <h3 className="mt-1 text-lg font-medium">{s.title}</h3>
            <p className="mt-2 text-sm text-zaka-mute">{s.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
```

### `src/components/landing/Features.jsx`
```jsx
import { motion } from 'framer-motion';
import { Wallet, Zap, ShieldCheck, Gift, Phone, ArrowUpRight } from 'lucide-react';

const ITEMS = [
  { icon: Wallet, title: 'No bank account', body: 'All you need is a phone number to open a wallet.' },
  { icon: Zap, title: 'Zero fees', body: 'Every payment is free — fees are covered for you.' },
  { icon: ShieldCheck, title: 'PIN-secured', body: 'Approve each payment with your own 4-digit PIN.' },
  { icon: ArrowUpRight, title: 'Instant transfers', body: 'Money arrives in seconds, any time of day.' },
  { icon: Gift, title: 'R100 welcome bonus', body: 'Start with R100 in your wallet to try it out.' },
  { icon: Phone, title: 'Works on any phone', body: 'Use the web or dial *384# — no smartphone needed.' },
];

export default function Features() {
  return (
    <section className="border-y border-zaka-line bg-zaka-panel/30">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">Why ZAKA</p>
        <h2 className="mt-4 max-w-xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Built for everyone, not just the banked.
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.05 }}
              className="rounded-3xl border border-zaka-line bg-zaka-ink p-6"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zaka-teal/15 text-zaka-teal">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-zaka-mute">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

### `src/components/landing/LandingFooter.jsx`
```jsx
import { Link } from 'react-router-dom';
import Logo from '@/components/zaka/Logo';

export default function LandingFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-col items-center justify-between gap-6 border-t border-zaka-line pt-8 sm:flex-row">
        <Link to="/" className="flex items-center gap-2">
          <Logo size={24} />
          <span className="font-display text-lg font-semibold tracking-tight">ZAKA</span>
        </Link>
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-zaka-mute">
          No fees · Also works on *384#
        </p>
        <p className="text-xs text-zaka-mute">© {new Date().getFullYear()} ZAKA</p>
      </div>
    </footer>
  );
}
```

---

## 14. Build & run

```bash
npm install
npm run dev      # start Vite dev server
npm run build    # production build to /dist
```

Open the dev server URL, then visit `/` (landing) and `/app` (wallet). Every wallet flow works with the mock data layer: send money (enter a phone like `0821234567`, any amount up to R100, any 4-digit PIN), claim R100, check balance, view/share address, and walk through `/onboarding`.

### Notes
- The landing nav links to `/login` and `/register` which don't exist in this standalone build (they belonged to the original auth system). Either create simple login/register pages or repoint those links to `/app` directly.
- `useWallet` uses `@tanstack/react-query`. If you'd rather not add it, replace the hook with a plain state return of `MOCK_WALLET`.
- Theme (light/dark) is toggled via the `<html class="dark">` class and the CSS variables in `index.css`; default is dark.