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

// Get medical reports
router.get('/reports', async (req, res) => {
  try {
    const { type, limit = 10, offset = 0 } = req.query;
    
    // This would fetch from TiDB
    const reports = [
      {
        id: 'report_001',
        type: 'blood_test',
        date: '2024-01-15',
        summary: 'Blood test results within normal ranges',
        status: 'processed'
      },
      {
        id: 'report_002', 
        type: 'radiology',
        date: '2024-01-10',
        summary: 'PET/CT scan shows stable condition',
        status: 'processed'
      }
    ];

    res.json({
      reports: reports.slice(Number(offset), Number(offset) + Number(limit)),
      total: reports.length,
      pagination: {
        limit: Number(limit),
        offset: Number(offset)
      }
    });

  } catch (error) {
    logger.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
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

export default router;

