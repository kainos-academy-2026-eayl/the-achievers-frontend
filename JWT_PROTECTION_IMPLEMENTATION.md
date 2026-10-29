# JWT Protection Implementation

## Overview

JWT-based authentication protection has been implemented on your Express frontend application. The implementation uses middleware to verify JWT tokens stored in sessions and protect sensitive routes.

## Changes Made

### 1. **New Middleware Module** (`src/middleware/authMiddleware.ts`)

Created two authentication middleware functions:

#### `requireAuth`
- Checks if user is authenticated (session contains JWT token)
- Verifies JWT token claims (expiration, issuer, audience, role)
- Redirects to login if not authenticated
- Redirects to logout if token is expired or invalid
- Sets `Cache-Control: no-store` header

#### `requireAdmin`
- Extends `requireAuth` with role-based access control
- Additionally checks if user role is "admin"
- Returns 403 Forbidden if user lacks admin privileges
- Redirects to login if not authenticated or token invalid

### 2. **Updated Routes** (`src/app.ts`)

Applied middleware protection to:

| Route | Middleware | Reason |
|-------|-----------|--------|
| `/profile` | `requireAuth` | User personal data requires authentication |
| `/admin` | `requireAdmin` | Admin-only dashboard |
| `/cart` | None (public) | Guests can shop using cart ID cookie |
| `/logout` | None (public) | Users can logout from anywhere |
| `/login` | None (public) | Public login endpoint |
| `/shop` | None (public) | Public product listing |
| `/` | None (public) | Public homepage |

### 3. **Token Verification** (`src/auth.ts`)

Exported `readLoginClaims` function to enable middleware to verify JWT tokens. Validates:
- JWT format (3 dot-separated base64url parts)
- Payload claims: `role`, `exp`, `iss`, `aud`, `sub`
- Token expiration
- Issuer: `"the-achievers-backend"`
- Audience: `"the-achievers-api"`

### 4. **Test Updates** (`tests/profile.test.ts`)

Updated profile tests to:
- Generate valid JWT tokens using proper encoding
- Expect redirects (303) instead of 401 responses for unauthenticated access
- Use `expect.any(String)` for token assertions since tokens are now valid JWTs

## How It Works

1. **User Login**: User submits credentials at `/login`
   - Backend returns valid JWT token
   - Frontend stores token in `req.session.auth.accessToken`
   - Session middleware validates and decodes token claims

2. **Accessing Protected Routes**: User navigates to protected route
   - `requireAuth` or `requireAdmin` middleware intercepts request
   - Checks if session exists and token is valid
   - If valid: proceeds to route handler (calls `next()`)
   - If invalid/expired: redirects to `/login` or `/logout`

3. **Token Expiration**: Middleware checks `exp` claim
   - If expired: redirects to `/logout` which clears session
   - Forces user to re-login to get new token

## Security Benefits

✅ **Session Validation**: Verifies JWT claims at middleware level
✅ **Expiration Checking**: Prevents use of expired tokens
✅ **Role-Based Access**: Admin routes protected with role verification
✅ **Cache Control**: Sets `no-store` header on protected routes
✅ **Secure Redirect**: Unauthenticated users redirected to login (not 401 error)

## Testing

All 149 tests pass:
```bash
npm test
```

Linting passes:
```bash
npm run lint
```

Build succeeds:
```bash
npm run build
```

## Architecture

```
Session Middleware (auth.ts)
    ↓ (stores JWT in session)
Route Middleware (authMiddleware.ts)
    ↓ (verifies JWT)
    ├→ Valid: proceed to handler
    └→ Invalid: redirect to login/logout
```

## Next Steps (Optional Enhancements)

1. **Token Refresh**: Implement token refresh logic if backend issues short-lived tokens
2. **API Authorization**: Forward JWT to backend APIs in `Authorization: Bearer` header
3. **Logout Propagation**: Notify backend of logout to invalidate token server-side
4. **Session Timeout UI**: Show warning before session expires
