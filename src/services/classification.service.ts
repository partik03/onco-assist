import { OpenAIService } from './openai.service';
import { TiDBService } from './tidb.service';
import { ClassificationResult, EmailData, VectorDocument, SearchResult } from '../types';
import { logger } from '../utils/logger';

export class ClassificationService {
  private openaiService: OpenAIService;
  private tidbService: TiDBService;

  constructor(openaiService: OpenAIService, tidbService: TiDBService) {
    this.openaiService = openaiService;
    this.tidbService = tidbService;
  }

  async classifyAndEnhanceEmail(emailData: EmailData): Promise<ClassificationResult> {
    try {
      logger.info(`Classifying email: ${emailData.id}`);

      // Step 1: Basic classification using OpenAI
      const classification = await this.openaiService.classifyEmail(emailData.text);

      // Step 2: Generate embedding for semantic search
      const embedding = await this.openaiService.generateEmbedding(emailData.text);

      // Step 3: Search for similar historical cases
      const similarCases = await this.tidbService.searchSimilarDocuments(
        embedding,
        this.mapCategoryToType(classification.category),
        3
      );

      // Step 4: Enhance classification with historical context
      const enhancedClassification = await this.enhanceWithHistoricalContext(
        classification,
        similarCases,
        emailData
      );

      // Step 5: Store the email as a vector document for future searches
      await this.storeEmailVector(emailData, embedding, classification.category);

      logger.info(`Email ${emailData.id} classified as: ${enhancedClassification.category}`);
      return enhancedClassification;

    } catch (error) {
      logger.error(`Failed to classify email ${emailData.id}:`, error);
      throw error;
    }
  }

  private async enhanceWithHistoricalContext(
    classification: ClassificationResult,
    similarCases: SearchResult[],
    emailData: EmailData
  ): Promise<ClassificationResult> {
    try {
      if (similarCases.length === 0) {
        return classification;
      }

      // Analyze patterns in similar cases
      const contextAnalysis = await this.analyzeHistoricalPattern(similarCases, emailData);
      
      // Adjust confidence based on historical patterns
      let adjustedConfidence = classification.confidence;
      
      if (contextAnalysis.strongPattern) {
        adjustedConfidence = Math.min(0.95, classification.confidence + 0.2);
      } else if (contextAnalysis.weakPattern) {
        adjustedConfidence = Math.max(0.3, classification.confidence - 0.1);
      }

      return {
        ...classification,
        confidence: adjustedConfidence,
        extractedData: {
          ...classification.extractedData,
          similarCases: similarCases.map(sc => ({
            id: sc.document.id,
            similarity: sc.similarity,
            type: sc.document.metadata.type
          })),
          historicalContext: contextAnalysis
        }
      };
    } catch (error) {
      logger.error('Failed to enhance with historical context:', error);
      return classification;
    }
  }

  private async analyzeHistoricalPattern(
    similarCases: SearchResult[],
    currentEmail: EmailData
  ): Promise<{strongPattern: boolean, weakPattern: boolean, insights: string[]}> {
    try {
      const insights: string[] = [];
      let strongPattern = false;
      let weakPattern = false;

      // Check if similar cases have consistent categorization
      const categories = similarCases.map(sc => sc.document.metadata.type);
      const uniqueCategories = new Set(categories);
      
      if (uniqueCategories.size === 1 && similarCases.length >= 2) {
        strongPattern = true;
        insights.push(`Strong pattern: ${similarCases.length} similar cases all categorized as ${categories[0]}`);
      } else if (uniqueCategories.size <= 2 && similarCases.length >= 3) {
        weakPattern = true;
        insights.push(`Weak pattern: Mixed categorization in similar cases`);
      }

      // Check temporal patterns
      const recentCases = similarCases.filter(sc => {
        const caseDate = new Date(sc.document.metadata.timestamp);
        const daysDiff = (Date.now() - caseDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= 30; // Cases from last 30 days
      });

      if (recentCases.length > 0) {
        insights.push(`Found ${recentCases.length} similar cases from the last 30 days`);
      }

      // Analyze content patterns
      const contentPatterns = await this.extractContentPatterns(similarCases);
      insights.push(...contentPatterns);

      return { strongPattern, weakPattern, insights };
    } catch (error) {
      logger.error('Failed to analyze historical pattern:', error);
      return { strongPattern: false, weakPattern: false, insights: [] };
    }
  }

  private async extractContentPatterns(similarCases: SearchResult[]): Promise<string[]> {
    const patterns: string[] = [];

    try {
      // Extract common keywords and phrases
      const allContent = similarCases.map(sc => sc.document.content).join(' ');
      
      // Common medical terms analysis
      const medicalTerms = this.extractMedicalTerms(allContent);
      if (medicalTerms.length > 0) {
        patterns.push(`Common medical terms: ${medicalTerms.slice(0, 5).join(', ')}`);
      }

      // Check for report structure patterns
      const hasNumericValues = /\d+\.?\d*\s*(mg|ml|units|%)/i.test(allContent);
      if (hasNumericValues) {
        patterns.push('Contains numeric medical values');
      }

      const hasDatePattern = /\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/i.test(allContent);
      if (hasDatePattern) {
        patterns.push('Contains date patterns');
      }

      return patterns;
    } catch (error) {
      logger.error('Failed to extract content patterns:', error);
      return [];
    }
  }

  private extractMedicalTerms(text: string): string[] {
    const commonMedicalTerms = [
      'hemoglobin', 'glucose', 'cholesterol', 'blood pressure', 'heart rate',
      'ct scan', 'mri', 'x-ray', 'ultrasound', 'biopsy', 'pathology',
      'tumor', 'lesion', 'metastasis', 'staging', 'malignant', 'benign',
      'invoice', 'bill', 'payment', 'insurance', 'claim', 'hospital',
      'medication', 'prescription', 'dosage', 'pharmacy', 'drug'
    ];

    const foundTerms = commonMedicalTerms.filter(term => 
      new RegExp(term, 'i').test(text)
    );

    return foundTerms;
  }

  private async storeEmailVector(
    emailData: EmailData,
    embedding: number[],
    category: string
  ): Promise<void> {
    try {
      const vectorDocument: VectorDocument = {
        id: `email_${emailData.id}`,
        content: emailData.text,
        embedding: embedding,
        metadata: {
          type: this.mapCategoryToType(category),
          source: `email_${emailData.id}`,
          timestamp: new Date().toISOString(),
          subject: emailData.subject,
          sender: emailData.from,
          originalDate: emailData.date
        }
      };

      await this.tidbService.storeDocument(vectorDocument);
      logger.info(`Stored email vector for ${emailData.id}`);
    } catch (error) {
      logger.error(`Failed to store email vector for ${emailData.id}:`, error);
    }
  }

  private mapCategoryToType(category: string): string {
    const mapping: Record<string, string> = {
      'PET/CT/Histopathology': 'radiology',
      'Blood Tests': 'blood_test',
      'Bills/Invoices': 'invoice',
      'Medicines': 'medicine'
    };

    return mapping[category] || 'unknown';
  }

  // Advanced classification methods
  async classifyWithMultipleModels(emailData: EmailData): Promise<ClassificationResult[]> {
    try {
      // Get classification from multiple perspectives
      const classifications = await Promise.all([
        this.openaiService.classifyEmail(emailData.text),
        this.classifyByKeywords(emailData.text),
        this.classifyByStructure(emailData.text)
      ]);

      return classifications;
    } catch (error) {
      logger.error('Failed to classify with multiple models:', error);
      throw error;
    }
  }

  private async classifyByKeywords(text: string): Promise<ClassificationResult> {
    const keywordMaps = {
      'PET/CT/Histopathology': ['pet', 'ct', 'scan', 'biopsy', 'pathology', 'tumor', 'lesion', 'suv', 'staging'],
      'Blood Tests': ['hemoglobin', 'hematocrit', 'wbc', 'rbc', 'platelet', 'glucose', 'creatinine', 'lab', 'blood'],
      'Bills/Invoices': ['bill', 'invoice', 'payment', 'insurance', 'claim', 'amount', 'due', 'hospital', 'charge'],
      'Medicines': ['medication', 'drug', 'prescription', 'pharmacy', 'dosage', 'tablet', 'capsule', 'medicine']
    };

    let bestCategory = 'PET/CT/Histopathology';
    let maxScore = 0;

    for (const [category, keywords] of Object.entries(keywordMaps)) {
      const score = keywords.reduce((acc, keyword) => {
        const regex = new RegExp(keyword, 'gi');
        const matches = text.match(regex);
        return acc + (matches ? matches.length : 0);
      }, 0);

      if (score > maxScore) {
        maxScore = score;
        bestCategory = category;
      }
    }

    return {
      category: bestCategory as any,
      confidence: Math.min(0.8, maxScore / 10) // Normalize score
    };
  }

  private async classifyByStructure(text: string): Promise<ClassificationResult> {
    // Analyze document structure patterns
    const hasNumericValues = /\d+\.?\d*\s*(mg\/dl|mmol\/l|units|%)/gi.test(text);
    const hasDateHeaders = /date|time|reported/gi.test(text);
    const hasMonetaryValues = /\$|\₹|amount|total|bill|invoice/gi.test(text);
    const hasMedicalTerms = /diagnosis|treatment|medication|prescription/gi.test(text);

    let category: string;
    let confidence: number;

    if (hasMonetaryValues) {
      category = 'Bills/Invoices';
      confidence = 0.7;
    } else if (hasNumericValues && hasDateHeaders) {
      category = 'Blood Tests';
      confidence = 0.6;
    } else if (hasMedicalTerms) {
      category = 'Medicines';
      confidence = 0.5;
    } else {
      category = 'PET/CT/Histopathology';
      confidence = 0.4;
    }

    return {
      category: category as any,
      confidence
    };
  }

  // Ensemble classification combining multiple approaches
  async ensembleClassification(emailData: EmailData): Promise<ClassificationResult> {
    try {
      const classifications = await this.classifyWithMultipleModels(emailData);
      
      // Weight the classifications
      const weights = [0.7, 0.2, 0.1]; // OpenAI, keywords, structure
      const categoryScores: Record<string, number> = {};

      classifications.forEach((classification, index) => {
        const category = classification.category;
        const weight = weights[index] || 0.1;
        const score = classification.confidence * weight;
        
        categoryScores[category] = (categoryScores[category] || 0) + score;
      });

      // Find the category with highest weighted score
      let bestCategory = 'PET/CT/Histopathology';
      let maxScore = 0;

      for (const [category, score] of Object.entries(categoryScores)) {
        if (score > maxScore) {
          maxScore = score;
          bestCategory = category;
        }
      }

      return {
        category: bestCategory as any,
        confidence: Math.min(0.95, maxScore),
        extractedData: {
          ensemble: true,
          individualClassifications: classifications,
          weightedScores: categoryScores
        }
      };
    } catch (error) {
      logger.error('Failed to perform ensemble classification:', error);
      // Fallback to basic classification
      return await this.openaiService.classifyEmail(emailData.text);
    }
  }
}
