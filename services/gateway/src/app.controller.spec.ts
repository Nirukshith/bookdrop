import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('healthCheck', () => {
    it('should return gateway health status', () => {
      const result = appController.healthCheck();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('gateway');
      expect(result.timestamp).toBeDefined();
    });
  });
});

