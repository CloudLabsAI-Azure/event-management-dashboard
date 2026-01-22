import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LocalDevBypass() {
  const navigate = useNavigate();

  useEffect(() => {
    // Only work in localhost/development
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname === '';

    if (!isLocalhost) {
      console.log('Dev bypass only works on localhost, redirecting to login...');
      navigate('/login');
      return;
    }

    // Bypass authentication - set admin user
    const bypassAuth = () => {
      console.log('🚀 Local Dev Mode: Bypassing Azure B2C authentication');
      
      // Set a special dev bypass token
      localStorage.setItem('authToken', 'dev-bypass-token-local');
      
      // Set auth cache with admin role
      const authCache = {
        email: 'dev@localhost',
        isAuthorized: true,
        userRole: 'admin',
        role: 'admin',
        token: 'dev-bypass-token-local',
        user: {
          id: 'dev-admin',
          email: 'dev@localhost',
          name: 'Local Dev Admin',
          role: 'admin'
        },
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      };
      localStorage.setItem('authCache', JSON.stringify(authCache));

      console.log('✅ Dev bypass: Admin access granted');
      console.log('📍 Navigating to dashboard...');

      // Navigate to dashboard after a longer delay to ensure AuthProvider picks up changes
      setTimeout(() => {
        // Force page reload to ensure AuthProvider re-initializes with bypass token
        window.location.href = '/dashboard';
      }, 1000);
    };

    bypassAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg max-w-md w-full">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200">Local Dev Mode</h2>
          <p className="text-gray-500 dark:text-gray-400 text-center">Bypassing Azure B2C authentication...</p>
          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
              <span className="text-lg">✓</span>
              Admin access granted
            </p>
          </div>
          <div className="mt-2 text-xs text-gray-400 dark:text-gray-500 text-center">
            <p>This bypass only works on localhost</p>
            <p className="mt-1">Production environments will use Azure B2C</p>
          </div>
        </div>
      </div>
    </div>
  );
}
