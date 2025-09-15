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
      // Check if we have valid credentials
      if (!this.credentials.host || this.credentials.host === 'localhost') {
        logger.warn('TiDB credentials not configured - running in mock mode');
        return;
      }

      // For TiDB Cloud, we need SSL, but for local development we can skip it
      const connectionConfig: any = {
        host: this.credentials.host,
        port: this.credentials.port,
        user: this.credentials.user,
        password: this.credentials.password,
        database: this.credentials.database,
        connectTimeout: 60000,
      };

      // Only add SSL if we have SSL configuration or if it's a TiDB Cloud host
      if (this.credentials.ssl || this.credentials.host.includes('tidbcloud.com')) {
        if (this.credentials.ssl) {
          connectionConfig.ssl = this.credentials.ssl;
        } else {
          // For TiDB Cloud without SSL cert, use basic SSL
          connectionConfig.ssl = { rejectUnauthorized: false };
        }
      }

      this.connection = await mysql.createConnection(connectionConfig);

      logger.info('Successfully connected to TiDB');
      await this.initializeTables();
    } catch (error) {
      logger.error('Failed to connect to TiDB:', error);
      logger.warn('Running in mock mode - TiDB operations will be simulated');
      // Don't throw error in development mode
      if (process.env.NODE_ENV === 'production') {
      throw error;
      }
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
          INDEX idx_patient (patient_id)
        )
      `);

      // Create vector index separately with correct syntax
      try {
        await this.connection.execute(`
          CREATE VECTOR INDEX IF NOT EXISTS idx_embedding ON medical_documents (embedding) 
          WITH (metric_type = 'cosine', dimension = 1536)
        `);
      } catch (error) {
        // If vector index creation fails, log but don't stop
        logger.warn('Failed to create vector index, continuing without it:', error);
      }

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

      // Create patients table
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS patients (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          age INT,
          gender ENUM('Male', 'Female', 'Other'),
          diagnosis VARCHAR(500),
          stage VARCHAR(100),
          contact_info JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_name (name),
          INDEX idx_diagnosis (diagnosis)
        )
      `);

      // Create medicines table
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS medicines (
          id VARCHAR(255) PRIMARY KEY,
          patient_id VARCHAR(255) NOT NULL,
          drug_name VARCHAR(255) NOT NULL,
          dosage VARCHAR(100),
          frequency VARCHAR(100),
          start_date DATE,
          end_date DATE,
          status ENUM('active', 'completed', 'discontinued') DEFAULT 'active',
          side_effects JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_patient (patient_id),
          INDEX idx_drug (drug_name),
          INDEX idx_status (status)
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
  private async ensureConnection(): Promise<void> {
    if (!this.connection) {
      logger.info('TiDB connection lost, attempting to reconnect...');
      await this.connect();
    }
  }

  async findSimilarCases(
    symptoms: string[], 
    reportType: string, 
    limit: number = 3
  ): Promise<SearchResult[]> {
    // Return mock data if TiDB is not connected
    if (!this.connection) {
      logger.info('TiDB not connected - returning mock similar cases data');
      return this.getMockSimilarCases(symptoms, reportType, limit);
    }

    try {
      await this.ensureConnection();
      const searchTerms = symptoms.join(' ');
      // Use LIKE search instead of MATCH...AGAINST since TiDB doesn't support it
      // Convert limit to integer to avoid TiDB parameter binding issues
      const [rows] = await this.connection.execute(
        `SELECT * FROM medical_documents 
         WHERE type = ? AND content LIKE ?
         LIMIT ${parseInt(limit.toString())}`,
        [reportType, `%${searchTerms}%`]
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
      return this.getMockSimilarCases(symptoms, reportType, limit);
    }
  }

  private getMockSimilarCases(symptoms: string[], reportType: string, limit: number): SearchResult[] {
    const mockCases = [
      {
        document: {
          id: 'mock_case_1',
          content: `Mock medical report for ${symptoms.join(', ')} - ${reportType} analysis shows normal ranges with slight variations. Patient shows good response to treatment.`,
          embedding: [],
          metadata: {
            type: reportType,
            patient_id: 'mock_patient_1',
            timestamp: new Date().toISOString(),
            source: 'mock_data'
          }
        },
        similarity: 0.85
      },
      {
        document: {
          id: 'mock_case_2',
          content: `Similar case found for ${symptoms.join(', ')} - Previous ${reportType} results indicate stable condition. Monitoring continues.`,
          embedding: [],
          metadata: {
            type: reportType,
            patient_id: 'mock_patient_2',
            timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
            source: 'mock_data'
          }
        },
        similarity: 0.78
      }
    ];

    return mockCases.slice(0, limit);
  }

  // Seed data for testing
  async seedTestData(): Promise<void> {
    if (!this.connection) {
      logger.warn('TiDB not connected - cannot seed test data');
      return;
    }

    try {
      await this.ensureConnection();
      
      logger.info('Seeding test data...');

      // Sample patients
      const patients = [
        {
          id: 'patient_001',
          name: 'John Smith',
          age: 45,
          gender: 'Male',
          diagnosis: 'Lung Cancer',
          stage: 'Stage II',
          contact_info: JSON.stringify({
            phone: '+1234567890',
            email: 'john.smith@email.com',
            address: '123 Main St, City, State'
          }),
          created_at: new Date().toISOString()
        },
        {
          id: 'patient_002',
          name: 'Sarah Johnson',
          age: 38,
          gender: 'Female',
          diagnosis: 'Breast Cancer',
          stage: 'Stage I',
          contact_info: JSON.stringify({
            phone: '+1987654321',
            email: 'sarah.johnson@email.com',
            address: '456 Oak Ave, City, State'
          }),
          created_at: new Date().toISOString()
        },
        {
          id: 'patient_003',
          name: 'Michael Brown',
          age: 52,
          gender: 'Male',
          diagnosis: 'Prostate Cancer',
          stage: 'Stage III',
          contact_info: JSON.stringify({
            phone: '+1122334455',
            email: 'michael.brown@email.com',
            address: '789 Pine St, City, State'
          }),
          created_at: new Date().toISOString()
        }
      ];

      // Insert patients
      for (const patient of patients) {
        await this.connection.execute(
          `INSERT IGNORE INTO patients (id, name, age, gender, diagnosis, stage, contact_info, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [patient.id, patient.name, patient.age, patient.gender, patient.diagnosis, patient.stage, patient.contact_info, patient.created_at]
        );
      }

      // Sample medical documents
      const medicalDocs = [
        {
          id: 'doc_001',
          content: 'Complete Blood Count (CBC) - Hemoglobin: 12.5 g/dL (normal), White Blood Cells: 7.2 K/μL (normal), Platelets: 250 K/μL (normal). Patient shows good response to chemotherapy treatment.',
          embedding: JSON.stringify(new Array(1536).fill(0.1)), // Mock embedding
          type: 'blood_test',
          source: 'City Medical Lab',
          patient_name: 'John Smith',
          patient_id: 'patient_001',
          metadata: JSON.stringify({
            test_date: '2025-09-10',
            lab: 'City Medical Lab',
            doctor: 'Dr. Anderson',
            status: 'normal'
          })
        },
        {
          id: 'doc_002',
          content: 'CT Scan of Chest - No significant changes from previous scan. Tumor size remains stable at 2.3cm. No new lesions detected. Patient responding well to treatment.',
          embedding: JSON.stringify(new Array(1536).fill(0.2)), // Mock embedding
          type: 'radiology',
          source: 'City Imaging Center',
          patient_name: 'John Smith',
          patient_id: 'patient_001',
          metadata: JSON.stringify({
            scan_date: '2025-09-12',
            facility: 'City Imaging Center',
            radiologist: 'Dr. Wilson',
            findings: 'stable'
          })
        },
        {
          id: 'doc_003',
          content: 'Tumor Markers - CA 15-3: 28 U/mL (normal range <31), CEA: 2.1 ng/mL (normal range <3.0). All markers within normal limits, indicating good treatment response.',
          embedding: JSON.stringify(new Array(1536).fill(0.15)), // Mock embedding
          type: 'blood_test',
          source: 'Regional Lab Services',
          patient_name: 'Sarah Johnson',
          patient_id: 'patient_002',
          metadata: JSON.stringify({
            test_date: '2025-09-11',
            lab: 'Regional Lab Services',
            doctor: 'Dr. Martinez',
            status: 'normal'
          })
        },
        {
          id: 'doc_004',
          content: 'Mammography - No evidence of recurrence. Surgical site healing well. No new masses or calcifications detected. Follow-up in 6 months recommended.',
          embedding: JSON.stringify(new Array(1536).fill(0.25)), // Mock embedding
          type: 'radiology',
          source: 'Women\'s Health Center',
          patient_name: 'Sarah Johnson',
          patient_id: 'patient_002',
          metadata: JSON.stringify({
            scan_date: '2025-09-13',
            facility: 'Women\'s Health Center',
            radiologist: 'Dr. Lee',
            findings: 'no_recurrence'
          })
        },
        {
          id: 'doc_005',
          content: 'PSA (Prostate Specific Antigen) - PSA: 4.2 ng/mL (elevated from baseline of 2.1). Additional monitoring required. Patient scheduled for follow-up biopsy.',
          embedding: JSON.stringify(new Array(1536).fill(0.3)), // Mock embedding
          type: 'blood_test',
          source: 'Urology Lab',
          patient_name: 'Michael Brown',
          patient_id: 'patient_003',
          metadata: JSON.stringify({
            test_date: '2025-09-09',
            lab: 'Urology Lab',
            doctor: 'Dr. Thompson',
            status: 'elevated'
          })
        },
        {
          id: 'doc_006',
          content: 'MRI of Prostate - Lesion in left peripheral zone measuring 1.8cm. Gleason score 7 (3+4). No evidence of extracapsular extension. Treatment planning in progress.',
          embedding: JSON.stringify(new Array(1536).fill(0.35)), // Mock embedding
          type: 'radiology',
          source: 'Advanced Imaging',
          patient_name: 'Michael Brown',
          patient_id: 'patient_003',
          metadata: JSON.stringify({
            scan_date: '2025-09-08',
            facility: 'Advanced Imaging',
            radiologist: 'Dr. Garcia',
            findings: 'localized'
          })
        }
      ];

      // Insert medical documents
      for (const doc of medicalDocs) {
        await this.connection.execute(
          `INSERT IGNORE INTO medical_documents (id, content, embedding, type, source, patient_name, patient_id, metadata) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [doc.id, doc.content, doc.embedding, doc.type, doc.source, doc.patient_name, doc.patient_id, doc.metadata]
        );
      }

      // Sample medicines
      const medicines = [
        {
          id: 'med_001',
          patient_id: 'patient_001',
          drug_name: 'Pembrolizumab',
          dosage: '200mg',
          frequency: 'Every 3 weeks',
          start_date: '2025-08-15',
          end_date: null,
          status: 'active',
          side_effects: JSON.stringify(['fatigue', 'mild nausea']),
          created_at: new Date().toISOString()
        },
        {
          id: 'med_002',
          patient_id: 'patient_001',
          drug_name: 'Carboplatin',
          dosage: 'AUC 6',
          frequency: 'Every 3 weeks',
          start_date: '2025-08-15',
          end_date: null,
          status: 'active',
          side_effects: JSON.stringify(['hair loss', 'low blood counts']),
          created_at: new Date().toISOString()
        },
        {
          id: 'med_003',
          patient_id: 'patient_002',
          drug_name: 'Tamoxifen',
          dosage: '20mg',
          frequency: 'Daily',
          start_date: '2025-07-20',
          end_date: null,
          status: 'active',
          side_effects: JSON.stringify(['hot flashes']),
          created_at: new Date().toISOString()
        },
        {
          id: 'med_004',
          patient_id: 'patient_003',
          drug_name: 'Bicalutamide',
          dosage: '50mg',
          frequency: 'Daily',
          start_date: '2025-09-01',
          end_date: null,
          status: 'active',
          side_effects: JSON.stringify(['breast tenderness']),
          created_at: new Date().toISOString()
        }
      ];

      // Insert medicines
      for (const med of medicines) {
        await this.connection.execute(
          `INSERT IGNORE INTO medicines (id, patient_id, drug_name, dosage, frequency, start_date, end_date, status, side_effects, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [med.id, med.patient_id, med.drug_name, med.dosage, med.frequency, med.start_date, med.end_date, med.status, med.side_effects, med.created_at]
        );
      }

      // Sample medical reports (processed reports)
      const medicalReports = [
        {
          id: 'report_001',
          type: 'blood_test',
          original_email_id: 'email_001',
          processed_content: JSON.stringify({
            patient_name: 'John Smith',
            test_results: {
              hemoglobin: '12.5 g/dL',
              white_blood_cells: '7.2 K/μL',
              platelets: '250 K/μL'
            },
            status: 'normal'
          }),
          doctor_summary: 'Blood test results within normal ranges. Patient responding well to treatment.',
          patient_summary: 'Your blood test results look good! All values are within normal ranges.',
          google_doc_id: 'doc_google_001'
        },
        {
          id: 'report_002',
          type: 'radiology',
          original_email_id: 'email_002',
          processed_content: JSON.stringify({
            patient_name: 'John Smith',
            scan_type: 'CT Scan of Chest',
            findings: 'Tumor size stable at 2.3cm, no new lesions',
            status: 'stable'
          }),
          doctor_summary: 'CT scan shows stable condition with no significant changes from previous scan.',
          patient_summary: 'Great news! Your scan shows the treatment is working well.',
          google_doc_id: 'doc_google_002'
        },
        {
          id: 'report_003',
          type: 'blood_test',
          original_email_id: 'email_003',
          processed_content: JSON.stringify({
            patient_name: 'Sarah Johnson',
            test_results: {
              ca_15_3: '28 U/mL',
              cea: '2.1 ng/mL'
            },
            status: 'normal'
          }),
          doctor_summary: 'Tumor markers within normal limits, indicating good treatment response.',
          patient_summary: 'Your tumor marker levels are excellent and within normal ranges.',
          google_doc_id: 'doc_google_003'
        }
      ];

      // Insert medical reports
      for (const report of medicalReports) {
        await this.connection.execute(
          `INSERT IGNORE INTO medical_reports (id, type, original_email_id, processed_content, doctor_summary, patient_summary, google_doc_id) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [report.id, report.type, report.original_email_id, report.processed_content, report.doctor_summary, report.patient_summary, report.google_doc_id]
        );
      }

      // Sample medicine prices
      const medicinePrices = [
        {
          drug_name: 'Pembrolizumab',
          url: 'https://www.goodrx.com/pembrolizumab',
          lowest_price: '$12,500/month',
          price_update_date: '2025-09-01',
          drug_description: 'Immunotherapy drug for cancer treatment',
          savings_program: 'Patient assistance program available'
        },
        {
          drug_name: 'Carboplatin',
          url: 'https://www.goodrx.com/carboplatin',
          lowest_price: '$150/dose',
          price_update_date: '2025-09-01',
          drug_description: 'Chemotherapy drug for cancer treatment',
          savings_program: 'Generic available'
        },
        {
          drug_name: 'Tamoxifen',
          url: 'https://www.goodrx.com/tamoxifen',
          lowest_price: '$25/month',
          price_update_date: '2025-09-01',
          drug_description: 'Hormone therapy for breast cancer',
          savings_program: 'Generic available'
        },
        {
          drug_name: 'Bicalutamide',
          url: 'https://www.goodrx.com/bicalutamide',
          lowest_price: '$45/month',
          price_update_date: '2025-09-01',
          drug_description: 'Anti-androgen for prostate cancer',
          savings_program: 'Generic available'
        }
      ];

      // Insert medicine prices
      for (const price of medicinePrices) {
        await this.connection.execute(
          `INSERT IGNORE INTO medicine_prices (drug_name, url, lowest_price, price_update_date, drug_description, savings_program) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [price.drug_name, price.url, price.lowest_price, price.price_update_date, price.drug_description, price.savings_program]
        );
      }

      // Sample patient alerts
      const patientAlerts = [
        {
          patient_phone: '+1234567890',
          message: 'Your blood test results are ready. Please check your patient portal.',
          alert_type: 'blood_test',
          severity: 'medium',
          report_id: 'report_001'
        },
        {
          patient_phone: '+1234567890',
          message: 'Your CT scan results show stable condition. Great news!',
          alert_type: 'scan_result',
          severity: 'low',
          report_id: 'report_002'
        },
        {
          patient_phone: '+1987654321',
          message: 'Your tumor marker results are within normal ranges.',
          alert_type: 'blood_test',
          severity: 'low',
          report_id: 'report_003'
        },
        {
          patient_phone: '+1122334455',
          message: 'Your PSA levels require monitoring. Please schedule a follow-up.',
          alert_type: 'blood_test',
          severity: 'high',
          report_id: 'doc_005'
        }
      ];

      // Insert patient alerts
      for (const alert of patientAlerts) {
        await this.connection.execute(
          `INSERT IGNORE INTO patient_alerts (patient_phone, message, alert_type, severity, report_id) 
           VALUES (?, ?, ?, ?, ?)`,
          [alert.patient_phone, alert.message, alert.alert_type, alert.severity, alert.report_id]
        );
      }

      logger.info('Test data seeded successfully!');
      logger.info(`Inserted ${patients.length} patients, ${medicalDocs.length} medical documents, ${medicines.length} medicines, ${medicalReports.length} medical reports, ${medicinePrices.length} medicine prices, and ${patientAlerts.length} patient alerts`);

    } catch (error) {
      logger.error('Failed to seed test data:', error);
      throw error;
    }
  }

  getConnection() {
    return this.connection;
  }
}
