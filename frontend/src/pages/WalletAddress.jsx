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
