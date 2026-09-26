import { Navigate } from 'react-router-dom';
import Loader from './Loader';
import useWallet from '@/hooks/useWallet';
import { useAuth } from '@/lib/AuthContext';

export default function RequireWallet({ children }) {
  const { isAuthenticated } = useAuth();
  const { data: wallet, isLoading } = useWallet();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isLoading && !wallet) return <Loader />;
  if (!wallet) return <Loader />;
  return children(wallet);
}
