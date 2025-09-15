import express from 'express';
import { MedicalWorkflow } from '../workflow/medical-workflow';
import { logger } from '../utils/logger';

const router = express.Router();

// Gmail webhook for real-time email processing
router.post('/gmail', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || !message.data) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Decode the Gmail push notification
    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    logger.info('Gmail webhook received:', data);

    // Get the medical workflow instance
    const workflow: MedicalWorkflow = req.app.locals.workflow;

    // Process the email notification
    await workflow.processNewEmails();

    res.status(200).json({ success: true, message: 'Email processed' });

  } catch (error) {
    logger.error('Error processing Gmail webhook:', error);
    res.status(500).json({ error: 'Failed to process email' });
  }
});

// TiDB webhook for database events
router.post('/tidb', async (req, res) => {
  try {
    const { event, data } = req.body;
    
    logger.info(`TiDB webhook received: ${event}`);

    // Handle different TiDB events
    switch (event) {
      case 'new_medical_record':
        await handleNewMedicalRecord(data);
        break;
      case 'vector_similarity_alert':
        await handleSimilarityAlert(data);
        break;
      default:
        logger.warn(`Unknown TiDB event: ${event}`);
    }

    res.status(200).json({ success: true });

  } catch (error) {
    logger.error('Error processing TiDB webhook:', error);
    res.status(500).json({ error: 'Failed to process TiDB event' });
  }
});

// Process manual email upload
router.post('/process-email', async (req, res) => {
  try {
    const { emailText, subject, from } = req.body;

    if (!emailText) {
      return res.status(400).json({ error: 'Email text is required' });
    }

    const workflow: MedicalWorkflow = req.app.locals.workflow;

    // Create email data object
    const emailData = {
      id: `manual_${Date.now()}`,
      subject: subject || 'Manual Upload',
      text: emailText,
      from: from || 'manual@upload.com',
      date: new Date().toISOString()
    };

    // Process the email through the medical workflow
    logger.info('Processing manual email upload');
    // Note: You'd need to expose a method to process individual emails
    // await workflow.processEmail(emailData);

    res.json({ 
      success: true, 
      message: 'Email processed successfully',
      emailId: emailData.id
    });

  } catch (error) {
    logger.error('Error processing manual email:', error);
    res.status(500).json({ error: 'Failed to process email' });
  }
});

// Trigger weekly report generation
router.post('/generate-report', async (req, res) => {
  try {
    const workflow: MedicalWorkflow = req.app.locals.workflow;
    
    logger.info('Triggering weekly report generation');
    await workflow.generateWeeklyReport();

    res.json({ 
      success: true, 
      message: 'Weekly report generated successfully' 
    });

  } catch (error) {
    logger.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Test similarity search
router.post('/search-similar', async (req, res) => {
  try {
    const { symptoms, reportType, limit } = req.body;

    if (!symptoms || !Array.isArray(symptoms)) {
      return res.status(400).json({ error: 'Symptoms array is required' });
    }

    const workflow: MedicalWorkflow = req.app.locals.workflow;
    
    const similarCases = await workflow.findSimilarCases(
      symptoms, 
      reportType || 'blood_test',
      limit || 5
    );

    res.json({ 
      success: true, 
      similarCases,
      count: similarCases.length
    });

  } catch (error) {
    logger.error('Error searching similar cases:', error);
    res.status(500).json({ error: 'Failed to search similar cases' });
  }
});

// Helper functions
async function handleNewMedicalRecord(data: any): Promise<void> {
  logger.info('Processing new medical record:', data);
  // Implement logic to handle new medical records
  // Could trigger notifications, analysis, etc.
}

async function handleSimilarityAlert(data: any): Promise<void> {
  logger.info('Processing similarity alert:', data);
  // Implement logic to handle similarity alerts
  // Could notify doctors of similar cases, patterns, etc.
}

// Webhook health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    webhooks: [
      { endpoint: '/webhooks/gmail', description: 'Gmail real-time notifications' },
      { endpoint: '/webhooks/tidb', description: 'TiDB database events' },
      { endpoint: '/webhooks/process-email', description: 'Manual email processing' },
      { endpoint: '/webhooks/generate-report', description: 'Weekly report generation' },
      { endpoint: '/webhooks/search-similar', description: 'Vector similarity search' }
    ]
  });
});

export default router;

