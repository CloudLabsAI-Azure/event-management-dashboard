import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../lib/msalConfig";
import { Button } from "./ui/button";
import { LogOut, User } from "lucide-react";

export function AuthButtons() {
  const { instance, accounts, inProgress } = useMsal();
  
  const handleLogin = () => {
    instance.loginRedirect({
      ...loginRequest,
      redirectUri: window.location.origin,
    }).catch(e => {
      console.error('Login error:', e);
    });
  };

  const handleLogout = () => {
    instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  if (inProgress === "login") {
    return (
      <Button disabled variant="outline" size="sm">
        Signing in...
      </Button>
    );
  }

  if (accounts.length > 0) {
    const account = accounts[0];
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600 dark:text-slate-400">
          Welcome, {account.name || account.username}
        </span>
        <Button onClick={handleLogout} variant="outline" size="sm">
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={handleLogin} variant="default" size="sm">
      <User className="w-4 h-4 mr-2" />
      Sign In
    </Button>
  );
}