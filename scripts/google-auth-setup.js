#!/usr/bin/env node

const { google } = require('googleapis');
const readline = require('readline');
const fs = require('fs');

console.log('🔐 Google OAuth2 Setup for OncoAssist\n');

// These are the scopes we need for the application
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

async function setupGoogleAuth() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query) => new Promise((resolve) => rl.question(query, resolve));

  try {
    console.log('First, you need to create OAuth2 credentials in Google Cloud Console:');
    console.log('1. Go to: https://console.cloud.google.com/');
    console.log('2. Enable Gmail API, Google Docs API, Google Sheets API');
    console.log('3. Go to Credentials → Create Credentials → OAuth client ID');
    console.log('4. Choose "Desktop application"');
    console.log('5. Download the credentials JSON file\n');

    const clientId = await question('Enter your Google Client ID: ');
    const clientSecret = await question('Enter your Google Client Secret: ');

    if (!clientId || !clientSecret) {
      console.log('❌ Client ID and Secret are required');
      rl.close();
      return;
    }

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'urn:ietf:wg:oauth:2.0:oob' // For desktop applications
    );
console.log(process.env.GOOGLE_REDIRECT_URL);

    // Generate auth URL
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent",
        redirect_uri: process.env.GOOGLE_REDIRECT_URL || "http://localhost:8080/auth/google/callback" || "https://oauth.n8n.cloud/oauth2/callback",
      });
    console.log('\n📱 Open this URL in your browser:');
    console.log(authUrl);
    console.log('\nAfter authorization, you\'ll get a code. Paste it here:');

    const code = await question('Enter the authorization code: ');

    if (!code) {
      console.log('❌ Authorization code is required');
      rl.close();
      return;
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('\n✅ Authentication successful!');
    console.log('\nAdd these to your .env file:');
    console.log(`GOOGLE_CLIENT_ID=${clientId}`);
    console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`GOOGLE_ACCESS_TOKEN=${tokens.access_token}`);

    // Save to .env if it exists
    if (fs.existsSync('.env')) {
      const envContent = fs.readFileSync('.env', 'utf8');
      let updatedEnv = envContent;

      // Update or add Google credentials
      const updates = {
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: clientSecret,
        GOOGLE_REFRESH_TOKEN: tokens.refresh_token,
        GOOGLE_ACCESS_TOKEN: tokens.access_token
      };

      for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(updatedEnv)) {
          updatedEnv = updatedEnv.replace(regex, `${key}=${value}`);
        } else {
          updatedEnv += `\n${key}=${value}`;
        }
      }

      fs.writeFileSync('.env', updatedEnv);
      console.log('\n💾 Updated .env file with Google credentials');
    }

  } catch (error) {
    console.error('❌ Error setting up Google authentication:', error.message);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  setupGoogleAuth();
}

module.exports = { setupGoogleAuth };
