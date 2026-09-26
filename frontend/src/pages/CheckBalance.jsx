import { useNavigate } from 'react-router-dom';
import RequireWallet from '@/components/zaka/RequireWallet';
import Step from '@/components/zaka/Step';
import TopBar from '@/components/zaka/TopBar';
import Btn from '@/components/zaka/Btn';
import StatusBadge from '@/components/zaka/StatusBadge';
import SmileIdCard from '@/components/zaka/kyc/SmileIdCard';
import { zar, zarShort, isVerified } from '@/lib/wallet';

function LimitBar({ label, used, limit }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-zaka-mute">{label}</span>
        <span>
          {zar(used / 100)} <span className="text-zaka-mute">of {zarShort(limit)}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zaka-line" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${pct >= 90 ? 'bg-zaka-gold' : 'bg-zaka-teal'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CheckBalance() {
  const navigate = useNavigate();
  return (
    <RequireWallet>
      {(wallet) => (
        <Step>
          <TopBar label="Balance" />
          <div className="flex flex-1 flex-col justify-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">Your balance</p>
            <p className="mt-4 font-display text-6xl font-semibold tracking-tight">{zar(wallet.balance)}</p>
            <div className="mt-4"><StatusBadge wallet={wallet} /></div>
            {!wallet.balance && (
              <p className="mt-6 text-sm text-zaka-gold">Get R100 demo money, or ask someone to send you some.</p>
            )}
            {isVerified(wallet) && wallet.kyc ? (
              <div className="mt-10 space-y-4 rounded-2xl border border-zaka-line bg-zaka-panel p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zaka-mute">What you can send</p>
                <LimitBar label="Today" used={wallet.kyc.used.todayCents} limit={wallet.kyc.limits.dailyCents} />
                <LimitBar label="This month" used={wallet.kyc.used.monthCents} limit={wallet.kyc.limits.monthlyCents} />
              </div>
            ) : (
              <SmileIdCard className="mt-10" />
            )}
          </div>
          <Btn className="mt-6" onClick={() => navigate('/app')}>Back to menu</Btn>
        </Step>
      )}
    </RequireWallet>
  );
}
