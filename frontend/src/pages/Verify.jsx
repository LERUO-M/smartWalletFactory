// ─────────────────────────────────────────────────────────────────────────────
// Identity verification (Level 1 KYC) – a MOCK of Smile ID's Biometric KYC.
//
// Flow: intro → SA ID number → selfie → checking → verified.
// The selfie never leaves the browser in this mock; the backend endpoint
// POST /api/kyc/me/smile-id validates the ID number and upgrades the account.
// A real integration would send the selfie + ID to Smile ID (via their web SDK)
// and upgrade the account from Smile ID's result callback instead.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { ScanFace, Contact, Camera, ShieldCheck, Check, Loader2 } from 'lucide-react';
import RequireWallet from '@/components/zaka/RequireWallet';
import Step from '@/components/zaka/Step';
import TopBar from '@/components/zaka/TopBar';
import Title from '@/components/zaka/Title';
import Field from '@/components/zaka/Field';
import Btn from '@/components/zaka/Btn';
import Result from '@/components/zaka/Result';
import { isValidSaId, isVerified, verifyIdentity, zarShort, wait } from '@/lib/wallet';

const MOCK_NOTE = 'Demo: identity check by Smile ID is simulated in this build';

function SmileFooter() {
  return (
    <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-zaka-mute">
      Identity check by Smile ID
    </p>
  );
}

function Intro({ onNext }) {
  const navigate = useNavigate();
  return (
    <Step>
      <TopBar label="Verify identity" onBack={() => navigate('/app')} />
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zaka-gold/15 text-zaka-gold">
        <ScanFace className="h-7 w-7" />
      </span>
      <Title title="Let's check it's really you" sub="The law requires us to verify who you are before you can send money. It takes about 2 minutes." />
      <ol className="space-y-4">
        {[
          [Contact, 'Enter your SA ID number', 'The 13 digits on your green ID book or smart ID card.'],
          [Camera, 'Take a selfie', "We match it to your ID photo. Find good light and remove hats or glasses."],
          [ShieldCheck, 'Start sending', 'Send up to R25 000 a day once you are verified.'],
        ].map(([Icon, t, b], i) => (
          <li key={t} className="flex gap-4 rounded-2xl border border-zaka-line bg-zaka-panel p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zaka-teal/15 text-zaka-teal"><Icon className="h-4 w-4" /></span>
            <span>
              <span className="block font-medium">{i + 1}. {t}</span>
              <span className="mt-0.5 block text-sm text-zaka-mute">{b}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-auto pt-8">
        <Btn onClick={onNext}>Start</Btn>
        <SmileFooter />
        <p className="mt-2 text-center text-[11px] text-zaka-mute">{MOCK_NOTE}</p>
      </div>
    </Step>
  );
}

function IdStep({ onNext, onBack }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const next = (e) => {
    e.preventDefault();
    if (!isValidSaId(value)) return setError('That ID number is not valid. Check the 13 digits and try again.');
    onNext(value.replace(/\s+/g, ''));
  };
  return (
    <Step>
      <TopBar label="Step 1 of 2" onBack={onBack} />
      <form onSubmit={next} className="flex flex-1 flex-col">
        <Title title="Your SA ID number" sub="We check it with the Department of Home Affairs. We never show your full ID number again." />
        <Field
          inputMode="numeric" autoFocus placeholder="9001015009086" maxLength={13}
          value={value}
          onChange={(e) => { setValue(e.target.value.replace(/\D/g, '').slice(0, 13)); setError(''); }}
          error={error} helper={`${value.length} of 13 digits`}
        />
        <Btn type="submit" className="mt-auto" disabled={value.length !== 13}>Continue</Btn>
      </form>
    </Step>
  );
}

function SelfieStep({ onNext, onBack }) {
  const videoRef = useRef(null);
  const [camera, setCamera] = useState('starting'); // starting | live | unavailable
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    let stream;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamera('live');
      } catch {
        setCamera('unavailable');
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    videoRef.current?.pause();
    setCaptured(true);
  };
  const retake = () => {
    videoRef.current?.play();
    setCaptured(false);
  };

  return (
    <Step>
      <TopBar label="Step 2 of 2" onBack={onBack} />
      <Title title="Take a selfie" sub="Look straight at the camera and keep your face inside the circle." />
      <div className="relative mx-auto h-64 w-64 overflow-hidden rounded-full border-4 border-zaka-line bg-zaka-panel">
        <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full scale-x-[-1] object-cover ${camera === 'live' ? '' : 'hidden'}`} />
        {camera !== 'live' && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zaka-mute">
            <ScanFace className="h-20 w-20" strokeWidth={1.2} />
            <span className="px-8 text-center text-xs">
              {camera === 'starting' ? 'Starting camera…' : 'No camera found. For this demo you can continue without one.'}
            </span>
          </div>
        )}
        {captured && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center bg-zaka-ink/40">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zaka-teal text-zaka-ink"><Check className="h-7 w-7" /></span>
          </motion.div>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-zaka-mute">Your selfie is only used to confirm your identity.</p>
      <div className="mt-auto space-y-3 pt-8">
        {captured || camera === 'unavailable' ? (
          <>
            <Btn onClick={onNext}>Use this and verify</Btn>
            {captured && <Btn variant="ghost" onClick={retake}>Retake</Btn>}
          </>
        ) : (
          <Btn onClick={capture} disabled={camera !== 'live'}>Take selfie</Btn>
        )}
      </div>
    </Step>
  );
}

const CHECKS = ['ID number found at Home Affairs', 'Selfie matches your ID photo', 'Live person confirmed'];

function Checking({ idNumber, onDone, onError }) {
  const [done, setDone] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const request = verifyIdentity(idNumber);
      for (let i = 1; i <= CHECKS.length; i++) {
        await wait(900);
        if (cancelled) return;
        setDone(i);
      }
      try {
        const status = await request;
        if (!cancelled) onDone(status);
      } catch (e) {
        if (!cancelled) onError(e);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Step className="justify-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zaka-teal">Checking</p>
      <h1 className="mt-3 font-display text-[30px] leading-[1.1] tracking-tight">Verifying your identity</h1>
      <ul className="mt-8 space-y-4">
        {CHECKS.map((c, i) => (
          <li key={c} className="flex items-center gap-3">
            {i < done ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zaka-teal text-zaka-ink"><Check className="h-4 w-4" /></span>
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-zaka-line text-zaka-mute">
                {i === done ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              </span>
            )}
            <span className={i < done ? 'text-zaka-cream' : 'text-zaka-mute'}>{c}</span>
          </li>
        ))}
      </ul>
      <SmileFooter />
    </Step>
  );
}

const ERRORS = {
  id_in_use: 'This ID number is already linked to another ZAKA account. Visit a ZAKA merchant for help.',
  invalid: 'That ID number is not valid. Check the 13 digits and try again.',
};

function VerifyFlow({ wallet }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(isVerified(wallet) ? 'already' : 'intro');
  const [idNumber, setIdNumber] = useState('');
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  return (
    <div className="flex flex-1 flex-col">
      <AnimatePresence mode="wait">
        {step === 'already' && (
          <Result key="al" title="You're already verified" actions={<Btn onClick={() => navigate('/app')}>Back to menu</Btn>}>
            <p>You can send up to {zarShort(wallet.kyc?.limits?.dailyCents)} a day.</p>
          </Result>
        )}
        {step === 'intro' && <Intro key="i" onNext={() => setStep('id')} />}
        {step === 'id' && <IdStep key="id" onBack={() => setStep('intro')} onNext={(id) => { setIdNumber(id); setStep('selfie'); }} />}
        {step === 'selfie' && <SelfieStep key="s" onBack={() => setStep('id')} onNext={() => setStep('checking')} />}
        {step === 'checking' && (
          <Checking
            key="c"
            idNumber={idNumber}
            onDone={(s) => { setStatus(s); queryClient.invalidateQueries({ queryKey: ['wallet'] }); setStep('done'); }}
            onError={(e) => { setError(ERRORS[e.message] || e.message || 'Verification failed. Please try again.'); setStep('failed'); }}
          />
        )}
        {step === 'done' && (
          <Result key="d" title="You're verified" actions={<Btn onClick={() => navigate('/send')}>Send money</Btn>}>
            <p>Thanks! You can now send up to {zarShort(status?.limits?.dailyCents)} a day and {zarShort(status?.limits?.monthlyCents)} a month.</p>
            <p className="text-sm">We've also sent you an SMS to confirm.</p>
          </Result>
        )}
        {step === 'failed' && (
          <Result key="f" ok={false} title="We couldn't verify you" actions={<><Btn onClick={() => setStep('id')}>Try again</Btn><Btn variant="ghost" onClick={() => navigate('/app')}>Back to menu</Btn></>}>
            <p>{error}</p>
          </Result>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Verify() {
  return <RequireWallet>{(wallet) => <VerifyFlow wallet={wallet} />}</RequireWallet>;
}
