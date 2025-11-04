import { useAuth } from "./AuthProvider";
import { useMsal } from "@azure/msal-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { AlertCircle } from "lucide-react";
import { Outlet } from "react-router-dom";

export function DashboardPage() {
  const { isAuthenticated, isAuthorized, isLoading, authError } = useAuth();
  const { instance } = useMsal();
  const navigate = useNavigate();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAuthorized)) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, isAuthorized, isLoading, navigate]);

  // Show loading state during authentication or user validation
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-slate-600 dark:text-slate-400">
              Validating user...
            </span>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show authorization error if user is authenticated but not authorized
  if (isAuthenticated && !isAuthorized && authError) {
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

  // User is authenticated and authorized, show the dashboard
  return <Outlet />;
}