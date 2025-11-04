import { useAuth } from "./AuthProvider";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { AccessDenied } from "./AccessDenied";
import { Shield } from "lucide-react";
import { loginRequest } from "../lib/msalConfig";

export function RootRedirect() {
  const { isAuthenticated, isAuthorized, isLoading, msalAuthenticated, phase, authError } = useAuth();
  const { instance, inProgress, accounts } = useMsal();
  const navigate = useNavigate();

  const handleLogin = () => {
    instance.loginRedirect({
      ...loginRequest,
      redirectUri: window.location.origin,
    }).catch(e => console.error('Login error:', e));
  };

  useEffect(() => {
    if (isAuthenticated && isAuthorized) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isAuthorized, navigate]);

  // Detect if we are returning from an MSAL redirect (hash params) to avoid showing login prematurely
  const processingRedirect = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const h = window.location.hash || '';
    return /(code=|id_token=|error=)/i.test(h) && inProgress !== 'none';
  }, [inProgress]);

  const handleLogout = () => {
    instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin }).catch(e => console.error('Logout error:', e));
  };

  // If user is authenticated but not authorized, show access denied
  if (msalAuthenticated && !isAuthorized && !isLoading && authError && authError.toLowerCase().includes('not found')) {
    return (
      <AccessDenied 
        email={accounts[0]?.username}
        reason={authError}
        allowSwitch
      />
    );
  }

  // Show loading during authentication process
  if (processingRedirect || inProgress === "login" || phase === 'msal') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-slate-600 dark:text-slate-400">Signing you in...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === 'validating-backend') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-slate-600 dark:text-slate-400">Validating access...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show login form if not authenticated or still loading
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50 to-blue-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      {/* Decorative radial gradients */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-indigo-300/40 via-purple-300/30 to-transparent dark:from-indigo-800/30 dark:via-fuchsia-700/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-blue-300/30 via-cyan-200/20 to-transparent dark:from-blue-800/30 dark:via-cyan-700/20 blur-3xl" />
      <Card className="w-full max-w-md shadow-2xl relative z-10 border border-white/50 dark:border-white/10 bg-white/65 dark:bg-slate-900/55 backdrop-blur-xl supports-[backdrop-filter]:bg-white/55 dark:supports-[backdrop-filter]:bg-slate-900/50">
        <CardHeader className="text-center space-y-1">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            MS Innovation Event Management Portal
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            Please login or signup to continue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(isLoading || processingRedirect) ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-slate-600 dark:text-slate-400">Loading...</span>
            </div>
          ) : (
            <Button
              onClick={handleLogin}
              className="w-full"
              disabled={inProgress !== "none"}
            >
              Login or Signup
            </Button>
          )}
          {authError && !msalAuthenticated && (
            <p className="text-xs text-red-500 text-center mt-2">{authError}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}