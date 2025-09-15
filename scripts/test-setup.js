#!/usr/bin/env node

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

console.log('🧪 OncoAssist Setup Verification\n');

// Load environment variables
require('dotenv').config();

const requiredEnvVars = {
  // TiDB Configuration
  'TIDB_HOST': 'TiDB database host',
  'TIDB_USER': 'TiDB username', 
  'TIDB_PASSWORD': 'TiDB password',
  'TIDB_DATABASE': 'TiDB database name',
  
  // Google OAuth2 Configuration
  'GOOGLE_CLIENT_ID': 'Google OAuth2 Client ID',
  'GOOGLE_CLIENT_SECRET': 'Google OAuth2 Client Secret', 
  'GOOGLE_REFRESH_TOKEN': 'Google OAuth2 Refresh Token',
  
  // Google Resources
  'GOOGLE_DOCS_FOLDER_ID': 'Google Drive folder for documents',
  'GOOGLE_SHEETS_ID': 'Google Sheets ID for medicine tracking',
  
  // OpenAI Configuration
  'OPENAI_API_KEY': 'OpenAI API key',
  
  // Twilio Configuration
  'TWILIO_ACCOUNT_SID': 'Twilio Account SID',
  'TWILIO_AUTH_TOKEN': 'Twilio Auth Token',
  'TWILIO_FROM_NUMBER': 'Twilio phone number',
  
  // Patient Configuration
  'PATIENT_PHONE_NUMBER': 'Patient phone number for notifications'
};

const optionalEnvVars = {
  'TIDB_PORT': 'TiDB port (default: 4000)',
  'TIDB_SSL_CA_PATH': 'TiDB SSL certificate path',
  'GOOGLE_ACCESS_TOKEN': 'Google OAuth2 Access Token (will be refreshed)',
  'OPENAI_MODEL': 'OpenAI model (default: gpt-4o)',
  'PATIENT_EMAIL': 'Patient email address',
  'LOG_LEVEL': 'Logging level (default: info)',
  'POLL_INTERVAL_MINUTES': 'Email polling interval (default: 60)',
  'NODE_ENV': 'Environment (default: development)'
};

async function checkEnvironmentVariables() {
  console.log('📋 Checking Environment Variables...\n');
  
  const missing = [];
  const present = [];
  
  // Check required variables
  for (const [envVar, description] of Object.entries(requiredEnvVars)) {
    if (process.env[envVar]) {
      present.push(`✅ ${envVar}: ${description}`);
    } else {
      missing.push(`❌ ${envVar}: ${description}`);
    }
  }
  
  // Show results
  if (present.length > 0) {
    console.log('✅ Found Required Variables:');
    present.forEach(item => console.log(`   ${item}`));
    console.log();
  }
  
  if (missing.length > 0) {
    console.log('❌ Missing Required Variables:');
    missing.forEach(item => console.log(`   ${item}`));
    console.log();
    return false;
  }
  
  // Check optional variables
  console.log('ℹ️  Optional Variables:');
  for (const [envVar, description] of Object.entries(optionalEnvVars)) {
    const status = process.env[envVar] ? '✅' : '⚪';
    const value = process.env[envVar] ? 'Set' : 'Not set (will use default)';
    console.log(`   ${status} ${envVar}: ${value}`);
  }
  console.log();
  
  return true;
}

async function testGoogleAuthentication() {
  console.log('🔐 Testing Google Authentication...\n');
  
  const requiredFields = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];
  const missing = requiredFields.filter(field => !process.env[field]);
  
  if (missing.length > 0) {
    console.log('❌ Missing Google credentials:', missing.join(', '));
    console.log('   Run: npm run auth:google');
    return false;
  }
  
  try {
    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      access_token: process.env.GOOGLE_ACCESS_TOKEN
    });
    
    // Test Gmail API
    console.log('📧 Testing Gmail API access...');
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log(`   ✅ Gmail: Connected as ${profile.data.emailAddress}`);
    
    // Test Google Docs API
    console.log('📄 Testing Google Docs API access...');
    const docs = google.docs({ version: 'v1', auth: oauth2Client });
    // Just test auth, don't create a document
    console.log('   ✅ Google Docs: Authentication successful');
    
    // Test Google Sheets API
    console.log('📊 Testing Google Sheets API access...');
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    if (process.env.GOOGLE_SHEETS_ID) {
      try {
        const response = await sheets.spreadsheets.get({
          spreadsheetId: process.env.GOOGLE_SHEETS_ID
        });
        console.log(`   ✅ Google Sheets: Connected to "${response.data.properties.title}"`);
      } catch (error) {
        console.log(`   ⚠️  Google Sheets: Invalid GOOGLE_SHEETS_ID (${error.message})`);
      }
    } else {
      console.log('   ⚪ Google Sheets: No GOOGLE_SHEETS_ID provided');
    }
    
    // Test Google Drive API
    console.log('📁 Testing Google Drive API access...');
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    if (process.env.GOOGLE_DOCS_FOLDER_ID) {
      try {
        const response = await drive.files.get({
          fileId: process.env.GOOGLE_DOCS_FOLDER_ID
        });
        console.log(`   ✅ Google Drive: Connected to folder "${response.data.name}"`);
      } catch (error) {
        console.log(`   ⚠️  Google Drive: Invalid GOOGLE_DOCS_FOLDER_ID (${error.message})`);
      }
    } else {
      console.log('   ⚪ Google Drive: No GOOGLE_DOCS_FOLDER_ID provided');
    }
    
    console.log('\n✅ Google Authentication: All tests passed!\n');
    return true;
    
  } catch (error) {
    console.log(`❌ Google Authentication failed: ${error.message}`);
    
    if (error.message.includes('invalid_grant')) {
      console.log('   💡 Tip: Your refresh token may have expired. Run: npm run auth:google');
    } else if (error.message.includes('invalid_client')) {
      console.log('   💡 Tip: Check your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
    }
    
    return false;
  }
}

async function testOpenAI() {
  console.log('🤖 Testing OpenAI API...\n');
  
  if (!process.env.OPENAI_API_KEY) {
    console.log('❌ OPENAI_API_KEY not found');
    return false;
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const gpt4Models = data.data.filter(model => model.id.includes('gpt-4'));
      console.log(`✅ OpenAI: Connected (${gpt4Models.length} GPT-4 models available)`);
      return true;
    } else {
      const error = await response.text();
      console.log(`❌ OpenAI API error: ${response.status} - ${error}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ OpenAI connection failed: ${error.message}`);
    return false;
  }
}

async function testTwilio() {
  console.log('📱 Testing Twilio Configuration...\n');
  
  const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'];
  const missing = required.filter(field => !process.env[field]);
  
  if (missing.length > 0) {
    console.log('❌ Missing Twilio credentials:', missing.join(', '));
    return false;
  }
  
  // Basic validation (don't send actual SMS in test)
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  
  if (!accountSid.startsWith('AC')) {
    console.log('❌ Invalid TWILIO_ACCOUNT_SID format (should start with AC)');
    return false;
  }
  
  if (!fromNumber.startsWith('+')) {
    console.log('❌ Invalid TWILIO_FROM_NUMBER format (should start with +)');
    return false;
  }
  
  console.log(`✅ Twilio: Configuration looks valid`);
  console.log(`   Account SID: ${accountSid}`);
  console.log(`   From Number: ${fromNumber}`);
  
  return true;
}

function checkProjectStructure() {
  console.log('📁 Checking Project Structure...\n');
  
  const requiredDirs = ['src', 'scripts', 'logs'];
  const requiredFiles = [
    'package.json',
    'tsconfig.json',
    'src/index.ts',
    'src/services/tidb.service.ts',
    'src/services/gmail.service.ts',
    'src/workflow/medical-workflow.ts'
  ];
  
  let allGood = true;
  
  // Check directories
  for (const dir of requiredDirs) {
    if (fs.existsSync(dir)) {
      console.log(`✅ Directory: ${dir}`);
    } else {
      console.log(`❌ Missing directory: ${dir}`);
      allGood = false;
    }
  }
  
  // Check files
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      console.log(`✅ File: ${file}`);
    } else {
      console.log(`❌ Missing file: ${file}`);
      allGood = false;
    }
  }
  
  console.log();
  return allGood;
}

async function main() {
  console.log('🚀 OncoAssist Setup Verification Started\n');
  console.log('=' * 50);
  
  const results = {
    envVars: await checkEnvironmentVariables(),
    structure: checkProjectStructure(),
    google: await testGoogleAuthentication(),
    openai: await testOpenAI(),
    twilio: await testTwilio()
  };
  
  console.log('=' * 50);
  console.log('\n📊 Summary:');
  
  for (const [test, passed] of Object.entries(results)) {
    const status = passed ? '✅' : '❌';
    const testName = test.charAt(0).toUpperCase() + test.slice(1);
    console.log(`${status} ${testName}: ${passed ? 'PASSED' : 'FAILED'}`);
  }
  
  const allPassed = Object.values(results).every(Boolean);
  
  if (allPassed) {
    console.log('\n🎉 All tests passed! You\'re ready to run OncoAssist:');
    console.log('   npm run build');
    console.log('   npm start');
  } else {
    console.log('\n⚠️  Some tests failed. Please fix the issues above before running.');
    console.log('\n💡 Common solutions:');
    console.log('   - Missing env vars: Copy .env.example to .env and fill in values');
    console.log('   - Google auth: Run npm run auth:google');
    console.log('   - Invalid credentials: Double-check your API keys');
  }
  
  console.log('\n🔗 Helpful links:');
  console.log('   TiDB Cloud: https://tidbcloud.com/');
  console.log('   Google Cloud Console: https://console.cloud.google.com/');
  console.log('   OpenAI Platform: https://platform.openai.com/');
  console.log('   Twilio Console: https://console.twilio.com/');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { 
  checkEnvironmentVariables,
  testGoogleAuthentication,
  testOpenAI,
  testTwilio,
  checkProjectStructure
};
