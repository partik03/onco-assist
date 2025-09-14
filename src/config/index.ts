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
    host: getRequiredEnvVar('TIDB_HOST'),
    port: parseInt(getOptionalEnvVar('TIDB_PORT', '4000')),
    user: getRequiredEnvVar('TIDB_USER'),
    password: getRequiredEnvVar('TIDB_PASSWORD'),
    database: getRequiredEnvVar('TIDB_DATABASE'),
    ssl: loadTiDBSSLCert() ? {
      ca: loadTiDBSSLCert()!
    } : undefined
  },

  google: {
    clientId: getRequiredEnvVar('GOOGLE_CLIENT_ID'),
    clientSecret: getRequiredEnvVar('GOOGLE_CLIENT_SECRET'),
    refreshToken: getRequiredEnvVar('GOOGLE_REFRESH_TOKEN'),
    accessToken: getOptionalEnvVar('GOOGLE_ACCESS_TOKEN', '')
  },

  openai: {
    apiKey: getRequiredEnvVar('OPENAI_API_KEY'),
    model: getOptionalEnvVar('OPENAI_MODEL', 'gpt-4o')
  },

  twilio: {
    accountSid: getRequiredEnvVar('TWILIO_ACCOUNT_SID'),
    authToken: getRequiredEnvVar('TWILIO_AUTH_TOKEN'),
    fromNumber: getRequiredEnvVar('TWILIO_FROM_NUMBER')
  },

  patient: {
    phoneNumber: getRequiredEnvVar('PATIENT_PHONE_NUMBER'),
    email: getOptionalEnvVar('PATIENT_EMAIL', '')
  },

  googleDocs: {
    folderId: getRequiredEnvVar('GOOGLE_DOCS_FOLDER_ID'),
    sheetsId: getRequiredEnvVar('GOOGLE_SHEETS_ID')
  }
};

// Validate configuration
export function validateConfig(): void {
  const errors: string[] = [];

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
