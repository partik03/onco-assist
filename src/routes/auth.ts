import express from 'express';
import { google } from 'googleapis';
import { logger } from '../utils/logger';

const router = express.Router();

// Google OAuth2 setup
const getOAuth2Client = () => {
  const redirectUri = process.env.GOOGLE_REDIRECT_URL || `http://localhost:${process.env.PORT || 3000}/auth/google/callback`;
  
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

// Scopes needed for OncoAssist
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify', 
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

// Initiate Google OAuth flow
router.get('/google', (req, res) => {
  try {
    const oauth2Client = getOAuth2Client();
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });

    logger.info('Redirecting to Google OAuth');
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Error initiating Google OAuth:', error);
    res.status(500).json({ error: 'Failed to initiate authentication' });
  }
});

// Handle Google OAuth callback
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    logger.error('OAuth error:', error);
    return res.status(400).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: red;">❌ Authentication Failed</h1>
          <p>Error: ${error}</p>
          <a href="/auth/google">Try Again</a>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: red;">❌ No Authorization Code</h1>
          <p>No authorization code received from Google.</p>
          <a href="/auth/google">Try Again</a>
        </body>
      </html>
    `);
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);

    // In a real application, you'd store these tokens securely
    // For now, we'll just display them
    logger.info('OAuth tokens received successfully');

    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: green;">✅ Authentication Successful!</h1>
          <div style="text-align: left; max-width: 600px; margin: 0 auto; background: #f5f5f5; padding: 20px; border-radius: 8px;">
            <h3>Add these to your .env file:</h3>
            <pre style="background: white; padding: 15px; border-radius: 4px; overflow-x: auto;">
GOOGLE_ACCESS_TOKEN=${tokens.access_token}
${tokens.refresh_token ? `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}` : '# No refresh token (using web flow)'}
            </pre>
          </div>
          <p style="margin-top: 20px;">
            <strong>Next steps:</strong><br>
            1. Update your .env file with the tokens above<br>
            2. Restart the OncoAssist service<br>
            3. Test the medical workflow
          </p>
        </body>
      </html>
    `);

  } catch (error) {
    logger.error('Error exchanging code for tokens:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: red;">❌ Token Exchange Failed</h1>
          <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <a href="/auth/google">Try Again</a>
        </body>
      </html>
    `);
  }
});

// Check authentication status
router.get('/status', (req, res) => {
  const hasGoogleCreds = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasTokens = !!(process.env.GOOGLE_ACCESS_TOKEN);

  res.json({
    google: {
      configured: hasGoogleCreds,
      authenticated: hasTokens,
      authUrl: hasGoogleCreds ? '/auth/google' : null
    }
  });
});

export default router;

