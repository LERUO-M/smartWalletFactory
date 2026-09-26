import LandingNav from '@/components/landing/LandingNav';
import Hero from '@/components/landing/Hero';
import HowItWorks from '@/components/landing/HowItWorks';
import Features from '@/components/landing/Features';
import LandingFooter from '@/components/landing/LandingFooter';

export default function Landing() {
  return (
    <div className="min-h-screen bg-zaka-ink font-body text-zaka-cream">
      <LandingNav />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
      </main>
      <LandingFooter />
    </div>
  );
}
