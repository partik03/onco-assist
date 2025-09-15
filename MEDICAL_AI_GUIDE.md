# OncoAssist Medical AI System Guide

## Overview

OncoAssist is a comprehensive AI-powered medical assistant system that processes medical reports from emails, analyzes them using specialized medical parsers, stores data in TiDB, and provides intelligent interactions for both patients and doctors.

## System Architecture

```
Email → PDF Parser → Medical Analyzer → TiDB Storage → AI Agent → Notifications
```

### Core Components

1. **Email Service** (`app/email_service.py`)
   - IMAP email retrieval with medical keyword filtering
   - SMTP notification sending
   - Attachment processing

2. **PDF Parser** (`app/pdf_parser.py`)
   - Text extraction from medical PDFs using PyMuPDF
   - Patient information extraction
   - Report type detection (CBC, PET/CT, Biopsy)

3. **Medical Analyzer** (`app/medical_analyzer.py`)
   - Specialized analyzers for different report types
   - CBC: Blood count analysis with alerts
   - PET/CT: TNM staging and findings extraction
   - Biopsy: Histopathology and biomarker analysis

4. **Report Processor** (`app/report_processor.py`)
   - Orchestrates the complete pipeline
   - TiDB integration with vector embeddings
   - Similar case search functionality

5. **AI Agent** (`app/ai_agent.py`)
   - Patient chat via WhatsApp
   - Doctor queries via UI
   - Intelligent medical assistance

6. **Notification Service** (`app/notification_service.py`)
   - Patient alerts for critical values
   - Appointment and medication reminders
   - Multi-channel communication (email, WhatsApp)

## API Endpoints

### Report Processing

#### POST `/api/process-emails`
Process medical reports from recent emails
```json
{
  "days": 3
}
```

#### POST `/api/process-pdf`
Process a single PDF file
```json
{
  "pdf_path": "/path/to/medical_report.pdf"
}
```

#### GET `/api/processing-summary`
Get processing statistics
```json
{
  "total_reports": 156,
  "reports_by_type": {
    "cbc": 45,
    "pet_ct": 32,
    "biopsy": 28
  },
  "recent_reports_7_days": 12,
  "total_patients": 89
}
```

### AI Agent Interactions

#### POST `/api/ai/patient-chat`
Handle patient WhatsApp messages
```json
{
  "message": "blood test results",
  "phone": "+1234567890",
  "patient_name": "John Doe"
}
```

Response:
```json
{
  "status": "success",
  "response": "🩸 *Latest Blood Test Results*\n\n🔹 WBC: 4200/µL\n🔹 Hemoglobin: 12.1 g/dL\n✅ Values appear within normal ranges."
}
```

#### POST `/api/ai/doctor-query`
Handle doctor queries with AI assistance
```json
{
  "message": "Find similar cases to 45-year-old with ER+ breast cancer",
  "doctor_id": "dr_smith"
}
```

### Search & Discovery

#### POST `/api/search/similar-cases`
Vector-based similarity search
```json
{
  "query": "breast cancer ER positive Grade 2",
  "report_type": "biopsy",
  "limit": 10
}
```

#### GET `/api/patient-history/{patient_name}`
Get complete patient medical history
```json
{
  "status": "success",
  "patient_name": "Alice Johnson",
  "history": [
    {
      "document_id": "cbc_Alice_Johnson_20241215_143022",
      "report_type": "cbc",
      "timestamp": "2024-12-15T14:30:22"
    }
  ]
}
```

### Notifications

#### POST `/api/notifications/send-alert`
Send patient alerts
```json
{
  "alert_type": "cbc_alert",
  "cbc_data": {
    "wbc": 3500,
    "flags": ["WBC low (3500/µL, normal ≥4000)"]
  },
  "patient_info": {
    "name": "John Doe",
    "email": "john@example.com",
    "contact": "+1234567890"
  },
  "contact_methods": ["email", "whatsapp"]
}
```

## Patient WhatsApp Commands

Patients can interact via WhatsApp using these commands:

- **`blood`** - Get latest blood test results
- **`scan`** - Get recent imaging results
- **`medicine`** - View current medications
- **`reports`** - List all recent reports
- **`appointment`** - Appointment help
- **`emergency`** - Emergency guidance
- **`help`** - Show all available commands

### Example Patient Interactions

**Patient**: "blood"
**AI**: 
```
🩸 *Latest Blood Test Results*

🔹 WBC: 4200/µL
🔹 Hemoglobin: 12.1 g/dL
🔹 Platelets: 180,000/µL
🔹 ANC: 2940/µL

✅ Values appear within normal ranges.

📅 Test date: 2024-12-15
```

**Patient**: "scan"
**AI**:
```
🔬 *Latest Scan Results*

Your scan shows a cancer area in the breast measuring about 2.3 cm. A nearby lymph node also shows activity, suggesting cancer may have spread there. The lungs appear clear. These findings help guide your treatment plan.

📊 *Stage:* Stage IIA

📞 Please discuss these results with your oncologist for detailed explanation and next steps.

📅 Scan date: 2024-12-10
```

## Doctor UI Queries

Doctors can make sophisticated queries:

### Similar Case Search
**Query**: "Find similar cases to 52-year-old male with lung cancer Stage III"
**Response**:
```json
{
  "type": "similar_cases",
  "cases": [
    {
      "document_id": "pet_ct_Bob_Singh_20241201",
      "similarity": 0.89,
      "patient_name": "Bob Singh",
      "report_type": "pet_ct"
    }
  ],
  "pattern_analysis": {
    "total_cases": 8,
    "average_similarity": 0.76
  }
}
```

### Patient History
**Query**: "Get patient history for Alice Johnson"
**Response**: Complete timeline of all medical reports for the patient

### AI-Powered Analysis
**Query**: "What are the treatment considerations for ER+/PR+/HER2- breast cancer with Grade 2?"
**Response**: Evidence-based treatment insights and clinical suggestions

## Configuration

### Environment Variables

```bash
# Email Configuration
GMAIL_USERNAME=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password
SMTP_FROM_NAME="OncoAssist Care Team"

# TiDB Configuration  
TIDB_HOST=your-tidb-host
TIDB_PORT=4000
TIDB_USER=your-username
TIDB_PASSWORD=your-password
TIDB_DATABASE=onco_assist

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key

# Twilio Configuration
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=your-twilio-number

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google

# Alert Thresholds
WBC_ALERT_CUTOFF=4000
ANC_ALERT_CUTOFF=1000
HEMOGLOBIN_ALERT=10.0
PLATELET_ALERT=150000

# Default Patient Contact
PATIENT_EMAIL=patient@example.com
```

## Medical Report Analysis

### CBC (Complete Blood Count) Analysis
- **WBC Count**: White blood cell monitoring
- **ANC Calculation**: Absolute neutrophil count from WBC and neutrophil %
- **Alert Generation**: Automatic alerts for values below thresholds
- **Patient Summaries**: Plain-language explanations

### PET/CT Scan Analysis
- **Primary Lesion**: Size and SUVmax extraction
- **Lymph Node Assessment**: Axillary and internal mammary nodes
- **TNM Staging**: Radiologic staging based on AJCC guidelines
- **Stage Grouping**: Automatic stage determination

### Biopsy/Histopathology Analysis
- **Histology Type**: IDC, ILC, DCIS identification
- **Grading**: Nottingham/Bloom-Richardson grade
- **Biomarkers**: ER, PR, HER2 status extraction
- **Ki-67**: Proliferation index
- **Invasion Markers**: LVI and PNI status

## Vector Embeddings & Search

The system uses OpenAI embeddings to create searchable vectors for:
- Medical report content
- Patient summaries
- Key findings and biomarkers
- Treatment responses

This enables:
- **Similar Case Discovery**: Find patients with similar presentations
- **Knowledge Retrieval**: Search across all historical data
- **Pattern Recognition**: Identify treatment trends

## Data Storage in TiDB

### Tables Structure

1. **medical_documents**: Main reports with vector embeddings
2. **patients**: Patient demographic information
3. **medicines**: Current medications and dosages
4. **medicine_prices**: Drug cost tracking
5. **patient_alerts**: Alert history and notifications

### Vector Index
```sql
CREATE VECTOR INDEX idx_embedding ON medical_documents (embedding) 
WITH (metric_type = 'cosine', dimension = 1536)
```

## Deployment

### Development
```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp .env.example .env
# Edit .env with your configuration

# Run the application
uvicorn app.main:app --reload --host 0.0.0.0 --port 3000
```

### Production
```bash
# Build Docker image
docker build -t onco-assist .

# Run with Docker Compose
docker-compose up -d
```

## Workflow Example

1. **Email Processing**:
   ```bash
   POST /api/process-emails
   # Checks last 3 days for medical emails
   # Downloads PDF attachments
   # Processes each PDF through the pipeline
   ```

2. **Report Analysis**:
   - PDF text extraction
   - Report type detection
   - Medical value extraction
   - Patient information parsing

3. **TiDB Storage**:
   - Vector embedding generation
   - Structured data storage
   - Alert rule evaluation

4. **Patient Notification**:
   - Critical value alerts via WhatsApp
   - Summary email with attachments
   - Appointment reminders

5. **Doctor Access**:
   - Similar case search
   - Patient history timeline
   - AI-powered clinical insights

## Error Handling

The system includes comprehensive error handling:
- **Graceful Degradation**: Services work independently
- **Mock Services**: Fallback when external APIs unavailable
- **Retry Logic**: Automatic retry for transient failures
- **Logging**: Detailed logging for debugging

## Security Considerations

- **Data Encryption**: All sensitive data encrypted in transit
- **Access Control**: Role-based access for doctors vs patients
- **HIPAA Compliance**: PHI handling following medical data standards
- **Audit Trails**: Complete logging of all data access and modifications

## Future Enhancements

1. **Real-time Processing**: Webhook-based instant processing
2. **Mobile Apps**: Native iOS/Android applications
3. **Clinical Decision Support**: Treatment recommendation engine
4. **Genomic Integration**: Genetic test result analysis
5. **Telemedicine**: Video consultation integration
6. **Wearable Integration**: Continuous monitoring data
7. **Multi-language Support**: International patient support

## Support

For technical support or feature requests, please contact the development team or raise an issue in the project repository.
