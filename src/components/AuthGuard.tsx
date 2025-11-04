import { useMsal } from "@azure/msal-react";
import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Shield, User, AlertCircle } from "lucide-react";
import { loginRequest, msalConfig } from "../lib/msalConfig";
import { useAuth } from "./AuthProvider";

interface AuthGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { instance, accounts, inProgress } = useMsal();
  const { isAuthenticated, isLoading, isAuthorized, authError } = useAuth();

  const handleLogin = () => {
    // Use MSAL's loginRedirect which handles PKCE automatically
    instance.loginRedirect({
      ...loginRequest,
      redirectUri: msalConfig.auth.redirectUri || window.location.origin,
    }).catch(e => {
      console.error('Login error:', e);
    });
  };

  // Show loading state during authentication or user validation
  if (inProgress === "login" || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-slate-600 dark:text-slate-400">
              {inProgress === "login" ? "Authenticating..." : "Validating user..."}
            </span>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show authorization error if user is authenticated but not authorized
  if (accounts.length > 0 && !isAuthorized && authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950">
        <Card className="w-full max-w-md shadow-xl border-red-200">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-red-800 dark:text-red-300">
              Access Denied
            </CardTitle>
            <CardDescription className="text-red-600 dark:text-red-400">
              {authError}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-center text-slate-600 dark:text-slate-400">
              Please contact your administrator to get access to this portal.
            </p>
            <Button 
              onClick={() => instance.logoutRedirect()} 
              className="w-full" 
              variant="outline"
            >
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">
              MS Innovation Event Management Dashboard
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">
              Please sign in to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleLogin} className="w-full" size="lg">
              <User className="w-4 h-4 mr-2" />
              Login or Sign Up
            </Button>
            <div className="text-xs text-center text-slate-500 dark:text-slate-400 mt-4">
              <p>Secure authentication powered by Microsoft Azure</p>
              <details className="mt-2">
                <summary className="cursor-pointer">Debug Info</summary>
                <div className="text-left text-xs mt-2 p-2 bg-slate-100 dark:bg-slate-800 rounded">
                  <p>Accounts: {accounts.length}</p>
                  <p>In Progress: {inProgress}</p>
                  <p>Authenticated: {isAuthenticated ? 'Yes' : 'No'}</p>
                  <p>Authorized: {isAuthorized ? 'Yes' : 'No'}</p>
                  <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
                  {authError && <p className="text-red-500">Error: {authError}</p>}
                </div>
              </details>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User is authenticated, show the protected content
  return <>{children}</>;
}