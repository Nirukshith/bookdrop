import { JsonLogger } from './json-logger';

describe('JsonLogger', () => {
  let logger: JsonLogger;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new JsonLogger();
    stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('outputs single-line structured JSON to stdout for log/info', () => {
    logger.log('Server started successfully', 'Bootstrap');

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(stdoutSpy.mock.calls[0][0]);

    expect(output.level).toBe('info');
    expect(output.message).toBe('Server started successfully');
    expect(output.context).toBe('Bootstrap');
    expect(output.timestamp).toBeDefined();
  });

  it('outputs structured JSON with stack to stderr for error', () => {
    const errorStack = 'Error: DB failure\n    at test.ts:10:5';
    logger.error('Database connection failed', errorStack, 'Database');

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(stderrSpy.mock.calls[0][0]);

    expect(output.level).toBe('error');
    expect(output.message).toBe('Database connection failed');
    expect(output.stack).toBe(errorStack);
    expect(output.context).toBe('Database');
  });

  it('redacts sensitive fields in objects and strings', () => {
    logger.log({
      user: 'alice@example.com',
      password: 'mySecretPassword123!',
      jwtAccessToken: 'super-secret-token',
      nested: {
        apiSecretKey: 'xyz987',
      },
    });

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(stdoutSpy.mock.calls[0][0]);

    expect(output.message.user).toBe('alice@example.com');
    expect(output.message.password).toBe('[REDACTED]');
    expect(output.message.jwtAccessToken).toBe('[REDACTED]');
    expect(output.message.nested.apiSecretKey).toBe('[REDACTED]');
  });
});
