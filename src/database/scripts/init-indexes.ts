import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AppModule } from '../../app.module';

async function initIndexes() {
  const logger = new Logger('InitIndexes');
  logger.log('Starting controlled MongoDB index initialization...');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const connection = app.get<Connection>(getConnectionToken());
    const models = Object.entries(connection.models);

    logger.log(`Found ${models.length} registered Mongoose models to index.`);

    for (const [modelName, model] of models) {
      const startTime = Date.now();
      await model.createIndexes();
      const duration = Date.now() - startTime;
      const indexes = await model.collection.indexes();
      logger.log(
        `✓ [${modelName}] (${indexes.length} indexes) synchronized in ${duration}ms`,
      );
    }

    logger.log('All MongoDB indexes successfully created and verified.');
  } catch (error: any) {
    logger.error(`Error during index initialization: ${error.message}`, error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

initIndexes();

