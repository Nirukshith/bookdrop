export class InvalidCopyStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCopyStateTransitionError';
  }
}
