import { useNavigate } from 'react-router-dom';
import Onboarding from '@/components/zaka/onboarding/Onboarding';

export default function OnboardingPage() {
  const navigate = useNavigate();
  return <Onboarding onCreated={() => {}} onDone={() => navigate('/app')} />;
}
