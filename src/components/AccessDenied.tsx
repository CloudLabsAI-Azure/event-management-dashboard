import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import { loginRequest } from '@/lib/msalConfig';

interface AccessDeniedProps {
  email?: string;
  reason?: string;
  allowSwitch?: boolean;
}

export function AccessDenied({ email, reason, allowSwitch = true }: AccessDeniedProps) {
  const { instance } = useMsal();
  const navigate = useNavigate();

  const handleLogout = () => {
    instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });
  };

  const handleSwitch = () => {
    instance.loginRedirect({ ...loginRequest, redirectUri: window.location.origin }).catch(console.error);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-slate-50 to-rose-50 dark:from-zinc-900 dark:via-zinc-900 dark:to-red-950 p-4">
      <Card className="w-full max-w-lg shadow-2xl border-red-200/40 dark:border-red-900/40 backdrop-blur-sm bg-white/90 dark:bg-zinc-900/80">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shadow-inner">
            <ShieldAlert className="w-10 h-10 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-red-800 dark:text-red-300">Access Denied</CardTitle>
          <CardDescription className="text-sm leading-relaxed text-red-600 dark:text-red-400">
            {reason || 'You are not authorized to access this portal.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {email && (
            <div className="text-center text-xs text-muted-foreground">
              Attempted as <span className="font-medium text-foreground">{email}</span>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" onClick={handleLogout} className="min-w-[140px]">Logout</Button>
            {allowSwitch && (
              <Button onClick={handleSwitch} className="min-w-[180px]">Sign in with different account</Button>
            )}
          </div>
          <div className="pt-4 border-t border-border/60 text-center text-[11px] text-muted-foreground">
            If you believe this is a mistake, contact your administrator to be added to the authorized users list.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
