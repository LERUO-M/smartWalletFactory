import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/zaka/ThemeProvider';
import { AuthProvider } from '@/lib/AuthContext';
import PhoneShell from '@/components/zaka/PhoneShell';
import Landing from '@/pages/Landing';
import WalletHome from '@/pages/WalletHome';
import CheckBalance from '@/pages/CheckBalance';
import SendMoney from '@/pages/SendMoney';
import ClaimFunds from '@/pages/ClaimFunds';
import WalletAddress from '@/pages/WalletAddress';
import OnboardingPage from '@/pages/Onboarding';
import ExportPdf from '@/pages/ExportPdf';

const queryClient = new QueryClient();

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/export" element={<ExportPdf />} />
              <Route element={<PhoneShell />}>
                <Route path="/app" element={<WalletHome />} />
                <Route path="/balance" element={<CheckBalance />} />
                <Route path="/send" element={<SendMoney />} />
                <Route path="/claim" element={<ClaimFunds />} />
                <Route path="/address" element={<WalletAddress />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
