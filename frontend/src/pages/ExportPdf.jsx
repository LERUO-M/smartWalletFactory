import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import WalletHome from '@/pages/WalletHome';
import CheckBalance from '@/pages/CheckBalance';
import SendMoney from '@/pages/SendMoney';
import ClaimFunds from '@/pages/ClaimFunds';
import WalletAddress from '@/pages/WalletAddress';
import Verify from '@/pages/Verify';
import OnboardingPage from '@/pages/Onboarding';
import Landing from '@/pages/Landing';

const PAGES = [
  { label: 'Landing', Comp: Landing },
  { label: 'Dashboard', Comp: WalletHome },
  { label: 'Check Balance', Comp: CheckBalance },
  { label: 'Send Money', Comp: SendMoney },
  { label: 'Claim Funds', Comp: ClaimFunds },
  { label: 'Receive Money', Comp: WalletAddress },
  { label: 'Verify Identity', Comp: Verify },
  { label: 'Onboarding', Comp: OnboardingPage },
];

export default function ExportPdf() {
  const refs = useRef([]);
  const [status, setStatus] = useState('Preparing pages…');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 800));
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      for (let i = 0; i < PAGES.length; i++) {
        const node = refs.current[i];
        if (!node) continue;
        setStatus(`Capturing ${PAGES[i].label}…`);
        const canvas = await html2canvas(node, { backgroundColor: '#0f1112', scale: 1.5, useCORS: true });
        const img = canvas.toDataURL('image/jpeg', 0.85);
        const ratio = canvas.width / canvas.height;
        let w = pageW - 48, h = w / ratio;
        if (h > pageH - 96) { h = pageH - 96; w = h * ratio; }
        if (i > 0) pdf.addPage();
        pdf.setFontSize(11);
        pdf.setTextColor(120);
        pdf.text(PAGES[i].label, 24, 32);
        pdf.addImage(img, 'JPEG', (pageW - w) / 2, 48, w, h);
      }
      if (cancelled) return;
      setStatus('Saving…');
      pdf.save('zaka-pages.pdf');
      setDone(true);
      setStatus('Done — your PDF has downloaded.');
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-zaka-ink px-6 py-12 text-zaka-cream">
      <div className="mx-auto max-w-md text-center">
        <h1 className="font-heading text-2xl">Export all pages to PDF</h1>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-zaka-mute">{status}</p>
        {done && (
          <a href="/export" className="mt-6 inline-block rounded-2xl bg-zaka-teal px-5 py-3 font-medium text-zaka-ink">
            Re-run export
          </a>
        )}
      </div>
      <div className="fixed top-0 flex flex-col gap-8" style={{ left: -9999 }}>
        {PAGES.map((p, i) => (
          <div key={p.label} ref={(el) => (refs.current[i] = el)} className="h-[760px] w-[375px] overflow-hidden rounded-[28px] bg-zaka-ink">
            <p.Comp />
          </div>
        ))}
      </div>
    </div>
  );
}
