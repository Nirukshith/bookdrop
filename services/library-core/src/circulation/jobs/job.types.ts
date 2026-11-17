import { ClockService } from '../../common/clock/clock.service';

export interface JobStats {
  processed: number;
  failed: number;
  eventsEmitted: number;
  batches?: number;
  [key: string]: any;
}

export interface JobContext {
  readonly clock: ClockService;
  readonly batchSize: number;
  readonly maxRunSeconds: number;
  renewLease(): Promise<void>;
  isAborted(): boolean;
  timeRemainingMs(): number;
}

export interface Job {
  readonly name: string;
  readonly intervalSeconds: number;
  run(context: JobContext): Promise<JobStats>;
}

export interface JobRunResult {
  jobName: string;
  skipped: boolean;
  status: 'COMPLETED' | 'FAILED' | 'SKIPPED';
  durationMs: number;
  stats?: JobStats;
  error?: string;
}

export const JOB_REGISTRY_TOKEN = 'JOB_REGISTRY_TOKEN';
