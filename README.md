# OncoAssist - AI-Powered Medical Assistant with TiDB Vector Database

OncoAssist is an intelligent medical assistant that automatically processes medical emails, classifies them using AI, and stores them in TiDB's vector database for advanced similarity search and pattern recognition. This project demonstrates a real-world agentic AI workflow for medical document management.

## 🏆 TiDB AgentX Hackathon Project

This project is built for the TiDB AgentX Hackathon, showcasing an innovative multi-step AI agent that chains together:

1. **Data Ingestion & Classification** - Processes medical emails and documents
2. **Vector Search** - Uses TiDB's vector capabilities for similarity search
3. **LLM Integration** - OpenAI GPT-4 for content analysis and report generation
4. **External Tool Integration** - Gmail, Google Docs/Sheets, Twilio for notifications
5. **Multi-Step Workflow** - Automated end-to-end medical document processing

## 🎯 Features

### Core Workflow
- **Email Processing**: Automatically monitors Gmail for medical emails
- **AI Classification**: Uses OpenAI GPT-4 to classify emails into:
  - PET/CT/Histopathology reports
  - Blood test results
  - Medical bills/invoices
  - Medicine information
- **Vector Storage**: Stores documents with embeddings in TiDB for similarity search
- **Smart Routing**: Routes classified emails to appropriate processing pipelines
- **Document Generation**: Creates structured medical reports in Google Docs
- **Patient Notifications**: Sends SMS/WhatsApp alerts via Twilio

### Advanced AI Features
- **Similarity Search**: Finds similar medical cases using vector embeddings
- **Historical Context**: Enhances classification with past medical history
- **Ensemble Classification**: Combines multiple AI models for better accuracy
- **Pattern Recognition**: Identifies trends in medical data over time
- **Automated Reporting**: Generates weekly summaries and insights

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Gmail API     │    │   OpenAI API    │    │   TiDB Cloud    │
│   (Email Input) │    │   (AI Analysis) │    │ (Vector Storage)│
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Medical Workflow Engine                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐  │
│  │ Classification│  │   Processing  │  │    Notification   │  │
│  │    Service    │  │    Service    │  │     Service       │  │
│  └───────────────┘  └───────────────┘  └───────────────────┘  │
└─────────┬───────────────────┬───────────────────┬───────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Google Docs    │  │ Google Sheets   │  │   Twilio SMS    │
│  (Reports)      │  │ (Tracking)      │  │ (Alerts)        │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

1. **TiDB Serverless Account**: Sign up at [TiDB Cloud](https://tidbcloud.com/)
2. **Google Cloud Project**: For Gmail, Docs, and Sheets APIs
3. **OpenAI API Key**: For AI processing
4. **Twilio Account**: For SMS notifications

### Installation

1. **Clone the repository**:
   ```bash
git clone https://github.com/yourusername/onco-assist.git
   cd onco-assist
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp env.example .env
# Edit .env with your credentials
```

4. **Build the project**:
```bash
npm run build
```

### Configuration

#### TiDB Setup
1. Create a TiDB Serverless cluster
2. Get connection details from the TiDB Cloud console
3. Update `.env` with TiDB credentials

#### Google APIs Setup
1. Enable Gmail, Google Docs, and Google Sheets APIs
2. Create OAuth2 credentials
3. Generate refresh token for your Gmail account
4. Update `.env` with Google credentials

#### OpenAI Setup
1. Get API key from OpenAI
2. Update `.env` with OpenAI credentials

#### Twilio Setup
1. Create Twilio account
2. Get phone number for SMS
3. Update `.env` with Twilio credentials

### Running the Application

**Start the full application**:
   ```bash
   npm start
   ```

**Process emails once and exit**:
```bash
npm run process
```

**Generate weekly report**:
```bash
npm run report
```

**Search for similar cases**:
```bash
npm run search "high glucose" "elevated HbA1c" blood_test
```

## 📊 Data Flow

### 1. Email Ingestion
- Monitors Gmail for new medical emails
- Extracts text content and attachments
- Generates vector embeddings using OpenAI

### 2. AI Classification
- Uses GPT-4 to classify email content
- Enhances classification with historical context
- Stores classification results in TiDB

### 3. Vector Search
- Searches for similar medical cases
- Uses cosine similarity for relevance ranking
- Provides historical context for better decisions

### 4. Document Processing
- Generates structured medical reports
- Creates patient-friendly summaries
- Updates Google Docs and Sheets

### 5. Notifications
- Sends SMS alerts for important findings
- Customizes messages based on urgency
- Logs all notifications in TiDB

## 🔍 Vector Database Usage

### Medical Document Storage
```sql
CREATE TABLE medical_documents (
  id VARCHAR(255) PRIMARY KEY,
  content LONGTEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  type ENUM('radiology', 'blood_test', 'invoice', 'medicine') NOT NULL,
  source VARCHAR(500) NOT NULL,
  patient_id VARCHAR(255),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSON,
  VECTOR INDEX idx_embedding (embedding)
);
```

### Similarity Search Example
```sql
SELECT id, content, 
       VEC_COSINE_DISTANCE(embedding, VEC_FROM_TEXT('[0.1, 0.2, ...]')) as distance
FROM medical_documents 
WHERE type = 'blood_test'
ORDER BY distance ASC 
LIMIT 5;
```

## 🧪 Testing

Run the test suite:
```bash
npm test
```

Run with coverage:
```bash
npm run test:coverage
```

## 📝 API Reference

### Classification Service
```typescript
const classification = await classificationService.classifyAndEnhanceEmail(emailData);
```

### Vector Search
```typescript
const similarCases = await tidbService.searchSimilarDocuments(embedding, 'blood_test', 5);
```

### Report Generation
```typescript
const report = await openaiService.processPETCTReport(emailText);
```

## 🛠️ Development

### Project Structure
```
src/
├── config/          # Configuration management
├── services/        # Core services (Gmail, OpenAI, TiDB, etc.)
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
├── workflow/        # Main workflow orchestration
└── index.ts         # Application entry point
```

### Adding New Features

1. **New Document Type**: Add to classification categories and processing logic
2. **New Service Integration**: Create service class in `services/` directory
3. **New Workflow Step**: Extend `MedicalWorkflow` class
4. **New Vector Search**: Add methods to `TiDBService`

## 🚀 Deployment

### Using Docker
```bash
docker build -t onco-assist .
docker run -d --env-file .env onco-assist
```

### Using PM2
```bash
npm install -g pm2
pm2 start dist/index.js --name "onco-assist"
```

## 🏥 Medical Use Cases

### 1. Radiology Report Processing
- Extracts tumor measurements and staging information
- Compares with historical scans
- Generates patient-friendly summaries

### 2. Blood Test Analysis
- Identifies abnormal values
- Tracks trends over time
- Sends alerts for critical results

### 3. Insurance Claim Management
- Consolidates medical bills
- Prepares submission documents
- Tracks claim status

### 4. Medication Tracking
- Monitors prescription changes
- Tracks drug prices
- Provides savings recommendations

## 🔒 Security & Privacy

- All medical data is encrypted in transit and at rest
- TiDB provides enterprise-grade security
- No sensitive data is logged
- HIPAA compliance considerations implemented

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

For questions and support:
- Create an issue on GitHub
- Check the documentation
- Review example configurations

## 🎯 TiDB AgentX Hackathon Submission

### Innovation Highlights
- **Multi-step AI workflow** with 5+ integrated building blocks
- **Vector similarity search** for medical case matching
- **Real-time processing** with automated notifications
- **Full-text and vector search** combination
- **Production-ready** TypeScript application

### Technical Achievements
- Implemented vector embeddings for medical documents
- Created intelligent classification with historical context
- Built automated multi-step workflows
- Integrated multiple external APIs seamlessly
- Demonstrated real-world medical use case

### Demo Video
[Link to demonstration video showing the complete workflow]

---

Built with ❤️ for the TiDB AgentX Hackathon 2025