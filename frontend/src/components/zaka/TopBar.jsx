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
