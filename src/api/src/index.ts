import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { Pool } from 'pg';
import { powerPlantsRouter } from './routes/powerPlants';
import { statsRouter } from './routes/stats';
import { errorHandler } from './middleware/errorHandler';
import { swaggerSpec } from './swagger';

const app = express();
const port = process.env.PORT || 3000;

// Database connection
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/datagoose',
});

// Middleware - relaxed security for local development
app.use(
  helmet({
    contentSecurityPolicy: false,
    hsts: false,
  })
);
app.use(cors());
app.use(express.json());

// Swagger documentation
app.get('/api/spec', (_req, res) => res.json(swaggerSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: 'Database connection failed' });
  }
});

// API Routes
app.use('/api/power-plants', powerPlantsRouter);
app.use('/api/stats', statsRouter);

// Error handling
app.use(errorHandler);

// Start server
app.listen(port, () => {
  console.log(`🚀 Datagoose API running at http://localhost:${port}`);
  console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
});
