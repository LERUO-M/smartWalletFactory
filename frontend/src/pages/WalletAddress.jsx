import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RequireWallet from '@/components/zaka/RequireWallet';
import Step from '@/components/zaka/Step';
import TopBar from '@/components/zaka/TopBar';
import Btn from '@/components/zaka/Btn';
import { formatPhone, USSD_CODE } from '@/lib/wallet';

// "Receive money": people pay you with your phone number – that's all they need.
function ReceiveView({ wallet }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const local = formatPhone(wallet.phone);

  const copy = async () => {
    await navigator.clipboard.writeText(local.replace(/\s/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const message = `Send me money on ZAKA: ${local}. No app? Dial ${USSD_CODE} on any phone.`;
  const share = () =>
    navigator.share ? navigator.share({ title: 'Pay me on ZAKA', text: message }).catch(() => {}) : copy();

  return (
    <Step>
      <TopBar label="Receive" />
      <div className="mx-auto rounded-[28px] bg-zaka-panel p-5 ring-1 ring-zaka-line">
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&color=1a1c1e&bgcolor=ffffff&data=${encodeURIComponent(wallet.phone)}`}
          alt={`QR code for ${local}`}
          className="h-48 w-48"
        />
      </div>
      <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">Your number</p>
      <p className="mt-2 font-display text-4xl font-semibold tracking-tight">{local}</p>
      <p className="mt-4 text-zaka-mute">
        To get paid, share this number. The sender just types it in, on the web or by dialling {USSD_CODE}. You'll get an SMS when the money arrives.
      </p>
      <div className="mt-auto space-y-3 pt-8">
        <div className="grid grid-cols-2 gap-3">
          <Btn onClick={copy}>{copied ? 'Copied' : 'Copy number'}</Btn>
          <Btn variant="ghost" onClick={share}>Share</Btn>
        </div>
        <Btn variant="ghost" onClick={() => navigate('/app')}>Back to menu</Btn>
      </div>
    </Step>
  );
}

export default function WalletAddress() {
  return <RequireWallet>{(wallet) => <ReceiveView wallet={wallet} />}</RequireWallet>;
}
