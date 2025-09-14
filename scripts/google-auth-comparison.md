# Google OAuth2: Web App vs Standalone Application

## Your Web App (Doesn't Need Refresh Token)
```javascript
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.SERVER_URL}/auth/google/callback`  // ← WEB REDIRECT
);

const url = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: scopes,
  prompt: "consent",
  state: encodeURIComponent(state),
  redirect_uri: process.env.GOOGLE_REDIRECT_URL,  // ← WEB REDIRECT
});
```

**Why no refresh token needed:**
- User authenticates through web browser
- Server handles the callback
- Session-based authentication
- User re-authenticates when session expires

## OncoAssist Standalone App (Needs Refresh Token)
```javascript
const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  'urn:ietf:wg:oauth:2.0:oob'  // ← DESKTOP APPLICATION
);

const { tokens } = await oauth2Client.getToken(code);
// tokens.refresh_token is needed for long-running processes
```

**Why refresh token IS needed:**
- Runs continuously (24/7 email monitoring)
- No web server to handle re-authentication
- Access tokens expire every hour
- Refresh token allows automatic token renewal
- No user interaction required for renewal

## The Key Difference

| Web Application | Standalone Application |
|----------------|----------------------|
| User visits website | Runs in background |
| Browser-based auth | One-time setup |
| Session cookies | Stored credentials |
| Re-auth on visit | Auto token refresh |
| Short-lived access | Long-term operation |
