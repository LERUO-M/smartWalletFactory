import { Link } from 'react-router-dom';
import { ScanFace, ChevronRight, Contact, Camera, ShieldCheck } from 'lucide-react';

/**
 * "Verify your identity" card. Used on the dashboard and in front of any
 * flow that moves money. Identity checks are provided by Smile ID
 * (mocked in this build).
 */
export default function SmileIdCard({ compact = false, className = '' }) {
  if (compact) {
    return (
      <Link
        to="/verify"
        className={`flex items-center gap-3 rounded-2xl border border-zaka-gold/30 bg-zaka-gold/5 px-4 py-3 text-sm transition hover:bg-zaka-gold/10 ${className}`}
      >
        <ScanFace className="h-5 w-5 shrink-0 text-zaka-gold" />
        <span className="flex-1">
          <span className="block font-medium text-zaka-cream">Verify your identity to send money</span>
          <span className="block text-xs text-zaka-mute">About 2 minutes · ID number and a selfie</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-zaka-gold" />
      </Link>
    );
  }

  return (
    <div className={`rounded-[28px] border border-zaka-line bg-zaka-panel p-6 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zaka-gold/15 text-zaka-gold">
          <ScanFace className="h-6 w-6" />
        </span>
        <div>
          <p className="font-medium">Verify your identity</p>
          <p className="text-xs text-zaka-mute">Needed before you can send money</p>
        </div>
      </div>
      <ul className="mt-5 space-y-3 text-sm">
        <li className="flex items-center gap-3"><Contact className="h-4 w-4 text-zaka-teal" /> Your 13-digit SA ID number</li>
        <li className="flex items-center gap-3"><Camera className="h-4 w-4 text-zaka-teal" /> A quick selfie to match your ID photo</li>
        <li className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-zaka-teal" /> Unlocks sending up to R25 000 a day</li>
      </ul>
      <Link
        to="/verify"
        className="mt-6 flex h-12 items-center justify-center rounded-2xl bg-zaka-cream font-medium text-zaka-ink transition hover:opacity-90"
      >
        Start verification
      </Link>
      <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-zaka-mute">
        Identity check by Smile ID
      </p>
    </div>
  );
}
