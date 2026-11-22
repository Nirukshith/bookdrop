import { Test, TestingModule } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { NotificationsConsumer } from './notifications.consumer';
import { NotificationsSubscriber } from './notifications.subscriber';

describe('NotificationsConsumer', () => {
  let consumer: NotificationsConsumer;
  let mockSubscriber: jest.Mocked<Partial<NotificationsSubscriber>>;
  let mockChannel: { ack: jest.Mock; nack: jest.Mock };
  let mockContext: Partial<RmqContext>;
  const dummyMsg = { fields: { routingKey: 'loan.started' } };

  beforeEach(async () => {
    mockSubscriber = {
      enqueueNotification: jest.fn().mockResolvedValue(undefined),
    };
    mockChannel = {
      ack: jest.fn(),
      nack: jest.fn(),
    };
    mockContext = {
      getChannelRef: jest.fn().mockReturnValue(mockChannel),
      getMessage: jest.fn().mockReturnValue(dummyMsg),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsConsumer],
      providers: [
        {
          provide: NotificationsSubscriber,
          useValue: mockSubscriber,
        },
      ],
    }).compile();

    consumer = module.get<NotificationsConsumer>(NotificationsConsumer);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should process event and acknowledge the message', async () => {
    const event = { eventName: 'loan.started', loanId: 101 };
    await consumer.handleRabbitMQEvent(event, mockContext as RmqContext);

    expect(mockSubscriber.enqueueNotification).toHaveBeenCalledWith(event);
    expect(mockChannel.ack).toHaveBeenCalledWith(dummyMsg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('should call channel.nack when subscriber.enqueueNotification throws', async () => {
    (mockSubscriber.enqueueNotification as jest.Mock).mockRejectedValueOnce(
      new Error('DB failure'),
    );
    const event = { eventName: 'loan.started', loanId: 101 };

    await consumer.handleRabbitMQEvent(event, mockContext as RmqContext);

    expect(mockChannel.nack).toHaveBeenCalledWith(dummyMsg, false, false);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('should safely execute if channelRef is missing', async () => {
    const emptyContext = {} as RmqContext;
    const event = { eventName: 'hold.confirmed' };

    await expect(
      consumer.handleRabbitMQEvent(event, emptyContext),
    ).resolves.not.toThrow();
    expect(mockSubscriber.enqueueNotification).toHaveBeenCalledWith(event);
  });
});
