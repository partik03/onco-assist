import { ClassificationService } from '../services/classification.service';
import { OpenAIService } from '../services/openai.service';
import { TiDBService } from '../services/tidb.service';
import { EmailData } from '../types';

// Mock the services
jest.mock('../services/openai.service');
jest.mock('../services/tidb.service');

describe('ClassificationService', () => {
  let classificationService: ClassificationService;
  let mockOpenAIService: jest.Mocked<OpenAIService>;
  let mockTiDBService: jest.Mocked<TiDBService>;

  beforeEach(() => {
    mockOpenAIService = new OpenAIService({ apiKey: 'test' }) as jest.Mocked<OpenAIService>;
    mockTiDBService = new TiDBService({
      host: 'test',
      port: 4000,
      user: 'test',
      password: 'test',
      database: 'test'
    }) as jest.Mocked<TiDBService>;

    classificationService = new ClassificationService(mockOpenAIService, mockTiDBService);
  });

  describe('classifyAndEnhanceEmail', () => {
    const mockEmailData: EmailData = {
      id: 'test-email-1',
      subject: 'Blood Test Results',
      text: 'Your recent blood test shows hemoglobin level of 12.5 g/dL',
      from: 'lab@hospital.com',
      date: '2024-01-15T10:00:00Z'
    };

    it('should classify email and enhance with historical context', async () => {
      // Mock OpenAI classification
      mockOpenAIService.classifyEmail.mockResolvedValue({
        category: 'Blood Tests',
        confidence: 0.9
      });

      // Mock embedding generation
      mockOpenAIService.generateEmbedding.mockResolvedValue(
        Array(1536).fill(0).map(() => Math.random())
      );

      // Mock similar documents search
      mockTiDBService.searchSimilarDocuments.mockResolvedValue([
        {
          document: {
            id: 'doc-1',
            content: 'Previous blood test',
            embedding: [],
            metadata: {
              type: 'blood_test',
              source: 'email-prev',
              timestamp: '2024-01-10T10:00:00Z'
            }
          },
          similarity: 0.85
        }
      ]);

      // Mock document storage
      mockTiDBService.storeDocument.mockResolvedValue();

      const result = await classificationService.classifyAndEnhanceEmail(mockEmailData);

      expect(result.category).toBe('Blood Tests');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.extractedData?.similarCases).toHaveLength(1);
      expect(mockOpenAIService.classifyEmail).toHaveBeenCalledWith(mockEmailData.text);
      expect(mockTiDBService.storeDocument).toHaveBeenCalled();
    });

    it('should handle classification errors gracefully', async () => {
      mockOpenAIService.classifyEmail.mockRejectedValue(new Error('OpenAI API error'));

      await expect(
        classificationService.classifyAndEnhanceEmail(mockEmailData)
      ).rejects.toThrow('OpenAI API error');
    });
  });

  describe('ensembleClassification', () => {
    const mockEmailData: EmailData = {
      id: 'test-email-2',
      subject: 'Medical Bill',
      text: 'Invoice for hospital services. Total amount: $1,250.00',
      from: 'billing@hospital.com',
      date: '2024-01-15T10:00:00Z'
    };

    it('should combine multiple classification methods', async () => {
      mockOpenAIService.classifyEmail.mockResolvedValue({
        category: 'Bills/Invoices',
        confidence: 0.8
      });

      const result = await classificationService.ensembleClassification(mockEmailData);

      expect(result.category).toBe('Bills/Invoices');
      expect(result.extractedData?.ensemble).toBe(true);
      expect(result.extractedData?.individualClassifications).toHaveLength(3);
    });
  });

  describe('keyword classification', () => {
    it('should correctly classify blood test emails by keywords', async () => {
      const bloodTestEmail: EmailData = {
        id: 'test-blood',
        subject: 'Lab Results',
        text: 'Hemoglobin: 13.2 g/dL, WBC: 7500/μL, Platelet count: 250,000/μL',
        from: 'lab@example.com',
        date: '2024-01-15T10:00:00Z'
      };

      const classifications = await classificationService.classifyWithMultipleModels(bloodTestEmail);
      
      // At least one classification should identify this as a blood test
      const bloodTestClassification = classifications.find(c => c.category === 'Blood Tests');
      expect(bloodTestClassification).toBeDefined();
    });

    it('should correctly classify invoice emails by keywords', async () => {
      const invoiceEmail: EmailData = {
        id: 'test-invoice',
        subject: 'Hospital Bill',
        text: 'Total amount due: $500.00. Payment due by end of month. Insurance claim submitted.',
        from: 'billing@example.com',
        date: '2024-01-15T10:00:00Z'
      };

      const classifications = await classificationService.classifyWithMultipleModels(invoiceEmail);
      
      // Should be classified as invoice
      const invoiceClassification = classifications.find(c => c.category === 'Bills/Invoices');
      expect(invoiceClassification).toBeDefined();
    });
  });
});
