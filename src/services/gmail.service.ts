import { google } from 'googleapis';
import { GoogleCredentials, EmailData, EmailAttachment } from '../types';
import { logger } from '../utils/logger';

export class GmailService {
  private gmail: any;
  private credentials: GoogleCredentials;

  constructor(credentials: GoogleCredentials) {
    this.credentials = credentials;
    this.initializeGmail();
  }

  private initializeGmail(): void {
    const oauth2Client = new google.auth.OAuth2(
      this.credentials.clientId,
      this.credentials.clientSecret
    );

    oauth2Client.setCredentials({
      refresh_token: this.credentials.refreshToken,
      access_token: this.credentials.accessToken
    });

    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  }

  async getUnreadEmails(): Promise<EmailData[]> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 10
      });

      if (!response.data.messages) {
        return [];
      }

      const emails: EmailData[] = [];
      
      for (const message of response.data.messages) {
        const emailData = await this.getEmailById(message.id);
        if (emailData) {
          emails.push(emailData);
        }
      }

      return emails;
    } catch (error) {
      logger.error('Failed to get unread emails:', error);
      throw error;
    }
  }

  async getEmailById(messageId: string): Promise<EmailData | null> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      const headers = message.payload.headers;
      
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
      const from = headers.find((h: any) => h.name === 'From')?.value || '';
      const date = headers.find((h: any) => h.name === 'Date')?.value || '';

      // Extract email body
      let text = '';
      const attachments: EmailAttachment[] = [];

      if (message.payload.body.data) {
        text = Buffer.from(message.payload.body.data, 'base64').toString();
      } else if (message.payload.parts) {
        for (const part of message.payload.parts) {
          if (part.mimeType === 'text/plain' && part.body.data) {
            text += Buffer.from(part.body.data, 'base64').toString();
          } else if (part.filename && part.body.attachmentId) {
            // Handle attachments
            const attachment = await this.getAttachment(messageId, part.body.attachmentId);
            if (attachment) {
              attachments.push({
                filename: part.filename,
                content: attachment,
                contentType: part.mimeType || 'application/octet-stream'
              });
            }
          }
        }
      }

      return {
        id: messageId,
        subject,
        text,
        from,
        date,
        attachments: attachments.length > 0 ? attachments : undefined
      };
    } catch (error) {
      logger.error(`Failed to get email ${messageId}:`, error);
      return null;
    }
  }

  private async getAttachment(messageId: string, attachmentId: string): Promise<Buffer | null> {
    try {
      const response = await this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId
      });

      if (response.data.data) {
        return Buffer.from(response.data.data, 'base64');
      }
      return null;
    } catch (error) {
      logger.error(`Failed to get attachment ${attachmentId}:`, error);
      return null;
    }
  }

  async addLabel(messageId: string, labelName: string): Promise<void> {
    try {
      // First, check if label exists, if not create it
      const labelsResponse = await this.gmail.users.labels.list({ userId: 'me' });
      let labelId = labelsResponse.data.labels.find(
        (label: any) => label.name === labelName
      )?.id;

      if (!labelId) {
        const createResponse = await this.gmail.users.labels.create({
          userId: 'me',
          requestBody: {
            name: labelName,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show'
          }
        });
        labelId = createResponse.data.id;
      }

      // Add label to message
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: [labelId]
        }
      });

      logger.info(`Added label ${labelName} to message ${messageId}`);
    } catch (error) {
      logger.error(`Failed to add label ${labelName} to message ${messageId}:`, error);
      throw error;
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });

      logger.info(`Marked message ${messageId} as read`);
    } catch (error) {
      logger.error(`Failed to mark message ${messageId} as read:`, error);
      throw error;
    }
  }

  async createDraft(to: string, subject: string, body: string): Promise<string> {
    try {
      const raw = this.createRawEmail(to, subject, body);
      
      const response = await this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw: raw
          }
        }
      });

      logger.info(`Created draft with ID: ${response.data.id}`);
      return response.data.id;
    } catch (error) {
      logger.error('Failed to create draft:', error);
      throw error;
    }
  }

  private createRawEmail(to: string, subject: string, body: string): string {
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\n');

    return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  }

  async searchEmails(query: string, maxResults: number = 10): Promise<EmailData[]> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults
      });

      if (!response.data.messages) {
        return [];
      }

      const emails: EmailData[] = [];
      
      for (const message of response.data.messages) {
        const emailData = await this.getEmailById(message.id);
        if (emailData) {
          emails.push(emailData);
        }
      }

      return emails;
    } catch (error) {
      logger.error(`Failed to search emails with query "${query}":`, error);
      throw error;
    }
  }

  // Method to check for new emails every hour (like the n8n trigger)
  async pollForNewEmails(lastCheckTime?: Date): Promise<EmailData[]> {
    try {
      let query = 'is:unread';
      
      if (lastCheckTime) {
        const timestamp = Math.floor(lastCheckTime.getTime() / 1000);
        query += ` after:${timestamp}`;
      }

      return await this.searchEmails(query);
    } catch (error) {
      logger.error('Failed to poll for new emails:', error);
      throw error;
    }
  }
}