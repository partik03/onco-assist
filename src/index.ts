#!/usr/bin/env node

import { MedicalWorkflow } from './workflow/medical-workflow';
import { OncoAssistServer } from './server';
import { config, validateConfig, appSettings } from './config';
import { logger } from './utils/logger';
import cron from 'node-cron';

class OncoAssistApp {
  private workflow: MedicalWorkflow;
  private isRunning: boolean = false;

  constructor() {
    this.workflow = new MedicalWorkflow(config);
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting OncoAssist Application...');
      
      // Validate configuration
      validateConfig();
      logger.info('Configuration validated successfully');

      // Initialize workflow
      await this.workflow.initialize();
      logger.info('Medical workflow initialized');

      // Set up graceful shutdown
      this.setupGracefulShutdown();

      // Start email processing scheduler
      this.startScheduler();

      // Process any existing emails immediately
      await this.processEmails();

      this.isRunning = true;
      logger.info(`OncoAssist started successfully in ${appSettings.nodeEnv} mode`);
      logger.info(`Email polling interval: ${appSettings.pollIntervalMinutes} minutes`);

    } catch (error) {
      logger.error('Failed to start OncoAssist:', error);
      process.exit(1);
    }
  }

  async startServer(): Promise<void> {
    try {
      logger.info('Starting OncoAssist API Server...');
      
      const server = new OncoAssistServer();
      await server.start();

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private startScheduler(): void {
    // Schedule email processing every hour (or as configured)
    const cronExpression = `*/${appSettings.pollIntervalMinutes} * * * *`;
    
    cron.schedule(cronExpression, async () => {
      if (this.isRunning) {
        await this.processEmails();
      }
    });

    logger.info(`Scheduled email processing with cron: ${cronExpression}`);

    // Schedule weekly report generation (every Sunday at 9 AM)
    cron.schedule('0 9 * * 0', async () => {
      if (this.isRunning) {
        try {
          await this.workflow.generateWeeklyReport();
          logger.info('Weekly report generated successfully');
        } catch (error) {
          logger.error('Failed to generate weekly report:', error);
        }
      }
    });

    logger.info('Scheduled weekly report generation (Sundays at 9 AM)');
  }

  private async processEmails(): Promise<void> {
    try {
      logger.info('Starting scheduled email processing...');
      await this.workflow.processNewEmails();
      logger.info('Scheduled email processing completed');
    } catch (error) {
      logger.error('Error during scheduled email processing:', error);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      this.isRunning = false;
      
      try {
        await this.workflow.shutdown();
        logger.info('OncoAssist shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart
  }

  async processOnce(): Promise<void> {
    try {
      logger.info('Running one-time email processing...');
      
      validateConfig();
      await this.workflow.initialize();
      await this.workflow.processNewEmails();
      await this.workflow.shutdown();
      
      logger.info('One-time processing completed');
    } catch (error) {
      logger.error('One-time processing failed:', error);
      throw error;
    }
  }

  async generateReport(): Promise<void> {
    try {
      logger.info('Generating weekly report...');
      
      validateConfig();
      await this.workflow.initialize();
      await this.workflow.generateWeeklyReport();
      await this.workflow.shutdown();
      
      logger.info('Weekly report generation completed');
    } catch (error) {
      logger.error('Weekly report generation failed:', error);
      throw error;
    }
  }

  async findSimilarCases(symptoms: string[], reportType: string): Promise<void> {
    try {
      logger.info(`Finding similar cases for symptoms: ${symptoms.join(', ')}`);
      
      validateConfig();
      await this.workflow.initialize();
      const cases = await this.workflow.findSimilarCases(symptoms, reportType);
      
      console.log('Similar cases found:');
      console.log(JSON.stringify(cases, null, 2));
      
      await this.workflow.shutdown();
    } catch (error) {
      logger.error('Similar cases search failed:', error);
      throw error;
    }
  }
}

// CLI handling
async function main() {
  const app = new OncoAssistApp();
  const command = process.argv[2];

  switch (command) {
    case 'start':
      await app.start();
      break;

    case 'server':
      await app.startServer();
      break;
      
    case 'process':
      await app.processOnce();
      break;
      
    case 'report':
      await app.generateReport();
      break;
      
    case 'search':
      const symptoms = process.argv.slice(3, -1);
      const reportType = process.argv[process.argv.length - 1];
      if (symptoms.length === 0 || !reportType) {
        console.error('Usage: npm run search <symptom1> <symptom2> ... <reportType>');
        console.error('Example: npm run search "high glucose" "elevated HbA1c" blood_test');
        process.exit(1);
      }
      await app.findSimilarCases(symptoms, reportType);
      break;
      
    default:
      console.log('OncoAssist - AI-powered medical assistant with TiDB integration');
      console.log('');
      console.log('Usage:');
      console.log('  npm start                              Start the application with email polling');
      console.log('  npm run server                         Start the API server with WhatsApp bot');
      console.log('  npm run process                        Process emails once and exit');
      console.log('  npm run report                         Generate weekly report and exit');
      console.log('  npm run search <symptoms> <type>       Search for similar cases');
      console.log('');
      console.log('Examples:');
      console.log('  npm start');
      console.log('  npm run process');
      console.log('  npm run report');
      console.log('  npm run search "high glucose" "elevated HbA1c" blood_test');
      console.log('');
      console.log('Environment variables should be set in .env file (see env.example)');
      break;
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the application
if (require.main === module) {
  main().catch((error) => {
    logger.error('Application failed:', error);
    process.exit(1);
  });
}

export default OncoAssistApp;