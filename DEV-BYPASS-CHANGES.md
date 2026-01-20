# Local Development Bypass Changes

**Created:** January 20, 2026  
**Purpose:** Enable local development without Azure B2C authentication

---

## 🔄 Files Modified

### 1. **src/App.tsx**
- **Line ~70**: Added import for `LocalDevBypass`
  ```tsx
  import LocalDevBypass from "./pages/LocalDevBypass";
  ```
- **Line ~78**: Added new route `/dev-bypass` before root route
  ```tsx
  <Route path="/dev-bypass" element={<LocalDevBypass />} />
  ```
- **Line ~73**: Changed `/login` route from redirect to actual LoginPage component
  ```tsx
  <Route path="/login" element={<LoginPage />} />
  ```

### 2. **src/components/AuthProvider.tsx**
- **Line ~148**: Added dev bypass token detection at the start of useEffect
  ```tsx
  // Check for dev bypass token (localhost only)
  const token = localStorage.getItem('authToken');
  const isLocalhost = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     window.location.hostname === '';
  
  if (token === 'dev-bypass-token-local' && isLocalhost) {
    const cache = localStorage.getItem('authCache');
    if (cache) {
      try {
        const parsed = JSON.parse(cache);
        if (parsed.expiresAt > Date.now()) {
          console.log('🚀 Using dev bypass token - Admin access granted');
          setValidatedUser(parsed.user);
          setUserRole(parsed.role || 'admin');
          setIsAuthorized(true);
          setPhase('ready');
          setIsLoading(false);
          setAuthError(null);
          return;
        }
      } catch (e) {
        console.error('Error parsing authCache:', e);
      }
    }
  }
  ```

### 3. **src/components/DashboardPage.tsx**
- **Line ~15**: Added dev bypass token check to prevent redirect loop
  ```tsx
  useEffect(() => {
    // Don't redirect if we have dev bypass token
    const token = localStorage.getItem('authToken');
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname === '';
    
    if (token === 'dev-bypass-token-local' && isLocalhost) {
      console.log('🔓 Dev bypass detected, skipping redirect');
      return;
    }
    
    if (!isLoading && (!isAuthenticated || !isAuthorized)) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isAuthorized, isLoading, navigate]);
  ```

### 4. **backend/server.js**
- **Line ~230**: Modified `requireAuth` function to accept dev bypass token
  ```javascript
  // Allow dev bypass token in localhost/development
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  if (token === 'dev-bypass-token-local' && isLocalhost) {
    console.log('🚀 Dev bypass token accepted for localhost');
    req.user = { id: 'dev-admin', role: 'admin' };
    return next();
  }
  ```

- **Line ~247**: Modified `requireAdmin` function to accept dev bypass token
  ```javascript
  // Allow dev bypass token in localhost/development (grants admin access)
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  if (token === 'dev-bypass-token-local' && isLocalhost) {
    console.log('🚀 Dev bypass token accepted for admin access on localhost');
    req.user = { id: 'dev-admin', role: 'admin' };
    return next();
  }
  ```

---

## 📁 Files Created

### 5. **src/pages/LocalDevBypass.tsx** (NEW FILE)
- Complete new component for dev bypass page
- Sets localStorage items: `authToken` and `authCache`
- Redirects to `/dashboard` after setup
- Only works on localhost

---

## 🔐 How Dev Bypass Works

1. User visits `/dev-bypass`
2. Page checks if running on localhost
3. Sets `authToken: 'dev-bypass-token-local'` in localStorage
4. Sets `authCache` with admin role and user data
5. Reloads page to `/dashboard`
6. `AuthProvider` detects dev token → skips Azure B2C
7. `DashboardPage` detects dev token → allows access
8. Backend `requireAuth`/`requireAdmin` recognize dev token → grants permissions

---

## ⚠️ Revert Instructions

### Quick Revert (Delete bypass file + revert changes):

1. **Delete the new file:**
   ```bash
   rm src/pages/LocalDevBypass.tsx
   ```

2. **Revert App.tsx:**
   - Remove line: `import LocalDevBypass from "./pages/LocalDevBypass";`
   - Remove route: `<Route path="/dev-bypass" element={<LocalDevBypass />} />`
   - Change back: `<Route path="/login" element={<Navigate to="/" replace />} />`

3. **Revert AuthProvider.tsx:**
   - Remove the dev bypass token check block (lines ~148-172)
   - Start useEffect directly with the `console.log('AuthProvider state:', {` line

4. **Revert DashboardPage.tsx:**
   - Remove the dev bypass token check in useEffect
   - Simplify back to:
   ```tsx
   useEffect(() => {
     if (!isLoading && (!isAuthenticated || !isAuthorized)) {
       navigate('/login', { replace: true });
     }
   }, [isAuthenticated, isAuthorized, isLoading, navigate]);
   ```

5. **Revert backend/server.js:**
   - Remove dev bypass check from `requireAuth` (lines ~236-241)
   - Remove dev bypass check from `requireAdmin` (lines ~258-263)

6. **Clear localStorage:**
   ```javascript
   localStorage.removeItem('authToken');
   localStorage.removeItem('authCache');
   ```

### Or use Git:
```bash
git checkout src/App.tsx
git checkout src/components/AuthProvider.tsx
git checkout src/components/DashboardPage.tsx
git checkout backend/server.js
git clean -f src/pages/LocalDevBypass.tsx
```

---

## 🎯 Access URLs

- **Dev Bypass:** http://localhost:4200/dev-bypass
- **Normal Login:** http://localhost:4200/
- **Dashboard:** http://localhost:4200/dashboard

---

## 🔒 Security Notes

- ✅ Only works on localhost/127.0.0.1
- ✅ Backend validates hostname before accepting token
- ✅ Production environments unaffected
- ✅ Zero security risk in deployed environments
- ❌ Do NOT deploy these changes to production
- ❌ Do NOT commit to main branch without review

---

**Status:** ✅ Active  
**To Disable:** Delete this file and follow revert instructions above
