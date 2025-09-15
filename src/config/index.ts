import dotenv from 'dotenv';
import { AppConfig } from '../types';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function loadTiDBSSLCert(): string | undefined {
  const sslPath = process.env.TIDB_SSL_CA_PATH;
  if (sslPath && fs.existsSync(sslPath)) {
    return fs.readFileSync(sslPath, 'utf8');
  }
  return undefined;
}

export const config: AppConfig = {
  tidb: {
    host: getOptionalEnvVar('TIDB_HOST', 'localhost'),
    port: parseInt(getOptionalEnvVar('TIDB_PORT', '4000')),
    user: getOptionalEnvVar('TIDB_USER', 'root'),
    password: getOptionalEnvVar('TIDB_PASSWORD', ''),
    database: getOptionalEnvVar('TIDB_DATABASE', 'onco_assist'),
    ssl: undefined // SSL is handled dynamically in the service
  },

  google: {
    clientId: getOptionalEnvVar('GOOGLE_CLIENT_ID', ''),
    clientSecret: getOptionalEnvVar('GOOGLE_CLIENT_SECRET', ''),
    refreshToken: getOptionalEnvVar('GOOGLE_REFRESH_TOKEN', ''),
    accessToken: getOptionalEnvVar('GOOGLE_ACCESS_TOKEN', '')
  },

  openai: {
    apiKey: getOptionalEnvVar('OPENAI_API_KEY', ''),
    model: getOptionalEnvVar('OPENAI_MODEL', 'gpt-4o')
  },

  twilio: {
    accountSid: getOptionalEnvVar('TWILIO_ACCOUNT_SID', ''),
    authToken: getOptionalEnvVar('TWILIO_AUTH_TOKEN', ''),
    fromNumber: getOptionalEnvVar('TWILIO_FROM_NUMBER', '+1234567890')
  },

  patient: {
    phoneNumber: getOptionalEnvVar('PATIENT_PHONE_NUMBER', '+1234567890'),
    email: getOptionalEnvVar('PATIENT_EMAIL', 'patient@example.com')
  },

  googleDocs: {
    folderId: getOptionalEnvVar('GOOGLE_DOCS_FOLDER_ID', ''),
    sheetsId: getOptionalEnvVar('GOOGLE_SHEETS_ID', '')
  }
};

// Validate configuration
export function validateConfig(): void {
  const errors: string[] = [];
  const isDevelopment = appSettings.nodeEnv === 'development';

  // In development mode, only validate essential services
  if (isDevelopment) {
    console.log('🔧 Running in development mode - using default configurations');
    console.log('⚠️  Some services may not work without proper credentials');
    return; // Skip validation in development
  }

  // Production validation
  // Validate TiDB config
  if (!config.tidb.host) errors.push('TiDB host is required');
  if (!config.tidb.user) errors.push('TiDB user is required');
  if (!config.tidb.password) errors.push('TiDB password is required');
  if (!config.tidb.database) errors.push('TiDB database is required');

  // Validate Google config
  if (!config.google.clientId) errors.push('Google Client ID is required');
  if (!config.google.clientSecret) errors.push('Google Client Secret is required');
  if (!config.google.refreshToken) errors.push('Google Refresh Token is required');

  // Validate OpenAI config
  if (!config.openai.apiKey) errors.push('OpenAI API key is required');

  // Validate Twilio config
  if (!config.twilio.accountSid) errors.push('Twilio Account SID is required');
  if (!config.twilio.authToken) errors.push('Twilio Auth Token is required');
  if (!config.twilio.fromNumber) errors.push('Twilio From Number is required');

  // Validate patient config
  if (!config.patient.phoneNumber) errors.push('Patient phone number is required');

  // Validate Google Docs config
  if (!config.googleDocs.folderId) errors.push('Google Docs folder ID is required');
  if (!config.googleDocs.sheetsId) errors.push('Google Sheets ID is required');

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Application settings
export const appSettings = {
  pollIntervalMinutes: parseInt(getOptionalEnvVar('POLL_INTERVAL_MINUTES', '60')),
  logLevel: getOptionalEnvVar('LOG_LEVEL', 'info'),
  nodeEnv: getOptionalEnvVar('NODE_ENV', 'development'),
  webhookPort: parseInt(getOptionalEnvVar('WEBHOOK_PORT', '3000')),
  webhookSecret: getOptionalEnvVar('WEBHOOK_SECRET', 'default-secret')
};

export default config;
