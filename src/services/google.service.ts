import { google } from 'googleapis';
import { GoogleCredentials } from '../types';
import { logger } from '../utils/logger';

export class GoogleService {
  private docs: any;
  private sheets: any;
  private drive: any;
  private oauth2Client: any;

  constructor(credentials: GoogleCredentials) {
    this.oauth2Client = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret
    );

    this.oauth2Client.setCredentials({
      refresh_token: credentials.refreshToken,
      access_token: credentials.accessToken
    });

    this.docs = google.docs({ version: 'v1', auth: this.oauth2Client });
    this.sheets = google.sheets({ version: 'v4', auth: this.oauth2Client });
    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  // Google Docs operations
  async createDocument(title: string, folderId: string): Promise<string> {
    try {
      // Create document
      const docResponse = await this.docs.documents.create({
        requestBody: {
          title: title
        }
      });

      const documentId = docResponse.data.documentId;

      // Move to folder if specified
      if (folderId) {
        await this.drive.files.update({
          fileId: documentId,
          addParents: folderId,
          removeParents: 'root'
        });
      }

      logger.info(`Created document: ${title} with ID: ${documentId}`);
      return documentId;
    } catch (error) {
      logger.error(`Failed to create document ${title}:`, error);
      throw error;
    }
  }

  async updateDocument(documentId: string, content: string): Promise<void> {
    try {
      await this.docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: {
                  index: 1
                },
                text: content
              }
            }
          ]
        }
      });

      logger.info(`Updated document ${documentId}`);
    } catch (error) {
      logger.error(`Failed to update document ${documentId}:`, error);
      throw error;
    }
  }

  async searchDocuments(query: string): Promise<any[]> {
    try {
      const response = await this.drive.files.list({
        q: `name contains '${query}' and mimeType='application/vnd.google-apps.document'`,
        fields: 'files(id, name, createdTime, modifiedTime)'
      });

      return response.data.files || [];
    } catch (error) {
      logger.error(`Failed to search documents with query ${query}:`, error);
      throw error;
    }
  }

  // Google Sheets operations
  async getSheetData(spreadsheetId: string, range?: string): Promise<any[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: range || 'Sheet1'
      });

      return response.data.values || [];
    } catch (error) {
      logger.error(`Failed to get sheet data from ${spreadsheetId}:`, error);
      throw error;
    }
  }

  async updateSheetRow(
    spreadsheetId: string, 
    sheetName: string, 
    rowData: any, 
    matchColumn?: string
  ): Promise<void> {
    try {
      // Get current data to find matching row
      const currentData = await this.getSheetData(spreadsheetId, sheetName);
      
      if (currentData.length === 0) {
        // No data, just append
        await this.appendToSheet(spreadsheetId, sheetName, [Object.values(rowData)]);
        return;
      }

      const headers = currentData[0];
      let rowIndex = -1;

      if (matchColumn && rowData[matchColumn]) {
        const matchColumnIndex = headers.indexOf(matchColumn);
        if (matchColumnIndex >= 0) {
          for (let i = 1; i < currentData.length; i++) {
            if (currentData[i][matchColumnIndex] === rowData[matchColumn]) {
              rowIndex = i;
              break;
            }
          }
        }
      }

      const values = headers.map((header: string) => rowData[header] || '');

      if (rowIndex >= 0) {
        // Update existing row
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: spreadsheetId,
          range: `${sheetName}!A${rowIndex + 1}:${String.fromCharCode(65 + headers.length - 1)}${rowIndex + 1}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [values]
          }
        });
      } else {
        // Append new row
        await this.appendToSheet(spreadsheetId, sheetName, [values]);
      }

      logger.info(`Updated sheet ${spreadsheetId} with row data`);
    } catch (error) {
      logger.error(`Failed to update sheet row in ${spreadsheetId}:`, error);
      throw error;
    }
  }

  async appendToSheet(spreadsheetId: string, sheetName: string, values: any[][]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: sheetName,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: values
        }
      });

      logger.info(`Appended ${values.length} rows to ${spreadsheetId}`);
    } catch (error) {
      logger.error(`Failed to append to sheet ${spreadsheetId}:`, error);
      throw error;
    }
  }

  // Medicine tracking specific methods
  async getMedicineUrls(spreadsheetId: string): Promise<Array<{drug_name: string, url: string}>> {
    try {
      const data = await this.getSheetData(spreadsheetId);
      
      if (data.length === 0) return [];

      const headers = data[0];
      const urlColumnIndex = headers.indexOf('url');
      
      if (urlColumnIndex === -1) return [];

      const medicines: Array<{drug_name: string, url: string}> = [];

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const baseUrl = row[urlColumnIndex] || 'https://www.goodrx.com';

        // Check each column for medicine names (skip 'row_number' and 'url' columns)
        for (let j = 0; j < headers.length; j++) {
          const header = headers[j];
          if (header === 'row_number' || header === 'url') continue;

          const cellValue = row[j];
          if (cellValue && cellValue.trim()) {
            const drugName = header.trim();
            const slug = this.toSlug(drugName);
            medicines.push({
              drug_name: drugName,
              url: `${baseUrl}/${encodeURIComponent(slug)}`
            });
          }
        }
      }

      return medicines;
    } catch (error) {
      logger.error(`Failed to get medicine URLs from ${spreadsheetId}:`, error);
      return [];
    }
  }

  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  async updateMedicineSheet(
    spreadsheetId: string, 
    sheetName: string, 
    medicines: Array<{drug_name: string, url: string}>
  ): Promise<void> {
    try {
      for (const medicine of medicines) {
        await this.updateSheetRow(
          spreadsheetId,
          sheetName,
          { [medicine.drug_name]: medicine.url },
          medicine.drug_name
        );
      }

      logger.info(`Updated medicine sheet with ${medicines.length} entries`);
    } catch (error) {
      logger.error('Failed to update medicine sheet:', error);
      throw error;
    }
  }

  // Document management for medical reports
  async createMedicalReport(
    title: string, 
    content: string, 
    folderId: string, 
    reportType: string
  ): Promise<string> {
    try {
      const documentId = await this.createDocument(title, folderId);
      
      // Format content based on report type
      let formattedContent = content;
      if (reportType === 'blood_test') {
        formattedContent = this.formatBloodTestContent(content);
      } else if (reportType === 'radiology') {
        formattedContent = this.formatRadiologyContent(content);
      }

      await this.updateDocument(documentId, formattedContent);
      
      return documentId;
    } catch (error) {
      logger.error(`Failed to create medical report ${title}:`, error);
      throw error;
    }
  }

  private formatBloodTestContent(content: string): string {
    // Add specific formatting for blood test reports
    return `BLOOD TEST REPORT\n\n${content}\n\nGenerated on: ${new Date().toISOString()}`;
  }

  private formatRadiologyContent(content: string): string {
    // Add specific formatting for radiology reports
    return `RADIOLOGY REPORT\n\n${content}\n\nGenerated on: ${new Date().toISOString()}`;
  }

  async findExistingDocument(title: string): Promise<string | null> {
    try {
      const documents = await this.searchDocuments(title);
      return documents.length > 0 ? documents[0].id : null;
    } catch (error) {
      logger.error(`Failed to find existing document ${title}:`, error);
      return null;
    }
  }
}
