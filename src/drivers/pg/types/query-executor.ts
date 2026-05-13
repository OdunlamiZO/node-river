import { Pool } from 'pg';

/**
 * A pg object that can run SQL queries.
 */
type QueryExecutor = Pick<Pool, 'query'>;

export default QueryExecutor;
