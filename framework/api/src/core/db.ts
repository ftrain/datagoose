/**
 * Database Pool Management
 *
 * Provides a configured PostgreSQL connection pool.
 */

import { Pool, PoolConfig } from 'pg';

export interface DatabaseConfig {
  /** Database connection URL */
  connectionString?: string;
  /** Maximum pool size (default: 20) */
  maxConnections?: number;
  /** Connection timeout in ms (default: 30000) */
  connectionTimeout?: number;
  /** Idle timeout in ms (default: 10000) */
  idleTimeout?: number;
}

const defaultConfig: DatabaseConfig = {
  maxConnections: 20,
  connectionTimeout: 30000,
  idleTimeout: 10000,
};

/**
 * Create a PostgreSQL connection pool
 */
export function createPool(config: DatabaseConfig = {}): Pool {
  const mergedConfig = { ...defaultConfig, ...config };

  const poolConfig: PoolConfig = {
    connectionString: mergedConfig.connectionString ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/datagoose',
    max: mergedConfig.maxConnections,
    connectionTimeoutMillis: mergedConfig.connectionTimeout,
    idleTimeoutMillis: mergedConfig.idleTimeout,
  };

  const pool = new Pool(poolConfig);

  // Log pool errors
  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
  });

  return pool;
}

/**
 * Test database connection
 */
export async function testConnection(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

/**
 * Health check endpoint handler factory
 */
export function createHealthCheck(pool: Pool) {
  return async (_req: any, res: any) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: 'Database connection failed'
      });
    }
  };
}
