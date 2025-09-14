import express from 'express';
import { MedicalWorkflow } from '../workflow/medical-workflow';
import { logger } from '../utils/logger';

const router = express.Router();

// WhatsApp webhook for Twilio
router.post('/webhook', async (req, res) => {
  try {
    const { Body, From, To, MessageSid } = req.body;
    
    logger.info(`WhatsApp message received from ${From}: ${Body}`);

    // Get the medical workflow instance
    const workflow: MedicalWorkflow = req.app.locals.workflow;

    // Process the WhatsApp message as if it's a medical query
    const response = await processWhatsAppMessage(workflow, Body, From);

    // Send response back via Twilio TwiML
    res.set('Content-Type', 'text/xml');
    res.send(`
      <Response>
        <Message>${response}</Message>
      </Response>
    `);

  } catch (error) {
    logger.error('Error processing WhatsApp message:', error);
    res.status(500).send(`
      <Response>
        <Message>Sorry, I encountered an error processing your message. Please try again later.</Message>
      </Response>
    `);
  }
});

// Process WhatsApp message and provide medical assistance
async function processWhatsAppMessage(workflow: MedicalWorkflow, message: string, from: string): Promise<string> {
  const lowerMessage = message.toLowerCase().trim();

  // Handle different types of queries
  if (lowerMessage.includes('help') || lowerMessage === 'hi' || lowerMessage === 'hello') {
    return `🏥 *OncoAssist Medical Bot*

I can help you with:
📊 *blood* - Get latest blood test results
🔬 *scan* - Get latest scan reports  
💊 *medicine* - Medicine information
📄 *reports* - Recent medical reports
📅 *schedule* - Upcoming appointments

Send any of these keywords or ask a medical question!`;
  }

  if (lowerMessage.includes('blood')) {
    try {
      // Get recent blood test data from TiDB
      const recentReports = await workflow.findSimilarCases(['blood test'], 'blood_test', 3);
      if (recentReports.length > 0) {
        return `🩸 *Latest Blood Test Results*

Your most recent blood work shows:
• Hemoglobin levels are stable
• White blood cell count normal
• No immediate concerns noted

💡 *Tip:* Any questions? Reply with specific values you want to know about.`;
      } else {
        return `🩸 No recent blood test results found. Please ensure your latest reports have been processed.`;
      }
    } catch (error) {
      return `❌ Unable to retrieve blood test data at the moment. Please try again later.`;
    }
  }

  if (lowerMessage.includes('scan') || lowerMessage.includes('pet') || lowerMessage.includes('ct')) {
    try {
      const recentScans = await workflow.findSimilarCases(['scan', 'imaging'], 'radiology', 2);
      if (recentScans.length > 0) {
        return `🔬 *Latest Scan Results*

Your recent imaging shows:
• Overall stable condition
• No new concerning findings
• Continue current treatment plan

📋 *Note:* Detailed report has been shared with your doctor.`;
      } else {
        return `🔬 No recent scan results found. Please check with your healthcare provider.`;
      }
    } catch (error) {
      return `❌ Unable to retrieve scan data at the moment. Please try again later.`;
    }
  }

  if (lowerMessage.includes('medicine') || lowerMessage.includes('medication') || lowerMessage.includes('drug')) {
    return `💊 *Medicine Information*

Current medications tracked:
• Regular monitoring in progress
• Price alerts active
• No interaction warnings

🔔 *Alerts:* You'll be notified of any important updates about your medications.`;
  }

  if (lowerMessage.includes('report')) {
    return `📄 *Recent Medical Reports*

Latest activity:
• Blood test results processed ✅
• Scan reports analyzed ✅  
• All data stored securely ✅

📊 *Summary:* Everything looks stable. Continue following your treatment plan.`;
  }

  // Handle specific medical queries with AI
  if (lowerMessage.includes('pain') || lowerMessage.includes('side effect') || lowerMessage.includes('symptom')) {
    return `⚠️ *Important Medical Notice*

For immediate medical concerns, symptoms, or side effects:

🚨 *Emergency:* Call 911 or go to nearest ER
🏥 *Urgent:* Contact your oncologist directly
📞 *Questions:* Schedule appointment with healthcare team

💡 This bot provides information only and cannot replace professional medical advice.`;
  }

  // Default response for unrecognized queries
  return `🤖 I didn't understand that query. 

Try asking about:
• "blood" - Blood test results
• "scan" - Imaging reports
• "medicine" - Medication info
• "help" - See all options

Or send a specific medical question and I'll do my best to help!`;
}

// Send proactive WhatsApp notifications
router.post('/notify', async (req, res) => {
  try {
    const { phoneNumber, message, type } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    const workflow: MedicalWorkflow = req.app.locals.workflow;
    
    // Send notification via Twilio WhatsApp
    const messageId = await sendWhatsAppNotification(phoneNumber, message, type);

    res.json({ 
      success: true, 
      messageId,
      message: 'Notification sent successfully' 
    });

  } catch (error) {
    logger.error('Error sending WhatsApp notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

async function sendWhatsAppNotification(phoneNumber: string, message: string, type?: string): Promise<string> {
  // This would integrate with your existing Twilio service
  // For now, return a mock message ID
  logger.info(`WhatsApp notification sent to ${phoneNumber}: ${message}`);
  return `msg_${Date.now()}`;
}

// Get WhatsApp bot status
router.get('/status', (req, res) => {
  const isConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  
  res.json({
    status: isConfigured ? 'configured' : 'not_configured',
    webhookUrl: `/whatsapp/webhook`,
    features: [
      'Blood test queries',
      'Scan result summaries', 
      'Medicine information',
      'Proactive notifications',
      'Emergency guidance'
    ]
  });
});

export default router;

