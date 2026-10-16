import { LoggerService } from '@nestjs/common';

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /credential/i,
];

export class JsonLogger implements LoggerService {
  log(message: any, ...optionalParams: any[]) {
    this.output('info', message, optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    this.output('error', message, optionalParams);
  }

  warn(message: any, ...optionalParams: any[]) {
    this.output('warn', message, optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    this.output('debug', message, optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]) {
    this.output('verbose', message, optionalParams);
  }

  private output(level: string, message: any, optionalParams: any[]) {
    let context: string | undefined;
    let stack: string | undefined;

    if (optionalParams.length > 0) {
      const last = optionalParams[optionalParams.length - 1];
      if (typeof last === 'string') {
        context = last;
      }
      if (
        level === 'error' &&
        optionalParams.length > 1 &&
        typeof optionalParams[0] === 'string'
      ) {
        stack = optionalParams[0];
      }
    }

    const logEntry: Record<string, any> = {
      timestamp: new Date().toISOString(),
      level,
      message: this.sanitize(message),
    };

    if (context) {
      logEntry.context = context;
    }

    if (stack) {
      logEntry.stack = stack;
    }

    const line = JSON.stringify(logEntry) + '\n';
    if (level === 'error') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  }

  private sanitize(data: any): any {
    if (typeof data === 'string') {
      let sanitized = data;
      for (const pattern of SENSITIVE_KEY_PATTERNS) {
        // Redact key-value pairs in connection strings or JSON-like fragments
        sanitized = sanitized.replace(
          new RegExp(`(${pattern.source})(=|:\\s*)([^&\\s"']+)`, 'gi'),
          '$1$2[REDACTED]',
        );
      }
      return sanitized;
    }

    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitize(item));
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitize(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
