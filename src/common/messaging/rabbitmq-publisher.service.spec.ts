import { Test, TestingModule } from '@nestjs/testing';
import { ClientProxy } from '@nestjs/microservices';
import { RabbitMQPublisherService } from './rabbitmq-publisher.service';
import { RABBITMQ_SERVICE } from './messaging.constants';

describe('RabbitMQPublisherService', () => {
  let service: RabbitMQPublisherService;
  let mockClient: jest.Mocked<Partial<ClientProxy>>;

  beforeEach(async () => {
    mockClient = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQPublisherService,
        {
          provide: RABBITMQ_SERVICE,
          useValue: mockClient,
        },
      ],
    }).compile();

    service = module.get<RabbitMQPublisherService>(RabbitMQPublisherService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should publish an event to RabbitMQ using client.emit', async () => {
    const payload = { loanId: 101, memberEmail: 'test@example.com' };
    await service.publish('loan.started', payload);

    expect(mockClient.emit).toHaveBeenCalledWith('loan.started', payload);
  });

  it('should extract eventName from domain payload and publish', async () => {
    const event = {
      eventName: 'hold.confirmed',
      holdId: 202,
      copyBarcode: 'BC-1001',
    };
    await service.handleDomainEvent(event);

    expect(mockClient.emit).toHaveBeenCalledWith('hold.confirmed', event);
  });

  it('should fallback to domain.event if eventName is missing', async () => {
    const event = { holdId: 202 };
    await service.handleDomainEvent(event);

    expect(mockClient.emit).toHaveBeenCalledWith('domain.event', event);
  });

  it('should catch errors gracefully and not throw if client.emit fails', async () => {
    (mockClient.emit as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Connection refused');
    });

    await expect(
      service.publish('loan.started', { id: 1 }),
    ).resolves.not.toThrow();
  });

  it('should not throw if client is not provided (optional dependency)', async () => {
    const standaloneService = new RabbitMQPublisherService(undefined);
    await expect(
      standaloneService.publish('loan.started', { id: 1 }),
    ).resolves.not.toThrow();
  });
});
