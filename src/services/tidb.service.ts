import mysql from 'mysql2/promise';
import { TiDBCredentials, VectorDocument, SearchResult, MedicalReport } from '../types';
import { logger } from '../utils/logger';

export class TiDBService {
  private connection: mysql.Connection | null = null;
  private credentials: TiDBCredentials;

  constructor(credentials: TiDBCredentials) {
    this.credentials = credentials;
  }

  async connect(): Promise<void> {
    try {
      this.connection = await mysql.createConnection({
        host: this.credentials.host,
        port: this.credentials.port,
        user: this.credentials.user,
        password: this.credentials.password,
        database: this.credentials.database,
        ssl: this.credentials.ssl,
        connectTimeout: 60000,
        acquireTimeout: 60000,
        timeout: 60000,
      });

      logger.info('Successfully connected to TiDB');
      await this.initializeTables();
    } catch (error) {
      logger.error('Failed to connect to TiDB:', error);
      throw error;
    }
  }

  private async initializeTables(): Promise<void> {
    if (!this.connection) throw new Error('No TiDB connection');

    try {
      // Create medical_documents table with vector column
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS medical_documents (
          id VARCHAR(255) PRIMARY KEY,
          content LONGTEXT NOT NULL,
          embedding VECTOR(1536) NOT NULL,
          type ENUM('radiology', 'blood_test', 'invoice', 'medicine') NOT NULL,
          source VARCHAR(500) NOT NULL,
          patient_name VARCHAR(255),
          patient_id VARCHAR(255),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          metadata JSON,
          INDEX idx_type (type),
          INDEX idx_timestamp (timestamp),
          INDEX idx_patient (patient_id),
          VECTOR INDEX idx_embedding (embedding)
        )
      `);

      // Create medical_reports table for processed reports
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS medical_reports (
          id VARCHAR(255) PRIMARY KEY,
          type ENUM('radiology', 'blood_test', 'invoice', 'medicine') NOT NULL,
          original_email_id VARCHAR(255) NOT NULL,
          processed_content JSON NOT NULL,
          doctor_summary TEXT,
          patient_summary TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          google_doc_id VARCHAR(255),
          INDEX idx_type (type),
          INDEX idx_email (original_email_id),
          INDEX idx_created (created_at)
        )
      `);

      // Create medicine_prices table for tracking drug pricing
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS medicine_prices (
          id INT AUTO_INCREMENT PRIMARY KEY,
          drug_name VARCHAR(255) NOT NULL,
          url VARCHAR(500),
          lowest_price VARCHAR(100),
          price_update_date DATE,
          drug_description TEXT,
          savings_program TEXT,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_drug_name (drug_name),
          INDEX idx_price_update (price_update_date)
        )
      `);

      // Create patient_alerts table for notifications
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS patient_alerts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          patient_phone VARCHAR(20) NOT NULL,
          message TEXT NOT NULL,
          alert_type ENUM('scan_result', 'blood_test', 'bill_ready', 'medicine_info') NOT NULL,
          severity ENUM('low', 'medium', 'high') DEFAULT 'medium',
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          report_id VARCHAR(255),
          INDEX idx_patient (patient_phone),
          INDEX idx_type (alert_type),
          INDEX idx_sent (sent_at)
        )
      `);

      logger.info('TiDB tables initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize TiDB tables:', error);
      throw error;
    }
  }

  async storeDocument(document: VectorDocument): Promise<void> {
    if (!this.connection) throw new Error('No TiDB connection');

    try {
      const embeddingString = `[${document.embedding.join(',')}]`;
      
      await this.connection.execute(
        `INSERT INTO medical_documents 
         (id, content, embedding, type, source, patient_name, patient_id, metadata) 
         VALUES (?, ?, VEC_FROM_TEXT(?), ?, ?, ?, ?, ?)`,
        [
          document.id,
          document.content,
          embeddingString,
          document.metadata.type,
          document.metadata.source,
          document.metadata.patient_name || null,
          document.metadata.patient_id || null,
          JSON.stringify(document.metadata)
        ]
      );

      logger.info(`Document ${document.id} stored successfully`);
    } catch (error) {
      logger.error('Failed to store document:', error);
      throw error;
    }
  }

  async searchSimilarDocuments(
    queryEmbedding: number[], 
    type?: string, 
    limit: number = 5
  ): Promise<SearchResult[]> {
    if (!this.connection) throw new Error('No TiDB connection');

    try {
      const embeddingString = `[${queryEmbedding.join(',')}]`;
      let query = `
        SELECT 
          id, content, VEC_AS_TEXT(embedding) as embedding_text, 
          type, source, patient_name, patient_id, timestamp, metadata,
          VEC_COSINE_DISTANCE(embedding, VEC_FROM_TEXT(?)) as distance
        FROM medical_documents
      `;
      const params: any[] = [embeddingString];

      if (type) {
        query += ' WHERE type = ?';
        params.push(type);
      }

      query += ' ORDER BY distance ASC LIMIT ?';
      params.push(limit);

      const [rows] = await this.connection.execute(query, params) as [any[], any];

      return rows.map((row: any) => ({
        document: {
          id: row.id,
          content: row.content,
          embedding: JSON.parse(row.embedding_text),
          metadata: {
            ...JSON.parse(row.metadata),
            timestamp: row.timestamp.toISOString()
          }
        },
        similarity: 1 - row.distance // Convert distance to similarity
      }));
    } catch (error) {
      logger.error('Failed to search similar documents:', error);
      throw error;
    }
  }

  async storeMedicalReport(report: MedicalReport): Promise<void> {
    if (!this.connection) throw new Error('No TiDB connection');

    try {
      await this.connection.execute(
        `INSERT INTO medical_reports 
         (id, type, original_email_id, processed_content, doctor_summary, patient_summary, google_doc_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `${report.type}_${Date.now()}`,
          report.type,
          report.metadata.sourceEmail,
          JSON.stringify(report.extractedData),
          JSON.stringify(report.extractedData.doctor_summary || ''),
          JSON.stringify(report.extractedData.patient_summary || ''),
          report.metadata.documentId || null
        ]
      );

      logger.info(`Medical report stored for email ${report.metadata.sourceEmail}`);
    } catch (error) {
      logger.error('Failed to store medical report:', error);
      throw error;
    }
  }

  async storeMedicinePrice(medicine: any): Promise<void> {
    if (!this.connection) throw new Error('No TiDB connection');

    try {
      await this.connection.execute(
        `INSERT INTO medicine_prices 
         (drug_name, url, lowest_price, price_update_date, drug_description, savings_program) 
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         lowest_price = VALUES(lowest_price),
         price_update_date = VALUES(price_update_date),
         drug_description = VALUES(drug_description),
         savings_program = VALUES(savings_program)`,
        [
          medicine.drug_name,
          medicine.url,
          medicine.lowest_price,
          medicine.price_update_date ? new Date(medicine.price_update_date) : null,
          medicine.drug_description,
          medicine.savings_program
        ]
      );

      logger.info(`Medicine price updated for ${medicine.drug_name}`);
    } catch (error) {
      logger.error('Failed to store medicine price:', error);
      throw error;
    }
  }

  async logPatientAlert(
    phoneNumber: string, 
    message: string, 
    alertType: string, 
    severity: 'low' | 'medium' | 'high' = 'medium',
    reportId?: string
  ): Promise<void> {
    if (!this.connection) throw new Error('No TiDB connection');

    try {
      await this.connection.execute(
        `INSERT INTO patient_alerts (patient_phone, message, alert_type, severity, report_id) 
         VALUES (?, ?, ?, ?, ?)`,
        [phoneNumber, message, alertType, severity, reportId]
      );

      logger.info(`Patient alert logged for ${phoneNumber}`);
    } catch (error) {
      logger.error('Failed to log patient alert:', error);
      throw error;
    }
  }

  async getPatientHistory(patientId: string, type?: string): Promise<any[]> {
    if (!this.connection) throw new Error('No TiDB connection');

    try {
      let query = `
        SELECT * FROM medical_reports 
        WHERE processed_content->>'$.patient_id' = ?
      `;
      const params: any[] = [patientId];

      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }

      query += ' ORDER BY created_at DESC';

      const [rows] = await this.connection.execute(query, params) as [any[], any];
      return rows;
    } catch (error) {
      logger.error('Failed to get patient history:', error);
      throw error;
    }
  }

  async getMedicineTrackingData(): Promise<any[]> {
    if (!this.connection) throw new Error('No TiDB connection');

    try {
      const [rows] = await this.connection.execute(
        'SELECT * FROM medicine_prices ORDER BY drug_name, last_updated DESC'
      ) as [any[], any];
      
      return rows;
    } catch (error) {
      logger.error('Failed to get medicine tracking data:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
      logger.info('TiDB connection closed');
    }
  }

  // Vector similarity search for medical context
  async findSimilarCases(
    symptoms: string[], 
    reportType: string, 
    limit: number = 3
  ): Promise<SearchResult[]> {
    // This would use embeddings of the symptoms to find similar cases
    // For now, return a basic text search
    if (!this.connection) throw new Error('No TiDB connection');

    try {
      const searchTerms = symptoms.join(' ');
      const [rows] = await this.connection.execute(
        `SELECT * FROM medical_documents 
         WHERE type = ? AND MATCH(content) AGAINST(? IN NATURAL LANGUAGE MODE)
         LIMIT ?`,
        [reportType, searchTerms, limit]
      ) as [any[], any];

      // Convert to SearchResult format
      return rows.map((row: any) => ({
        document: {
          id: row.id,
          content: row.content,
          embedding: [], // Would parse from VEC_AS_TEXT if needed
          metadata: JSON.parse(row.metadata)
        },
        similarity: 0.8 // Placeholder similarity score
      }));
    } catch (error) {
      logger.error('Failed to find similar cases:', error);
      return [];
    }
  }
}
