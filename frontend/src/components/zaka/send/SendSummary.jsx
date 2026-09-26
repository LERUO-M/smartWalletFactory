import { zar, formatPhone } from '@/lib/wallet';

export default function SendSummary({ amount, phone }) {
  return (
    <div className="rounded-2xl border border-zaka-line bg-zaka-panel p-4">
      <p className="text-lg text-zaka-cream">
        Send <span className="font-semibold">{zar(amount)}</span> to{' '}
        <span className="font-semibold">{formatPhone(phone)}</span>
      </p>
      <div className="mt-3 flex justify-between border-t border-zaka-line pt-3 text-sm">
        <span className="text-zaka-mute">Transfer fee</span>
        <span className="text-zaka-teal">R0.00</span>
      </div>
    </div>
  );
}
