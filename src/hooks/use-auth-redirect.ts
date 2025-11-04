import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';

export const useAuthRedirect = () => {
  const { isAuthenticated, isAuthorized, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Don't redirect while loading
    if (isLoading) {
      return;
    }

    // If user is authenticated and authorized, go to dashboard
    if (isAuthenticated && isAuthorized) {
      console.log('useAuthRedirect: User authenticated and authorized - redirecting to dashboard');
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isAuthorized, isLoading, navigate]);

  return { isAuthenticated, isAuthorized, isLoading };
};