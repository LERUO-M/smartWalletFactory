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
              <Link to="/login" className="hidden rounded-full px-4 py-2.5 text-sm font-medium text-zaka-cream transition hover:bg-zaka-cream/5 sm:inline-block">
                Sign in
              </Link>
              <Link to="/onboarding" className="rounded-full bg-zaka-cream px-5 py-2.5 text-sm font-medium text-zaka-ink transition hover:opacity-90">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
