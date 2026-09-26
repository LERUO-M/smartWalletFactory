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
