export interface EmailData {
  id: string;
  subject: string;
  text: string;
  from: string;
  date: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface ClassificationResult {
  category: 'PET/CT/Histopathology' | 'Blood Tests' | 'Bills/Invoices' | 'Medicines';
  confidence: number;
  extractedData?: any;
}

export interface MedicalReport {
  type: 'radiology' | 'blood_test' | 'invoice' | 'medicine';
  content: string;
  extractedData: any;
  patientInfo?: PatientInfo;
  metadata: {
    sourceEmail: string;
    processedAt: string;
    documentId?: string;
  };
}

export interface PatientInfo {
  name?: string;
  id?: string;
  phoneNumber?: string;
  email?: string;
}

export interface PETCTReport {
  professional_medical_note: {
    date_of_report: string;
    clinical_summary: {
      tumor_measurements: string;
      SUVmax_values: string;
      lymph_node_involvement: string;
      metastasis: string;
      histopathology: string;
      staging: string;
      comparison_to_prior_studies: string;
    };
  };
  patient_facing_report: {
    summary: string;
    recommendations: string;
  };
}

export interface BloodTestReport {
  doctor_summary: {
    hematology: {
      hemoglobin: {
        value: string;
        reference_range: string;
        trend: string;
        clinical_notes: string;
      };
      white_blood_cells: {
        value: string;
        reference_range: string;
        trend: string;
        clinical_notes: string;
      };
      platelets?: {
        value: string;
        reference_range: string;
        trend: string;
        clinical_notes: string;
      };
    };
    liver_function?: any;
    renal_function?: any;
  };
  patient_alert?: {
    message: string;
    severity: 'low' | 'medium' | 'high';
  };
}

export interface InvoiceReport {
  cover_email: {
    subject: string;
    body: string;
  };
  total_claim_amount: number;
  invoices: Array<{
    invoice_number: string;
    provider_name: string;
    date: string;
    amount: number;
  }>;
}

export interface MedicineData {
  drug_name: string;
  url: string;
  lowest_price?: string;
  price_update_date?: string;
  drug_description?: string;
  related_drugs?: Array<{
    related_drug_name: string;
    related_drug_url: string;
  }>;
  savings_program?: string;
}

export interface TiDBCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: {
    ca: string;
  };
}

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
}

export interface OpenAICredentials {
  apiKey: string;
  model?: string;
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export interface AppConfig {
  tidb: TiDBCredentials;
  google: GoogleCredentials;
  openai: OpenAICredentials;
  twilio: TwilioCredentials;
  patient: {
    phoneNumber: string;
    email?: string;
  };
  googleDocs: {
    folderId: string;
    sheetsId: string;
  };
}

export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    type: string;
    source: string;
    timestamp: string;
    [key: string]: any;
  };
}

export interface SearchResult {
  document: VectorDocument;
  similarity: number;
}