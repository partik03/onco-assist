import twilio from 'twilio';
import { TwilioCredentials } from '../types';
import { logger } from '../utils/logger';

export class TwilioService {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor(credentials: TwilioCredentials) {
    this.client = twilio(credentials.accountSid, credentials.authToken);
    this.fromNumber = credentials.fromNumber;
  }

  async sendSMS(to: string, message: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: to
      });

      logger.info(`SMS sent to ${to}: ${response.sid}`);
      return response.sid;
    } catch (error) {
      logger.error(`Failed to send SMS to ${to}:`, error);
      throw error;
    }
  }

  async sendWhatsApp(to: string, message: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        body: message,
        from: `whatsapp:${this.fromNumber}`,
        to: `whatsapp:${to}`
      });

      logger.info(`WhatsApp message sent to ${to}: ${response.sid}`);
      return response.sid;
    } catch (error) {
      logger.error(`Failed to send WhatsApp message to ${to}:`, error);
      throw error;
    }
  }

  async sendMMS(to: string, message: string, mediaUrl?: string): Promise<string> {
    try {
      const messageOptions: any = {
        body: message,
        from: this.fromNumber,
        to: to
      };

      if (mediaUrl) {
        messageOptions.mediaUrl = mediaUrl;
      }

      const response = await this.client.messages.create(messageOptions);

      logger.info(`MMS sent to ${to}: ${response.sid}`);
      return response.sid;
    } catch (error) {
      logger.error(`Failed to send MMS to ${to}:`, error);
      throw error;
    }
  }

  // Specific medical alert methods
  async sendScanResultAlert(to: string, reportSummary: string): Promise<string> {
    const message = `🏥 Medical Alert: Your scan results are ready. ${reportSummary}. Please discuss with your doctor for detailed explanation.`;
    return await this.sendSMS(to, message);
  }

  async sendBloodTestAlert(to: string, alertMessage: string, severity: 'low' | 'medium' | 'high'): Promise<string> {
    const urgencyEmoji = severity === 'high' ? '🚨' : severity === 'medium' ? '⚠️' : 'ℹ️';
    const message = `${urgencyEmoji} Blood Test Alert: ${alertMessage}`;
    return await this.sendSMS(to, message);
  }

  async sendBillReadyAlert(to: string): Promise<string> {
    const message = `💰 Bill Alert: Hello, we've compiled your weekly bills into a draft and they are ready for your review and send.`;
    return await this.sendSMS(to, message);
  }

  async sendMedicineInfoAlert(to: string, medicineInfo: string): Promise<string> {
    const message = `💊 Medicine Update: ${medicineInfo}`;
    return await this.sendSMS(to, message);
  }

  async sendGeneralMedicalAlert(to: string, message: string, useWhatsApp: boolean = false): Promise<string> {
    if (useWhatsApp) {
      return await this.sendWhatsApp(to, message);
    } else {
      return await this.sendSMS(to, message);
    }
  }

  // Batch messaging for multiple alerts
  async sendBatchAlerts(
    recipients: Array<{phone: string, message: string, type?: 'sms' | 'whatsapp'}>
  ): Promise<Array<{phone: string, messageId: string, success: boolean}>> {
    const results = [];

    for (const recipient of recipients) {
      try {
        let messageId: string;
        
        if (recipient.type === 'whatsapp') {
          messageId = await this.sendWhatsApp(recipient.phone, recipient.message);
        } else {
          messageId = await this.sendSMS(recipient.phone, recipient.message);
        }

        results.push({
          phone: recipient.phone,
          messageId,
          success: true
        });
      } catch (error) {
        logger.error(`Failed to send message to ${recipient.phone}:`, error);
        results.push({
          phone: recipient.phone,
          messageId: '',
          success: false
        });
      }

      // Add delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  // Message status checking
  async getMessageStatus(messageSid: string): Promise<string> {
    try {
      const message = await this.client.messages(messageSid).fetch();
      return message.status;
    } catch (error) {
      logger.error(`Failed to get message status for ${messageSid}:`, error);
      throw error;
    }
  }

  // Validate phone number format
  validatePhoneNumber(phoneNumber: string): boolean {
    // Basic validation for international format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  // Format phone number to E.164 format
  formatPhoneNumber(phoneNumber: string, countryCode: string = '+1'): string {
    // Remove all non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it doesn't start with country code, add it
    if (!cleaned.startsWith(countryCode.replace('+', ''))) {
      return `${countryCode}${cleaned}`;
    }
    
    return `+${cleaned}`;
  }
}