# Azure AD B2C Integration - MS Innovation Event Management Dashboard

## Overview
This integration replaces the existing authentication system with Azure AD B2C using the provided QA tenant credentials.

## Configuration Details

### Azure B2C Tenant Information
- **Directory ID:** dd1da7a2-61b9-44ff-9c68-5fae266bd396
- **Client ID:** e76ca0fd-0545-4b4f-ba26-aa96f8999f4a
- **Domain:** cloudlabsqaai
- **Sign-up/Sign-in Policy:** B2C_1A_signup_signin_linkedin
- **Authority:** https://cloudlabsqaai.b2clogin.com/cloudlabsqaai.onmicrosoft.com/B2C_1A_signup_signin_linkedin

## Implementation Components

### 1. Frontend Components

#### Core MSAL Configuration (`src/lib/msalConfig.ts`)
- MSAL browser configuration for Azure B2C
- Login request scopes definition
- Microsoft Graph configuration

#### Authentication Components
- **AuthGuard** (`src/components/AuthGuard.tsx`): Protects routes and shows login page
- **AuthProvider** (`src/components/AuthProvider.tsx`): Provides authentication context
- **AuthButtons** (`src/components/AuthButtons.tsx`): Login/logout buttons with user info

#### API Integration
- **Azure API Client** (`src/lib/azureApiClient.ts`): API client that automatically includes B2C tokens
- Replaces the old token-based authentication system

### 2. Backend Integration (Optional)

#### Token Validation Middleware (`backend/azureB2CMiddleware.js`)
- Validates Azure B2C JWT tokens
- Extracts user information from tokens
- Ready to use with Express.js routes

### 3. Updated Components

#### Application Structure
- **App.tsx**: Updated to use MSAL Provider and AuthGuard
- **main.tsx**: MSAL instance initialization
- **DashboardHeader.tsx**: Uses Azure B2C user information
- **AdminOnly.tsx**: Updated to use new authentication context
- **AppSidebar.tsx**: Uses new role management

## Key Features

### Authentication Flow
1. **Unauthenticated users** see a professional login page
2. **Login redirect** to Azure B2C hosted login page
3. **LinkedIn integration** (as configured in B2C policy)
4. **Automatic token refresh** using MSAL silent token acquisition
5. **Logout redirect** back to application

### Security Features
- **JWT token validation** (optional backend middleware)
- **Secure token storage** in session storage
- **Automatic token refresh** before expiration
- **PKCE flow** for SPA security
- **HTTPS redirect URIs** (configure in Azure B2C)

### User Management
- **Role assignment** based on user email/claims
- **Admin detection** for admin-only features
- **User profile information** from B2C claims

## Testing

### Auth Test Page (`/auth-test`)
Accessible to admin users only, provides:
- Authentication status verification
- User information display
- Token details and expiration
- Test actions (login/logout)
- Configuration verification

### Test Users
Use the B2C tenant's configured test users or create new accounts through the sign-up flow.

## Configuration Steps

### 1. Azure B2C Setup (Already Done)
- ✅ B2C tenant created
- ✅ Application registered
- ✅ Sign-up/Sign-in policy configured
- ✅ LinkedIn identity provider configured

### 2. Application Configuration (Implemented)
- ✅ MSAL packages installed
- ✅ MSAL configuration created
- ✅ Authentication components implemented
- ✅ Route protection added
- ✅ User context management

### 3. Frontend Integration (Complete)
- ✅ All components updated to use Azure B2C
- ✅ Old authentication system removed
- ✅ New API client with token management
- ✅ Admin role detection implemented

### 4. Backend Integration (Optional)
- ✅ Token validation middleware created
- ⚠️ Integration with existing backend routes (manual step)

## Deployment Notes

### Redirect URIs
Configure in Azure B2C application registration:
- Development: `http://localhost:5173/`
- Production: `https://your-domain.com/`

### Environment Variables
Consider moving sensitive configuration to environment variables:
```env
VITE_AZURE_CLIENT_ID=e76ca0fd-0545-4b4f-ba26-aa96f8999f4a
VITE_AZURE_TENANT_NAME=cloudlabsqaai
VITE_AZURE_POLICY=B2C_1A_signup_signin_linkedin
```

## Testing Checklist

- [ ] Login flow works correctly
- [ ] LinkedIn sign-in works (if configured)
- [ ] Token refresh works automatically
- [ ] Logout redirects properly
- [ ] Admin features visible only to admin users
- [ ] Protected routes require authentication
- [ ] User information displays correctly
- [ ] Role-based access control works

## Support

### Common Issues
1. **Redirect URI mismatch**: Ensure redirect URIs match exactly in Azure B2C
2. **Token expiration**: Tokens refresh automatically, but check network requests
3. **Role assignment**: Currently based on email matching - can be enhanced with B2C custom attributes

### Debugging
- Check browser developer tools for MSAL logs
- Use `/auth-test` page to verify configuration
- Monitor network requests for token acquisition
- Check Azure B2C sign-in logs in Azure portal

## Security Considerations

### Production Deployment
- Use HTTPS for all redirect URIs
- Consider using `localStorage` instead of `sessionStorage` for SSO across tabs
- Implement proper CORS policies
- Set up monitoring for failed authentication attempts
- Regular token rotation and policy updates

### Backend Security
- Validate all tokens server-side for sensitive operations
- Implement rate limiting
- Log authentication events
- Use secure session management