import { parseJobArg } from './run-jobs';

describe('runJobs CLI argument parsing', () => {
  it('defaults to "all" when no flags are provided', () => {
    expect(parseJobArg([])).toBe('all');
  });

  it('parses --job=expire-holds syntax', () => {
    expect(parseJobArg(['--job=expire-holds'])).toBe('expire-holds');
  });

  it('parses --job expire-holds space syntax', () => {
    expect(parseJobArg(['--job', 'expire-holds'])).toBe('expire-holds');
  });

  it('parses --job=reminders syntax', () => {
    expect(parseJobArg(['--other-flag', '--job=reminders'])).toBe('reminders');
  });

  it('parses --job=all explicitly', () => {
    expect(parseJobArg(['--job=all'])).toBe('all');
  });
});
