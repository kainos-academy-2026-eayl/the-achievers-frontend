# Protected Routes Reference

## Route Protection Summary

### 🔒 Protected Routes (Require Authentication)

#### `/profile` (GET, POST)
- **Middleware**: `requireAuth`
- **What it does**: Displays user profile, allows profile updates
- **Access**: Authenticated users only
- **Unauth behavior**: Redirects to `/login`

#### `/admin` (GET)
- **Middleware**: `requireAdmin`
- **What it does**: Admin dashboard with product management
- **Access**: Authenticated users with `role: "admin"` only
- **Unauth behavior**: Redirects to `/login`
- **Unauthorized behavior**: Returns 403 Forbidden

### 🔓 Public Routes (No Authentication Required)

#### `/` (GET)
- **What it does**: Homepage with featured products
- **Access**: Everyone (authenticated or not)

#### `/shop` (GET)
- **What it does**: Product catalog with search/filter
- **Access**: Everyone (authenticated or not)

#### `/login` (GET, POST)
- **What it does**: Login form and credentials processing
- **Access**: Everyone (designed for logged-out users)

#### `/logout` (POST)
- **What it does**: Clears session and logs out user
- **Access**: Everyone (but meaningful only for logged-in users)

#### `/registration` (GET, POST)
- **What it does**: User registration form
- **Access**: Everyone (designed for new users)

#### `/reset-pass` (GET)
- **What it does**: Password reset form
- **Access**: Everyone (designed for locked-out users)

#### `/cart` (GET, POST)
- **What it does**: Shopping cart with anonymous cart ID
- **Access**: Everyone (authenticated or not)
- **Note**: Uses cookie-based cart ID, not user authentication

## Middleware Flow

### For Protected Routes (e.g., `/profile`)

```
Client Request
    ↓
Express Router
    ↓
requireAuth middleware
    ├─→ Check: Is session.auth present? 
    │   └─→ No: Redirect 303 to /login, end
    │   └─→ Yes: Continue
    ├─→ Check: Is token valid and not expired?
    │   └─→ No: Redirect 303 to /logout, end
    │   └─→ Yes: Continue
    ├─→ Set Cache-Control: no-store
    ├─→ Call next()
    ↓
Route Handler
```

### For Admin Routes (e.g., `/admin`)

```
Client Request
    ↓
Express Router
    ↓
requireAdmin middleware
    ├─→ Check: Is session.auth present?
    │   └─→ No: Redirect 303 to /login, end
    │   └─→ Yes: Continue
    ├─→ Check: Is token valid and not expired?
    │   └─→ No: Redirect 303 to /logout, end
    │   └─→ Yes: Continue
    ├─→ Check: Is user.role === "admin"?
    │   └─→ No: Render 403 error page, end
    │   └─→ Yes: Continue
    ├─→ Set Cache-Control: no-store
    ├─→ Call next()
    ↓
Route Handler
```

## HTTP Status Codes

| Code | Route | Meaning |
|------|-------|---------|
| 200 | `/profile` | Authenticated user viewing their profile |
| 200 | `/admin` | Admin user viewing admin dashboard |
| 303 | `/profile` (unauth) | Redirecting to login |
| 303 | `/admin` (unauth) | Redirecting to login |
| 403 | `/admin` (non-admin) | User lacks admin privilege |
| 303 | Expired token | Redirecting to logout/login |

## Token Claims Validation

When middleware validates tokens, it checks:

```typescript
{
  sub: "user-id",              // Subject (required)
  iss: "the-achievers-backend", // Issuer (required)
  aud: "the-achievers-api",     // Audience (required)
  role: "admin" | "user",       // User role (required)
  exp: 1735689600,              // Expiration in seconds (required)
}
```

If any claim is invalid or missing, user is logged out.

## Adding Protection to New Routes

To protect a new route:

```typescript
import { requireAuth, requireAdmin } from "./middleware/authMiddleware";

// For general authenticated users:
app.get("/my-protected-route", requireAuth, (req, res) => {
  // req.session.auth and res.locals.currentUser are available
});

// For admin-only:
app.get("/admin-only", requireAdmin, (req, res) => {
  // Only admin users can reach here
});
```

## Debugging Protected Routes

If routes are unexpectedly protected or unprotected:

1. Check `src/app.ts` for middleware application
2. Verify middleware imports are correct
3. Look for route path duplicates
4. Check Express middleware order (order matters!)

Example:
```typescript
// ✅ Correct: Middleware first, then handler
app.use("/profile", requireAuth, createProfileRouter(profileService));

// ❌ Wrong: Handler first would bypass middleware
app.use("/profile", createProfileRouter(profileService), requireAuth);
```
