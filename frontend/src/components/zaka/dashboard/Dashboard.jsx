import { Link, useNavigate } from 'react-router-dom';
import { Wallet, ArrowUpRight, Gift, QrCode, LogOut, ChevronRight, BadgeCheck } from 'lucide-react';
import Step from '../Step';
import Logo from '../Logo';
import BalanceCard from './BalanceCard';
import ActionTile from './ActionTile';
import ThemeToggle from '../ThemeToggle';
import SmileIdCard from '../kyc/SmileIdCard';
import { formatPhone, isVerified, USSD_CODE } from '@/lib/wallet';
import { useAuth } from '@/lib/AuthContext';

const ACTIONS = [
  { n: '01', icon: Wallet, label: 'Balance', sub: 'What you have and your limits', to: '/balance' },
  { n: '02', icon: ArrowUpRight, label: 'Send money', sub: 'R0 transfer fee', to: '/send' },
  { n: '03', icon: Gift, label: 'Get R100 demo money', sub: 'Top up to try it out', to: '/claim' },
  { n: '04', icon: QrCode, label: 'Receive money', sub: 'Share your number', to: '/receive' },
];

export default function Dashboard({ wallet }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const verified = isVerified(wallet);
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
            <p className="flex items-center gap-1 text-[11px] text-zaka-mute">
              {verified ? (
                <><BadgeCheck className="h-3.5 w-3.5 text-zaka-teal" /> Verified</>
              ) : (
                'Not verified yet'
              )}
            </p>
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
      {!verified && <SmileIdCard compact className="mt-3" />}
      {verified && !wallet.balance && (
        <Link to="/claim" className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-zaka-gold/30 px-4 py-3 text-sm text-zaka-gold transition hover:bg-zaka-gold/5">
          Your balance is R0. Get R100 demo money, or ask someone to send you some.
          <ChevronRight className="h-4 w-4 shrink-0" />
        </Link>
      )}
      <div className="mt-6 grid grid-cols-2 gap-3">
        {ACTIONS.map((a) => <ActionTile key={a.n} {...a} />)}
      </div>
      <p className="mt-auto pt-8 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-zaka-mute">
        Free transfers · No smartphone? Dial {USSD_CODE}
      </p>
    </Step>
  );
}
