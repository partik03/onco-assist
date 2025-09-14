import { 
  EmailData, 
  ClassificationResult, 
  PETCTReport, 
  BloodTestReport, 
  InvoiceReport,
  MedicalReport,
  AppConfig 
} from '../types';
import { GmailService } from '../services/gmail.service';
import { OpenAIService } from '../services/openai.service';
import { GoogleService } from '../services/google.service';
import { TwilioService } from '../services/twilio.service';
import { TiDBService } from '../services/tidb.service';
import { ClassificationService } from '../services/classification.service';
import { logger } from '../utils/logger';

export class MedicalWorkflow {
  private gmailService!: GmailService;
  private openaiService!: OpenAIService;
  private googleService!: GoogleService;
  private twilioService!: TwilioService;
  private tidbService!: TiDBService;
  private classificationService!: ClassificationService;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.initializeServices();
  }

  private initializeServices(): void {
    this.gmailService = new GmailService(this.config.google);
    this.openaiService = new OpenAIService(this.config.openai);
    this.googleService = new GoogleService(this.config.google);
    this.twilioService = new TwilioService(this.config.twilio);
    this.tidbService = new TiDBService(this.config.tidb);
    this.classificationService = new ClassificationService(this.openaiService, this.tidbService);
  }

  async initialize(): Promise<void> {
    try {
      await this.tidbService.connect();
      logger.info('Medical workflow initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize medical workflow:', error);
      throw error;
    }
  }

  async processNewEmails(): Promise<void> {
    try {
      logger.info('Starting email processing workflow');
      
      // Step 1: Get unread emails
      const emails = await this.gmailService.getUnreadEmails();
      
      if (emails.length === 0) {
        logger.info('No new emails to process');
        return;
      }

      logger.info(`Processing ${emails.length} new emails`);

      // Step 2: Process each email
      for (const email of emails) {
        await this.processEmail(email);
        
        // Mark as read after processing
        await this.gmailService.markAsRead(email.id);
        
        // Add delay between emails to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      logger.info('Completed email processing workflow');
    } catch (error) {
      logger.error('Failed to process new emails:', error);
      throw error;
    }
  }

  private async processEmail(email: EmailData): Promise<void> {
    try {
      logger.info(`Processing email: ${email.id} - ${email.subject}`);

      // Step 1: Classify email using AI and vector search
      const classification = await this.classificationService.classifyAndEnhanceEmail(email);
      
      // Step 2: Route to appropriate handler based on classification
      switch (classification.category) {
        case 'PET/CT/Histopathology':
          await this.handleRadiologyReport(email, classification);
          break;
        case 'Blood Tests':
          await this.handleBloodTestReport(email, classification);
          break;
        case 'Bills/Invoices':
          await this.handleInvoices(email, classification);
          break;
        case 'Medicines':
          await this.handleMedicines(email, classification);
          break;
        default:
          logger.warn(`Unknown classification: ${classification.category}`);
      }

      logger.info(`Successfully processed email ${email.id}`);
    } catch (error) {
      logger.error(`Failed to process email ${email.id}:`, error);
    }
  }

  private async handleRadiologyReport(email: EmailData, classification: ClassificationResult): Promise<void> {
    try {
      logger.info(`Processing radiology report: ${email.id}`);

      // Step 1: Add Gmail label
      await this.gmailService.addLabel(email.id, 'PET/CT/Histopathology Reports');

      // Step 2: Process with OpenAI
      const report = await this.openaiService.processPETCTReport(email.text);

      // Step 3: Check if document exists or create new one
      const existingDocId = await this.googleService.findExistingDocument('Doctor Summary of all the scans, etc.');
      
      let documentId: string;
      if (existingDocId) {
        // Update existing document
        documentId = existingDocId;
        const formattedContent = this.formatRadiologyContent(report);
        await this.googleService.updateDocument(documentId, formattedContent);
      } else {
        // Create new document
        documentId = await this.googleService.createMedicalReport(
          'Doctor Summary of all the scans, etc.',
          this.formatRadiologyContent(report),
          this.config.googleDocs.folderId,
          'radiology'
        );
      }

      // Step 4: Store in TiDB
      const medicalReport: MedicalReport = {
        type: 'radiology',
        content: email.text,
        extractedData: report,
        metadata: {
          sourceEmail: email.id,
          processedAt: new Date().toISOString(),
          documentId: documentId
        }
      };
      await this.tidbService.storeMedicalReport(medicalReport);

      // Step 5: Send patient notification
      const patientMessage = report.patient_facing_report?.summary || 
        'Your scan results have been processed and added to your medical records.';
      
      await this.twilioService.sendScanResultAlert(
        this.config.patient.phoneNumber,
        patientMessage
      );

      // Step 6: Log alert in TiDB
      await this.tidbService.logPatientAlert(
        this.config.patient.phoneNumber,
        patientMessage,
        'scan_result',
        'medium',
        `radiology_${Date.now()}`
      );

      logger.info(`Radiology report processed successfully: ${email.id}`);
    } catch (error) {
      logger.error(`Failed to handle radiology report ${email.id}:`, error);
      throw error;
    }
  }

  private async handleBloodTestReport(email: EmailData, classification: ClassificationResult): Promise<void> {
    try {
      logger.info(`Processing blood test report: ${email.id}`);

      // Step 1: Add Gmail label
      await this.gmailService.addLabel(email.id, 'Blood Tests');

      // Step 2: Process with OpenAI
      const report = await this.openaiService.processBloodTestReport(email.text);

      // Step 3: Create or update blood test document
      const existingDocId = await this.googleService.findExistingDocument('Blood Reports');
      
      let documentId: string;
      if (existingDocId) {
        documentId = existingDocId;
        const formattedContent = this.formatBloodTestContent(report);
        await this.googleService.updateDocument(documentId, formattedContent);
      } else {
        documentId = await this.googleService.createMedicalReport(
          'Blood Reports',
          this.formatBloodTestContent(report),
          this.config.googleDocs.folderId,
          'blood_test'
        );
      }

      // Step 4: Store in TiDB
      const medicalReport: MedicalReport = {
        type: 'blood_test',
        content: email.text,
        extractedData: report,
        metadata: {
          sourceEmail: email.id,
          processedAt: new Date().toISOString(),
          documentId: documentId
        }
      };
      await this.tidbService.storeMedicalReport(medicalReport);

      // Step 5: Send patient alert if needed
      if (report.patient_alert && report.patient_alert.message) {
        await this.twilioService.sendBloodTestAlert(
          this.config.patient.phoneNumber,
          report.patient_alert.message,
          report.patient_alert.severity
        );

        // Log alert in TiDB
        await this.tidbService.logPatientAlert(
          this.config.patient.phoneNumber,
          report.patient_alert.message,
          'blood_test',
          report.patient_alert.severity,
          `blood_test_${Date.now()}`
        );
      }

      logger.info(`Blood test report processed successfully: ${email.id}`);
    } catch (error) {
      logger.error(`Failed to handle blood test report ${email.id}:`, error);
      throw error;
    }
  }

  private async handleInvoices(email: EmailData, classification: ClassificationResult): Promise<void> {
    try {
      logger.info(`Processing invoices: ${email.id}`);

      // Step 1: Add Gmail label
      await this.gmailService.addLabel(email.id, 'Bills/Invoices');

      // Step 2: Process with OpenAI
      const report = await this.openaiService.processInvoices(email.text);

      // Step 3: Create draft email for insurance
      const draftId = await this.gmailService.createDraft(
        'claims@nivabupa.com', // or configured insurance email
        report.cover_email.subject,
        report.cover_email.body
      );

      // Step 4: Store in TiDB
      const medicalReport: MedicalReport = {
        type: 'invoice',
        content: email.text,
        extractedData: report,
        metadata: {
          sourceEmail: email.id,
          processedAt: new Date().toISOString(),
          documentId: draftId
        }
      };
      await this.tidbService.storeMedicalReport(medicalReport);

      // Step 5: Send notification to patient
      await this.twilioService.sendBillReadyAlert(this.config.patient.phoneNumber);

      // Step 6: Log alert in TiDB
      await this.tidbService.logPatientAlert(
        this.config.patient.phoneNumber,
        'Your weekly bills have been compiled and are ready for insurance submission',
        'bill_ready',
        'low',
        `invoice_${Date.now()}`
      );

      logger.info(`Invoices processed successfully: ${email.id}`);
    } catch (error) {
      logger.error(`Failed to handle invoices ${email.id}:`, error);
      throw error;
    }
  }

  private async handleMedicines(email: EmailData, classification: ClassificationResult): Promise<void> {
    try {
      logger.info(`Processing medicines: ${email.id}`);

      // Step 1: Add Gmail label
      await this.gmailService.addLabel(email.id, 'Medicines');

      // Step 2: Extract medicines using OpenAI
      const medicines = await this.openaiService.extractMedicines(email.text);

      if (medicines.length === 0) {
        logger.warn(`No medicines found in email ${email.id}`);
        return;
      }

      // Step 3: Update Google Sheets with medicine names
      const medicineData = medicines.map(medicine => ({
        drug_name: medicine,
        url: `https://www.goodrx.com/${this.toSlug(medicine)}`
      }));

      await this.googleService.updateMedicineSheet(
        this.config.googleDocs.sheetsId,
        'Sheet1',
        medicineData
      );

      // Step 4: Get medicine pricing information (simplified version without BrightData)
      for (const medicine of medicineData) {
        // Store medicine in TiDB for tracking
        await this.tidbService.storeMedicinePrice({
          drug_name: medicine.drug_name,
          url: medicine.url,
          lowest_price: 'Pending update',
          price_update_date: new Date().toISOString(),
          drug_description: 'Auto-detected from email',
          savings_program: 'Check GoodRx for savings'
        });
      }

      // Step 5: Create medicine document
      const medicineDoc = await this.googleService.createMedicalReport(
        'Medicines Tracking',
        `Detected medicines: ${medicines.join(', ')}\n\nProcessed from email: ${email.subject}`,
        this.config.googleDocs.folderId,
        'medicine'
      );

      // Step 6: Store in TiDB
      const medicalReport: MedicalReport = {
        type: 'medicine',
        content: email.text,
        extractedData: { medicines, medicineData },
        metadata: {
          sourceEmail: email.id,
          processedAt: new Date().toISOString(),
          documentId: medicineDoc
        }
      };
      await this.tidbService.storeMedicalReport(medicalReport);

      // Step 7: Send notification
      const message = `New medicines detected and added to tracking: ${medicines.join(', ')}`;
      await this.twilioService.sendMedicineInfoAlert(this.config.patient.phoneNumber, message);

      // Step 8: Log alert in TiDB
      await this.tidbService.logPatientAlert(
        this.config.patient.phoneNumber,
        message,
        'medicine_info',
        'low',
        `medicine_${Date.now()}`
      );

      logger.info(`Medicines processed successfully: ${email.id}`);
    } catch (error) {
      logger.error(`Failed to handle medicines ${email.id}:`, error);
      throw error;
    }
  }

  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  private formatRadiologyContent(report: PETCTReport): string {
    const professional = report.professional_medical_note;
    const summary = professional.clinical_summary;

    return `
RADIOLOGY REPORT - ${professional.date_of_report}

Tumor Measurements: ${summary.tumor_measurements}
SUVmax Values: ${summary.SUVmax_values}
Lymph Node Involvement: ${summary.lymph_node_involvement}
Metastasis: ${summary.metastasis}
Histopathology: ${summary.histopathology}
Staging: ${summary.staging}
Comparison to Prior Studies: ${summary.comparison_to_prior_studies}

Generated: ${new Date().toISOString()}
    `.trim();
  }

  private formatBloodTestContent(report: BloodTestReport): string {
    const hematology = report.doctor_summary.hematology;

    return `
BLOOD TEST REPORT

HEMATOLOGY:
Hemoglobin: ${hematology.hemoglobin.value} (${hematology.hemoglobin.reference_range})
Trend: ${hematology.hemoglobin.trend}
Notes: ${hematology.hemoglobin.clinical_notes}

White Blood Cells: ${hematology.white_blood_cells.value} (${hematology.white_blood_cells.reference_range})
Trend: ${hematology.white_blood_cells.trend}
Notes: ${hematology.white_blood_cells.clinical_notes}

${hematology.platelets ? `
Platelets: ${hematology.platelets.value} (${hematology.platelets.reference_range})
Trend: ${hematology.platelets.trend}
Notes: ${hematology.platelets.clinical_notes}
` : ''}

Generated: ${new Date().toISOString()}
    `.trim();
  }

  // Advanced workflow methods
  async processPatientHistory(patientId: string): Promise<string> {
    try {
      const history = await this.tidbService.getPatientHistory(patientId);
      const summary = await this.openaiService.summarizePatientHistory(history, {});
      
      logger.info(`Generated patient history summary for ${patientId}`);
      return summary;
    } catch (error) {
      logger.error(`Failed to process patient history for ${patientId}:`, error);
      throw error;
    }
  }

  async findSimilarCases(symptoms: string[], reportType: string): Promise<any[]> {
    try {
      const similarCases = await this.tidbService.findSimilarCases(symptoms, reportType, 5);
      logger.info(`Found ${similarCases.length} similar cases for ${reportType}`);
      return similarCases;
    } catch (error) {
      logger.error('Failed to find similar cases:', error);
      return [];
    }
  }

  async generateWeeklyReport(): Promise<void> {
    try {
      logger.info('Generating weekly medical report');

      // Get data from the last week
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      // This would query TiDB for reports from the last week
      // and generate a comprehensive summary
      
      const weeklyContent = `
WEEKLY MEDICAL REPORT - ${new Date().toISOString()}

This is a summary of all medical activities from the past week.
Generated automatically by the OncoAssist AI system.
      `;

      const reportId = await this.googleService.createMedicalReport(
        `Weekly Report - ${new Date().toISOString().split('T')[0]}`,
        weeklyContent,
        this.config.googleDocs.folderId,
        'radiology'
      );

      logger.info(`Weekly report generated: ${reportId}`);
    } catch (error) {
      logger.error('Failed to generate weekly report:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.tidbService.disconnect();
      logger.info('Medical workflow shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }
}
