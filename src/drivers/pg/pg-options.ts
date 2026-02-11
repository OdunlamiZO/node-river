/**
 * Options for configuring the RiverQueue pg driver connection pool.
 */
export default interface PgDriverOptions {
  /** Database connection string */
  connectionString: string;
  /** Optional: Connection timeout in milliseconds */
  connectionTimeoutMillis?: number;
  /** Optional: Idle timeout in milliseconds */
  idleTimeoutMillis?: number;
  /** Optional: Maximum number of clients in the pool */
  max?: number;
}
