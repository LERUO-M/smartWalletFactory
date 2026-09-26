import Loader from './Loader';
import useWallet from '@/hooks/useWallet';

export default function RequireWallet({ children }) {
  const { data: wallet, isLoading } = useWallet();
  if (isLoading) return <Loader />;
  if (!wallet) return null;
  return children(wallet);
}
