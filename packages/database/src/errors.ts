/** A query failed in the underlying driver. The original error is on `cause`. */
export class DatabaseError extends Error {
  override readonly name = 'DatabaseError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** The database configuration or environment is missing or invalid. */
export class DatabaseConfigError extends Error {
  override readonly name = 'DatabaseConfigError';
}
