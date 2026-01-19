# Local Testing Guide

## Quick Start

Run the test script:
```bash
test-local.bat
```

This will start both the backend and frontend servers.

## Manual Start

### 1. Start Backend Server
```bash
npm run start
```
Backend will run on: `http://localhost:4000`

### 2. Start Frontend Dev Server
```bash
npm run dev
```
Frontend will run on: `http://localhost:5173`

## Bypass SSO for Local Testing

### Option 1: Use Simple Login Page
1. Navigate to: `http://localhost:5173/login`
2. Login with:
   - **Email**: `admin@events.com`
   - **Password**: `password`

### Option 2: Set Token Manually in Console
Open browser DevTools console and run:
```javascript
// Login via API
fetch('http://localhost:4000/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    email: 'admin@events.com', 
    password: 'password' 
  })
})
.then(r => r.json())
.then(data => {
  localStorage.setItem('dashboard_token', data.token);
  localStorage.setItem('dashboard_role', data.role);
  window.location.href = '/';
});
```

## Testing the Fix

1. After logging in, go to the Dashboard (home page)
2. Look at the **Localized Tracks** card
3. It should now show ONLY tracks with `type: 'localizedTrack'`
4. Compare with the dedicated Localized Tracks page (`/dashboard/localized-tracks`)
5. The data should match exactly

## Expected Results

The Localized Tracks card should show:
- GitHub Copilot Innovation Workshop
- Build Intelligent Apps with Microsoft's Copilot Stack & Azure OpenAI
- Get Started with OpenAI and Build Natural Language Solution
- Cloud Native Applications
- Use Azure OpenAI Like A Pro to Build Powerful AI Applications
- Intelligent App Development with Microsoft Copilot Stack
- GitHub Copilot – Hackathon
- Introduction To Building AI Apps
- Low-Code for Pro-Dev in a Day

It should NOT show:
- Catalog items (with `type: 'catalog'`)
- Roadmap items (with `type: 'roadmapItem'`)
