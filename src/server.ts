import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { MedicalWorkflow } from './workflow/medical-workflow';

// Import route handlers
import authRoutes from './routes/auth';
import webhookRoutes from './routes/webhooks';
import apiRoutes from './routes/api';
import whatsappRoutes from './routes/whatsapp';

export class OncoAssistServer {
  private app: express.Application;
  private workflow: MedicalWorkflow;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000');
    this.workflow = new MedicalWorkflow(config);
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });

    // Make workflow available to routes
    this.app.locals.workflow = this.workflow;
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'OncoAssist Medical Workflow API'
      });
    });

    // Route handlers
    this.app.use('/api/auth', authRoutes);
    this.app.use('/webhooks', webhookRoutes);
    this.app.use('/api', apiRoutes);
    this.app.use('/whatsapp', whatsappRoutes);

    // Error handling
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
      });
    });

    // 404 handler - must be last
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });
  }

  async start(): Promise<void> {
    try {
      // Validate configuration
      validateConfig();
      
      // Initialize medical workflow
      await this.workflow.initialize();
      
      // Start server
      this.app.listen(this.port, () => {
        logger.info(`🚀 OncoAssist API server running on port ${this.port}`);
        logger.info(`📊 Health check: http://localhost:${this.port}/health`);
        logger.info(`🔐 OAuth: http://localhost:${this.port}/auth/google`);
        logger.info(`📲 WhatsApp Bot: http://localhost:${this.port}/whatsapp/webhook`);
      });

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    logger.info('Shutting down OncoAssist server...');
    await this.workflow.shutdown();
  }

  getApp(): express.Application {
    return this.app;
  }
}

