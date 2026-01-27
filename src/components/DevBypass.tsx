import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function DevBypass() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  useEffect(() => {
    const devBypass = searchParams.get('devBypass');
    
    if (devBypass === 'admin' || devBypass === 'user') {
      const role = devBypass;
      const token = devBypass === 'admin' ? 'dev-bypass-admin' : 'dev-bypass-user';
      
      // Set auth in localStorage
      localStorage.setItem('authToken', token);
      localStorage.setItem('userRole', role);
      
      console.log('🚀 Dev bypass:', role);
      
      // Redirect to dashboard
      navigate('/dashboard', { replace: true });
    } else {
      // No valid bypass, go to login
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate]);
  
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
