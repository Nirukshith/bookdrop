export { CopiesModule } from './copies.module';
export { CopiesService } from './copies.service';
export {
  CopiesPublicApi,
  CopyPublicObject,
} from './copies-public-api.interface';
export {
  ALLOWED_MANUAL_TRANSITIONS,
  CopyState,
  TransitionResult,
  canTransitionManually,
  assertValidManualTransition,
  canRetireCopy,
  assertCanRetireCopy,
} from './copy-state-machine';
export { CopyStatusConflictError } from './errors/copy-status-conflict.error';
export { DuplicateBarcodeError } from './errors/duplicate-barcode.error';
export { InvalidCopyStateTransitionError } from './errors/invalid-copy-state-transition.error';
export {
  CopyCreatedEvent,
  CopyStatusChangedEvent,
  CopyRetiredEvent,
} from './events';
