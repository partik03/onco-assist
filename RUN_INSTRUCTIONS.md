# OncoAssist - Run Instructions

This document provides step-by-step instructions to set up and run the OncoAssist AI medical assistant application.

## Prerequisites

Before running OncoAssist, ensure you have:

1. **Node.js 18+** installed
2. **TiDB Serverless** account
3. **Google Cloud Project** with APIs enabled
4. **OpenAI API** key
5. **Twilio** account

## Quick Setup

### 1. Install Dependencies

```bash
npm install
npm run setup
```

### 2. Configure Environment

Copy and edit the environment file:
```bash
cp env.example .env
```

Fill in your credentials in `.env`:

```env
# TiDB Configuration
TIDB_HOST=gateway01.us-west-2.prod.aws.tidbcloud.com
TIDB_USER=your_username.root
TIDB_PASSWORD=your_password
TIDB_DATABASE=your_database_name

# Google Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_FROM_NUMBER=+1234567890

# Patient Configuration
PATIENT_PHONE_NUMBER=+1234567890
```

### 3. Build and Run

```bash
npm run build
npm start
```

## Detailed Setup Instructions

### TiDB Serverless Setup

1. Go to [TiDB Cloud](https://tidbcloud.com/)
2. Create a free Serverless cluster
3. Get connection details from the cluster overview
4. Update `.env` with your TiDB credentials

### Google APIs Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable these APIs:
   - Gmail API
   - Google Docs API
   - Google Sheets API
   - Google Drive API

4. Create OAuth2 credentials:
   - Go to "Credentials" → "Create Credentials" → "OAuth client ID"
   - Choose "Desktop application"
   - Download the credentials JSON

5. Generate refresh token:
   ```bash
   # Use Google OAuth2 Playground or run this script
   node scripts/generate-refresh-token.js
   ```

### OpenAI Setup

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an API key
3. Add to `.env` file

### Twilio Setup

1. Go to [Twilio Console](https://console.twilio.com/)
2. Get Account SID and Auth Token
3. Get a phone number for SMS
4. Add credentials to `.env`

## Running the Application

### Full Application (Continuous Monitoring)
```bash
npm start
```
This starts the email monitoring service that checks for new emails every hour.

### One-time Processing
```bash
npm run process
```
Process existing unread emails once and exit.

### Generate Weekly Report
```bash
npm run report
```
Generate a weekly medical summary report.

### Search Similar Cases
```bash
npm run search "high glucose" "elevated HbA1c" blood_test
```
Search for similar medical cases using vector similarity.

## Docker Deployment

### Using Docker Compose
```bash
npm run docker:build
npm run docker:run
```

### Manual Docker
```bash
docker build -t onco-assist .
docker run -d --env-file .env onco-assist
```

## Testing

### Run All Tests
```bash
npm test
```

### Run with Coverage
```bash
npm run test:coverage
```

### Watch Mode
```bash
npm run test:watch
```

## Application Features

### Email Classification
The application automatically classifies emails into:
- **PET/CT/Histopathology**: Scan and biopsy reports
- **Blood Tests**: Laboratory results
- **Bills/Invoices**: Medical billing documents
- **Medicines**: Prescription and drug information

### Vector Search
Uses TiDB's vector capabilities to:
- Find similar medical cases
- Provide historical context
- Enhance classification accuracy

### Automated Actions
- Creates structured reports in Google Docs
- Updates tracking spreadsheets
- Sends SMS/WhatsApp notifications
- Stores everything in TiDB with vector embeddings

## Monitoring and Logs

### View Logs
```bash
tail -f logs/combined.log
```

### Error Logs
```bash
tail -f logs/error.log
```

### Application Status
The application logs its status and all processing activities.

## Troubleshooting

### Common Issues

1. **TiDB Connection Failed**
   - Check your TiDB credentials
   - Ensure SSL certificate is correct
   - Verify network connectivity

2. **Google API Errors**
   - Check OAuth2 credentials
   - Verify API quotas
   - Ensure refresh token is valid

3. **OpenAI API Errors**
   - Check API key validity
   - Verify usage limits
   - Ensure model access

4. **Twilio SMS Failed**
   - Verify phone number format (+1234567890)
   - Check Twilio balance
   - Ensure numbers are verified

### Debug Mode
Set environment variable for verbose logging:
```bash
LOG_LEVEL=debug npm start
```

## Production Deployment

### Using PM2
```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name "onco-assist" -- start
```

### Environment Variables
Ensure all production credentials are set:
- Use strong passwords
- Enable SSL for TiDB
- Set up proper API quotas
- Configure monitoring

## API Endpoints (Optional Webhook Mode)

If running in webhook mode, the application exposes:
- `POST /webhook/gmail` - Gmail webhook endpoint
- `GET /health` - Health check endpoint
- `GET /status` - Application status

## Support

For issues or questions:
1. Check the logs for error messages
2. Review this documentation
3. Check the main README.md
4. Create an issue on GitHub

## Security Notes

- Never commit `.env` file to version control
- Use environment-specific configurations
- Regularly rotate API keys
- Monitor usage and quotas
- Enable logging but avoid logging sensitive data

---

**Ready to start processing medical emails with AI! 🏥🤖**
