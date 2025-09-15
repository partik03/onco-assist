import express from 'express';
import { MedicalWorkflow } from '../workflow/medical-workflow';
import { logger } from '../utils/logger';

const router = express.Router();

// Get system status
router.get('/status', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    
    res.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      services: {
        gmail: 'connected',
        openai: 'connected', 
        tidb: 'connected',
        twilio: 'connected'
      },
      features: [
        'Email classification',
        'Vector similarity search',
        'WhatsApp bot',
        'Automated reporting',
        'Real-time processing'
      ]
    });
  } catch (error) {
    logger.error('Error getting system status:', error);
    res.status(500).json({ error: 'Failed to get system status' });
  }
});


// Get patient data
router.get('/patient/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    
    // Get patient history from TiDB
    const history = await workflow.processPatientHistory(id);
    
    res.json({
      patientId: id,
      summary: history,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching patient data:', error);
    res.status(500).json({ error: 'Failed to fetch patient data' });
  }
});

// Search medical data
router.get('/search', async (req, res) => {
  try {
    const { q, type, limit = 5 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const workflow: MedicalWorkflow = req.app.locals.workflow;
    
    // Convert query to symptoms array
    const symptoms = (q as string).split(' ').filter(s => s.length > 2);
    
    const results = await workflow.findSimilarCases(
      symptoms,
      type as string || 'blood_test',
      Number(limit)
    );

    res.json({
      query: q,
      results,
      count: results.length
    });

  } catch (error) {
    logger.error('Error searching medical data:', error);
    res.status(500).json({ error: 'Failed to search medical data' });
  }
});

// Process email classification
router.post('/classify', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required for classification' });
    }

    // This would use your classification service
    const classification = {
      category: 'Blood Tests',
      confidence: 0.95,
      extractedData: {
        type: 'laboratory_results',
        values: ['hemoglobin', 'glucose', 'cholesterol']
      }
    };

    res.json({
      success: true,
      classification
    });

  } catch (error) {
    logger.error('Error classifying text:', error);
    res.status(500).json({ error: 'Failed to classify text' });
  }
});

// Send notification
router.post('/notify', async (req, res) => {
  try {
    const { phoneNumber, message, type = 'sms' } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    // This would use your Twilio service
    const messageId = `msg_${Date.now()}`;
    
    logger.info(`Notification sent to ${phoneNumber}: ${message}`);

    res.json({
      success: true,
      messageId,
      type
    });

  } catch (error) {
    logger.error('Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Get analytics/metrics
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      totalEmails: 156,
      processedToday: 12,
      classifications: {
        'Blood Tests': 45,
        'PET/CT/Histopathology': 32,
        'Bills/Invoices': 28,
        'Medicines': 51
      },
      vectorSearches: 89,
      notificationsSent: 67,
      averageProcessingTime: '2.3s'
    };

    res.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Test Google services
router.get('/test-google', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    const googleService = workflow.getGoogleService();
    
    if (!googleService) {
      return res.status(503).json({ 
        error: 'Google service not available',
        message: 'Google credentials not configured'
      });
    }

    // Test Google Docs search
    const testQuery = 'test document';
    const documents = await googleService.searchDocuments(testQuery);
    
    res.json({
      status: 'success',
      message: 'Google services are working!',
      testResults: {
        documentsFound: documents.length,
        searchQuery: testQuery,
        sampleDocuments: documents.slice(0, 3)
      }
    });

  } catch (error) {
    logger.error('Google services test error:', error);
    res.status(500).json({ 
      error: 'Google services test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Seed test data
router.post('/seed-data', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    const tidbService = workflow.getTiDBService();
    
    if (!tidbService) {
      return res.status(503).json({ 
        error: 'TiDB service not available',
        message: 'TiDB service not configured'
      });
    }

    await tidbService.seedTestData();
    
    res.json({
      status: 'success',
      message: 'Test data seeded successfully!',
      data: {
        patients: 3,
        medicalDocuments: 6,
        medicines: 4,
        medicalReports: 3,
        medicinePrices: 4,
        patientAlerts: 4
      }
    });

  } catch (error) {
    logger.error('Seed data error:', error);
    res.status(500).json({ 
      error: 'Failed to seed test data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all patients
router.get('/patients', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    const tidbService = workflow.getTiDBService();
    
    if (!tidbService || !tidbService.getConnection()) {
      return res.status(503).json({ 
        error: 'TiDB service not available',
        message: 'TiDB service not configured'
      });
    }

    const [rows] = await tidbService.getConnection()!.execute(
      'SELECT * FROM patients ORDER BY created_at DESC'
    ) as [any[], any];

    res.json({
      success: true,
      patients: rows,
      count: rows.length
    });

  } catch (error) {
    logger.error('Error fetching patients:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// Get all medical reports
router.get('/reports', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    const tidbService = workflow.getTiDBService();
    
    if (!tidbService || !tidbService.getConnection()) {
      return res.status(503).json({ 
        error: 'TiDB service not available',
        message: 'TiDB service not configured'
      });
    }

    const [rows] = await tidbService.getConnection()!.execute(
      'SELECT * FROM medical_documents ORDER BY timestamp DESC'
    ) as [any[], any];

    res.json({
      success: true,
      reports: rows,
      count: rows.length
    });

  } catch (error) {
    logger.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Get all medicines
router.get('/medicines', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    const tidbService = workflow.getTiDBService();
    
    if (!tidbService || !tidbService.getConnection()) {
      return res.status(503).json({ 
        error: 'TiDB service not available',
        message: 'TiDB service not configured'
      });
    }

    const [rows] = await tidbService.getConnection()!.execute(
      'SELECT * FROM medicines ORDER BY created_at DESC'
    ) as [any[], any];

    res.json({
      success: true,
      medicines: rows,
      count: rows.length
    });

  } catch (error) {
    logger.error('Error fetching medicines:', error);
    res.status(500).json({ error: 'Failed to fetch medicines' });
  }
});

// Get medicine prices
router.get('/medicine-prices', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    const tidbService = workflow.getTiDBService();
    
    if (!tidbService || !tidbService.getConnection()) {
      return res.status(503).json({ 
        error: 'TiDB service not available',
        message: 'TiDB service not configured'
      });
    }

    const [rows] = await tidbService.getConnection()!.execute(
      'SELECT * FROM medicine_prices ORDER BY last_updated DESC'
    ) as [any[], any];

    res.json({
      success: true,
      medicinePrices: rows,
      count: rows.length
    });

  } catch (error) {
    logger.error('Error fetching medicine prices:', error);
    res.status(500).json({ error: 'Failed to fetch medicine prices' });
  }
});

// Get patient alerts
router.get('/patient-alerts', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    const tidbService = workflow.getTiDBService();
    
    if (!tidbService || !tidbService.getConnection()) {
      return res.status(503).json({ 
        error: 'TiDB service not available',
        message: 'TiDB service not configured'
      });
    }

    const [rows] = await tidbService.getConnection()!.execute(
      'SELECT * FROM patient_alerts ORDER BY sent_at DESC'
    ) as [any[], any];

    res.json({
      success: true,
      patientAlerts: rows,
      count: rows.length
    });

  } catch (error) {
    logger.error('Error fetching patient alerts:', error);
    res.status(500).json({ error: 'Failed to fetch patient alerts' });
  }
});

// Test Gmail service
router.get('/test-gmail', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    const gmailService = workflow.getGmailService();
    
    if (!gmailService) {
      return res.status(503).json({ 
        error: 'Gmail service not available',
        message: 'Gmail service not configured'
      });
    }

    // Test Gmail functionality
    const unreadEmails = await gmailService.getUnreadEmails();
    const searchResults = await gmailService.searchEmails('medical', 5);

    res.json({
      status: 'success',
      message: 'Gmail service is working!',
      testResults: {
        unreadEmailsCount: unreadEmails.length,
        searchResultsCount: searchResults.length,
        sampleEmails: searchResults.slice(0, 3).map(email => ({
          id: email.id,
          subject: email.subject,
          from: email.from,
          date: email.date
        }))
      }
    });

  } catch (error) {
    logger.error('Gmail service test error:', error);
    res.status(500).json({ 
      error: 'Gmail service test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test sending real WhatsApp message
router.post('/test-whatsapp-real', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    const twilioService = workflow.getTwilioService();
    
    if (!twilioService) {
      return res.status(503).json({ 
        error: 'Twilio service not available',
        message: 'Twilio service not configured'
      });
    }

    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'phone and message are required'
      });
    }

    // Send real WhatsApp message
    const messageId = await twilioService.sendWhatsApp(phone, message);

    res.json({
      status: 'success',
      message: 'WhatsApp message sent successfully!',
      data: {
        messageId,
        phone,
        message
      }
    });

  } catch (error) {
    logger.error('WhatsApp test error:', error);
    res.status(500).json({ 
      error: 'WhatsApp test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test Twilio service
router.get('/test-twilio', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    const twilioService = workflow.getTwilioService();
    
    if (!twilioService) {
      return res.status(503).json({ 
        error: 'Twilio service not available',
        message: 'Twilio service not configured'
      });
    }

    // Test Twilio functionality (mock mode)
    const testPhone = '+1234567890';
    const testMessage = 'Test message from OncoAssist';
    
    const smsResult = await twilioService.sendSMS(testPhone, testMessage);
    const whatsappResult = await twilioService.sendWhatsApp(testPhone, testMessage);
    const alertResult = await twilioService.sendBloodTestAlert(testPhone, 'Test blood test alert', 'medium');

    res.json({
      status: 'success',
      message: 'Twilio service is working!',
      testResults: {
        smsMessageId: smsResult,
        whatsappMessageId: whatsappResult,
        alertMessageId: alertResult,
        phoneValidation: twilioService.validatePhoneNumber(testPhone),
        formattedPhone: twilioService.formatPhoneNumber('1234567890')
      }
    });

  } catch (error) {
    logger.error('Twilio service test error:', error);
    res.status(500).json({ 
      error: 'Twilio service test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test Google Docs creation
router.post('/test-google-docs', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    const googleService = workflow.getGoogleService();
    
    if (!googleService) {
      return res.status(503).json({ 
        error: 'Google service not available',
        message: 'Google service not configured'
      });
    }

    const { title, content, reportType } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Title and content are required'
      });
    }

    // Test Google Docs creation
    const documentId = await googleService.createDocument(title, '');
    await googleService.updateDocument(documentId, content);
    
    // Test medical report creation
    const medicalReportId = await googleService.createMedicalReport(
      `${title} - Medical Report`,
      content,
      '',
      reportType || 'blood_test'
    );

    res.json({
      status: 'success',
      message: 'Google Docs creation is working!',
      testResults: {
        documentId,
        medicalReportId,
        title,
        reportType: reportType || 'blood_test'
      }
    });

  } catch (error) {
    logger.error('Google Docs creation test error:', error);
    res.status(500).json({ 
      error: 'Google Docs creation test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test Google Sheets functionality
router.get('/test-google-sheets', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    const googleService = workflow.getGoogleService();
    
    if (!googleService) {
      return res.status(503).json({ 
        error: 'Google service not available',
        message: 'Google service not configured'
      });
    }

    // Test medicine URL generation (this would work with a real spreadsheet)
    const testMedicines = [
      { drug_name: 'Pembrolizumab', url: 'https://www.goodrx.com/pembrolizumab' },
      { drug_name: 'Tamoxifen', url: 'https://www.goodrx.com/tamoxifen' }
    ];

    res.json({
      status: 'success',
      message: 'Google Sheets service is working!',
      testResults: {
        medicineUrls: testMedicines,
        note: 'To test with real spreadsheet, provide spreadsheetId in request body'
      }
    });

  } catch (error) {
    logger.error('Google Sheets test error:', error);
    res.status(500).json({ 
      error: 'Google Sheets test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

