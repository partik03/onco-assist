import OpenAI from 'openai';
import { OpenAICredentials, ClassificationResult, PETCTReport, BloodTestReport, InvoiceReport } from '../types';
import { logger } from '../utils/logger';

export class OpenAIService {
  private openai: OpenAI | null = null;
  private model: string;
  private isConfigured: boolean = false;

  constructor(credentials: OpenAICredentials) {
    this.model = credentials.model || 'gpt-4o';
    
    // Only initialize if we have a valid API key
    if (credentials.apiKey && credentials.apiKey.length > 0) {
      try {
        this.openai = new OpenAI({
          apiKey: credentials.apiKey
        });
        this.isConfigured = true;
        logger.info('OpenAI service initialized successfully');
      } catch (error) {
        logger.warn('Failed to initialize OpenAI service:', error);
        this.isConfigured = false;
      }
    } else {
      logger.warn('OpenAI API key not configured - running in mock mode');
      this.isConfigured = false;
    }
  }

  async classifyEmail(emailText: string): Promise<ClassificationResult> {
    if (!this.isConfigured || !this.openai) {
      logger.info('[MOCK] Email classification - returning mock result');
      // Simple mock classification based on keywords
      const lowerText = emailText.toLowerCase();
      if (lowerText.includes('blood') || lowerText.includes('lab') || lowerText.includes('test')) {
        return {
          category: 'Blood Tests',
          confidence: 0.8
        };
      } else if (lowerText.includes('scan') || lowerText.includes('pet') || lowerText.includes('ct')) {
        return {
          category: 'PET/CT/Histopathology',
          confidence: 0.8
        };
      } else if (lowerText.includes('bill') || lowerText.includes('invoice') || lowerText.includes('payment')) {
        return {
          category: 'Bills/Invoices',
          confidence: 0.8
        };
      } else if (lowerText.includes('medicine') || lowerText.includes('drug') || lowerText.includes('prescription')) {
        return {
          category: 'Medicines',
          confidence: 0.8
        };
      } else {
        return {
          category: 'Blood Tests', // Default to Blood Tests if unclear
          confidence: 0.5
        };
      }
    }

    try {
      const prompt = `
        You are a medical text classification assistant. Classify the following email text into one of these categories:

        1. PET/CT/Histopathology - Radiology and pathology reports containing imaging results, tumor measurements, and biopsy findings. Use to track diagnosis and disease progression.

        2. Blood Tests - Laboratory reports such as CBC, LFT, KFT, or biomarker panels showing numerical values and trends. Use to suggest treatment actions or injection needs.

        3. Bills/Invoices - Financial documents like hospital bills, pharmacy invoices, and insurance-related receipts. Use to prepare weekly summaries for claim submission.

        4. Medicines - Email texts that identify medicines or drugs mentioned. Do not include dosages, strengths, or schedules. Ignore anything that is not a medicine, such as lab tests, doctor names, hospital names, or billing information.

        Email text: "${emailText}"

        Respond with a JSON object containing:
        {
          "category": "PET/CT/Histopathology" | "Blood Tests" | "Bills/Invoices" | "Medicines",
          "confidence": 0.0-1.0,
          "reasoning": "Brief explanation of classification"
        }
      `;

      const response = await this.openai!.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        category: result.category,
        confidence: result.confidence || 0.5
      };
    } catch (error) {
      logger.error('Failed to classify email:', error);
      throw error;
    }
  }

  async processPETCTReport(emailText: string): Promise<PETCTReport> {
    try {
      const prompt = `
        You are generating a professional medical note for a Google Doc, intended for doctor use only. Using the extracted contents of the PET/CT/Histopathology report, write a structured summary that includes all available parameters. Explicitly capture tumor measurements, SUVmax values, lymph node involvement, metastasis locations, histological subtype, staging details according to AJCC 8th edition if mentioned, and any comparison to prior studies such as whether lesions have grown, shrunk, or remained stable. Present the information in a clear, clinical tone that can be reviewed in a medical setting. Do not include a patient-facing explanation here; this output is strictly the doctor's record.

        Add a patient facing report too, explaining everything in easy language. Use polite language.

        Email content: "${emailText}"

        Respond with a JSON object in this exact format:
        {
          "professional_medical_note": {
            "date_of_report": "YYYY-MM-DD",
            "clinical_summary": {
              "tumor_measurements": "detailed measurements",
              "SUVmax_values": "SUV values and locations",
              "lymph_node_involvement": "lymph node status",
              "metastasis": "metastatic findings",
              "histopathology": "histological findings",
              "staging": "cancer staging information",
              "comparison_to_prior_studies": "comparison notes"
            }
          },
          "patient_facing_report": {
            "summary": "Patient-friendly summary",
            "recommendations": "What the patient should do next"
          }
        }
      `;

      const response = await this.openai!.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      logger.error('Failed to process PET/CT report:', error);
      throw error;
    }
  }

  async processBloodTestReport(emailText: string): Promise<BloodTestReport> {
    try {
      const prompt = `
        You are analyzing a set of blood test results and need to produce two outputs. For the doctor, write a structured summary that points out all abnormal values compared with reference ranges. Group the findings by category (for example hematology, liver function, renal function), and mention any clinically relevant trends such as whether hemoglobin is dropping, white blood cells are recovering, or platelets are improving compared to the previous report. For the patient, prepare a simple and empathetic alert message only if important values such as hemoglobin, white blood cells, or platelets are below normal. Explain which value is low or high, what this could mean in plain language, and encourage the patient to discuss the findings with their doctor, while avoiding treatment recommendations. The output should return both the doctor's structured summary and the patient's alert message.

        Email content: "${emailText}"

        Respond with a JSON object in this exact format:
        {
          "doctor_summary": {
            "hematology": {
              "hemoglobin": {
                "value": "current value",
                "reference_range": "normal range",
                "trend": "improving/declining/stable",
                "clinical_notes": "interpretation"
              },
              "white_blood_cells": {
                "value": "current value",
                "reference_range": "normal range", 
                "trend": "improving/declining/stable",
                "clinical_notes": "interpretation"
              },
              "platelets": {
                "value": "current value",
                "reference_range": "normal range",
                "trend": "improving/declining/stable", 
                "clinical_notes": "interpretation"
              }
            },
            "liver_function": {},
            "renal_function": {}
          },
          "patient_alert": {
            "message": "Patient-friendly alert message if needed",
            "severity": "low|medium|high"
          }
        }
      `;

      const response = await this.openai!.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      logger.error('Failed to process blood test report:', error);
      throw error;
    }
  }

  async processInvoices(emailText: string): Promise<InvoiceReport> {
    try {
      const prompt = `
        You are preparing a weekly package of medical bills and invoices for insurance submission. Consolidate all of the invoices provided, and generate a short professional cover email addressed to the insurer i.e. NivaBupa. The email should include the patient's name, the policy number if available, the total claim amount, and a note that the detailed invoices are attached. Also create a clean summary table listing each invoice with its number, provider name, date, and billed amount, and calculate the total of all invoices combined. Keep the tone formal and business-like so that the content is ready for submission to the insurance company. The output should return the cover email text, the total claim amount (in rupees) and the invoices attached. Extract the hospital name and dates from the invoices itself.

        Email content: "${emailText}"

        Respond with a JSON object in this exact format:
        {
          "cover_email": {
            "subject": "Insurance Claim Submission - [Patient Name]",
            "body": "Professional email body for insurance company"
          },
          "total_claim_amount": 0,
          "invoices": [
            {
              "invoice_number": "INV001",
              "provider_name": "Hospital Name",
              "date": "YYYY-MM-DD",
              "amount": 0
            }
          ]
        }
      `;

      const response = await this.openai!.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      logger.error('Failed to process invoices:', error);
      throw error;
    }
  }

  async extractMedicines(emailText: string): Promise<string[]> {
    try {
      const prompt = `
        You are a medical text extraction assistant. Your job is to read the email texts and identify all medicines or drugs mentioned. Do not include dosages, strengths, or schedules — for example, "Zepbound 2.5 mg weekly" should simply be "Zepbound." Ignore anything that is not a medicine, such as lab tests (e.g., CBC, PET/CT), doctor names, hospital names, or billing information.

        Email content: "${emailText}"

        Respond with a JSON object containing an array of medicine names:
        {
          "medicines": ["medicine1", "medicine2", ...]
        }
      `;

      const response = await this.openai!.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.medicines || [];
    } catch (error) {
      logger.error('Failed to extract medicines:', error);
      throw error;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai!.embeddings.create({
        model: 'text-embedding-3-small',
        input: text
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  async summarizePatientHistory(history: any[], currentReport: any): Promise<string> {
    try {
      const prompt = `
        Based on the patient's medical history and current report, provide a brief summary highlighting trends and key insights for the doctor.

        Previous reports: ${JSON.stringify(history)}
        Current report: ${JSON.stringify(currentReport)}

        Provide a concise summary focusing on:
        1. Key trends in test results
        2. Notable changes from previous reports
        3. Any concerning patterns
        4. Recommendations for follow-up
      `;

      const response = await this.openai!.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      });

      return response.choices[0].message.content || '';
    } catch (error) {
      logger.error('Failed to summarize patient history:', error);
      throw error;
    }
  }
}