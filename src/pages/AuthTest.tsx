import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useAuth } from "../components/AuthProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Shield, User, Mail, Clock, CheckCircle } from "lucide-react";

export default function AuthTest() {
  const { instance, accounts, inProgress } = useMsal();
  const { user, userRole, isAuthenticated, isLoading } = useAuth();
  const [tokenInfo, setTokenInfo] = useState<any>(null);

  useEffect(() => {
    const getTokenInfo = async () => {
      if (accounts.length > 0) {
        try {
          const response = await instance.acquireTokenSilent({
            scopes: ["openid", "profile", "email"],
            account: accounts[0],
          });
          setTokenInfo(response);
        } catch (error) {
          console.error("Failed to acquire token:", error);
        }
      }
    };

    if (accounts.length > 0 && inProgress === "none") {
      getTokenInfo();
    }
  }, [accounts, instance, inProgress]);

  if (isLoading || inProgress === "login") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Azure B2C Authentication Test
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Testing the integration with CloudLabs QA AI B2C tenant
          </p>
        </div>

        {/* Authentication Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Authentication Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="font-medium">Status:</span>
              <Badge variant={isAuthenticated ? "default" : "secondary"}>
                {isAuthenticated ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Authenticated
                  </>
                ) : (
                  "Not Authenticated"
                )}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="font-medium">Progress:</span>
              <Badge variant="outline">{inProgress || "none"}</Badge>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-medium">Accounts Found:</span>
              <Badge variant="outline">{accounts.length}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* User Information */}
        {isAuthenticated && user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                User Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="font-medium text-slate-600 dark:text-slate-400">Name:</span>
                  <p className="text-slate-900 dark:text-white">{user.name || "N/A"}</p>
                </div>
                
                <div>
                  <span className="font-medium text-slate-600 dark:text-slate-400">Username:</span>
                  <p className="text-slate-900 dark:text-white">{user.username || "N/A"}</p>
                </div>
                
                <div>
                  <span className="font-medium text-slate-600 dark:text-slate-400">Role:</span>
                  <Badge variant={userRole === 'admin' ? 'default' : 'secondary'}>
                    {userRole}
                  </Badge>
                </div>
                
                <div>
                  <span className="font-medium text-slate-600 dark:text-slate-400">Home Account ID:</span>
                  <p className="text-slate-900 dark:text-white text-sm font-mono">
                    {user.homeAccountId || "N/A"}
                  </p>
                </div>
              </div>

              <div>
                <span className="font-medium text-slate-600 dark:text-slate-400">Local Account ID:</span>
                <p className="text-slate-900 dark:text-white text-sm font-mono break-all">
                  {user.localAccountId || "N/A"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Token Information */}
        {tokenInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Token Information
              </CardTitle>
              <CardDescription>
                Current access token details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="font-medium text-slate-600 dark:text-slate-400">Token Type:</span>
                  <p className="text-slate-900 dark:text-white">{tokenInfo.tokenType}</p>
                </div>
                
                <div>
                  <span className="font-medium text-slate-600 dark:text-slate-400">Expires On:</span>
                  <p className="text-slate-900 dark:text-white">
                    {new Date(tokenInfo.expiresOn).toLocaleString()}
                  </p>
                </div>
                
                <div>
                  <span className="font-medium text-slate-600 dark:text-slate-400">Scopes:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tokenInfo.scopes?.map((scope: string) => (
                      <Badge key={scope} variant="outline" className="text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div>
                  <span className="font-medium text-slate-600 dark:text-slate-400">Authority:</span>
                  <p className="text-slate-900 dark:text-white text-sm break-all">
                    {tokenInfo.authority}
                  </p>
                </div>
              </div>

              <div>
                <span className="font-medium text-slate-600 dark:text-slate-400">Access Token (first 50 chars):</span>
                <p className="text-slate-900 dark:text-white text-sm font-mono bg-slate-100 dark:bg-slate-800 p-2 rounded border">
                  {tokenInfo.accessToken?.substring(0, 50)}...
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Test Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Test Actions</CardTitle>
            <CardDescription>
              Test various authentication flows and API calls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => instance.loginRedirect()}
                variant="default"
                disabled={isAuthenticated}
              >
                Login Redirect
              </Button>
              
              <Button
                onClick={() => instance.logoutRedirect()}
                variant="outline"
                disabled={!isAuthenticated}
              >
                Logout
              </Button>
              
              <Button
                onClick={() => window.location.reload()}
                variant="secondary"
              >
                Refresh Page
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Configuration Info */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              Current Azure B2C configuration details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Tenant:</span> cloudlabsqaai.onmicrosoft.com
            </div>
            <div>
              <span className="font-medium">Client ID:</span> e76ca0fd-0545-4b4f-ba26-aa96f8999f4a
            </div>
            <div>
              <span className="font-medium">Policy:</span> B2C_1A_signup_signin_linkedin
            </div>
            <div>
              <span className="font-medium">Directory ID:</span> dd1da7a2-61b9-44ff-9c68-5fae266bd396
            </div>
            <div>
              <span className="font-medium">Current Origin:</span> {window.location.origin}
            </div>
            <div>
              <span className="font-medium">Current URL:</span> {window.location.href}
            </div>
            <div>
              <span className="font-medium">Redirect URI:</span> {window.location.origin}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}