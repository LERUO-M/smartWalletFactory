import { Link, useNavigate } from 'react-router-dom';
import { Wallet, ArrowUpRight, Gift, QrCode, LogOut, ChevronRight } from 'lucide-react';
import Step from '../Step';
import Logo from '../Logo';
import BalanceCard from './BalanceCard';
import ActionTile from './ActionTile';
import ThemeToggle from '../ThemeToggle';
import { formatPhone, shortAddr } from '@/lib/wallet';
import { useAuth } from '@/lib/AuthContext';

const ACTIONS = [
  { n: '01', icon: Wallet, label: 'Check Balance', sub: 'See what you have', to: '/balance' },
  { n: '02', icon: ArrowUpRight, label: 'Send Money', sub: 'Free & instant', to: '/send' },
  { n: '03', icon: Gift, label: 'Claim R100 Demo Funds', sub: 'Top up to try it', to: '/claim' },
  { n: '04', icon: QrCode, label: 'My Wallet Address', sub: 'Receive ZAR', to: '/address' },
];

export default function Dashboard({ wallet }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };
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
          <button type="button" onClick={handleLogout} aria-label="Log out" className="flex h-10 w-10 items-center justify-center rounded-full text-zaka-mute transition hover:bg-zaka-cream/5 hover:text-zaka-cream">
            <LogOut className="h-4 w-4" />
          </button>
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
