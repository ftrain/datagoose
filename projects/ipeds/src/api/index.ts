import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/error.js';
import institutionsRouter from './routes/institutions.js';
import admissionsRouter from './routes/admissions.js';
import enrollmentRouter from './routes/enrollment.js';
import graduationRouter from './routes/graduation.js';
import completionsRouter from './routes/completions.js';
import financialRouter from './routes/financial.js';
import searchRouter from './routes/search.js';
import statsRouter from './routes/stats.js';
import queryRouter from './routes/query.js';
import exploreRouter from './routes/explore.js';
import cipRouter from './routes/cip.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/institutions', institutionsRouter);
app.use('/api/admissions', admissionsRouter);
app.use('/api/enrollment', enrollmentRouter);
app.use('/api/graduation', graduationRouter);
app.use('/api/completions', completionsRouter);
app.use('/api/financial', financialRouter);
app.use('/api/search', searchRouter);
app.use('/api/stats', statsRouter);
app.use('/api/query', queryRouter);
app.use('/api/explore', exploreRouter);
app.use('/api/cip', cipRouter);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`IPEDS API server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /api/institutions');
  console.log('  GET /api/institutions/:unitid');
  console.log('  GET /api/institutions/:unitid/similar');
  console.log('  GET /api/institutions/geo/nearby');
  console.log('  GET /api/admissions');
  console.log('  GET /api/admissions/trends/:unitid');
  console.log('  GET /api/admissions/most-selective');
  console.log('  GET /api/enrollment');
  console.log('  GET /api/enrollment/totals');
  console.log('  GET /api/enrollment/by-race/:unitid');
  console.log('  GET /api/enrollment/trends/:unitid');
  console.log('  GET /api/graduation');
  console.log('  GET /api/graduation/rates/:unitid');
  console.log('  GET /api/graduation/by-race/:unitid');
  console.log('  GET /api/graduation/top');
  console.log('  GET /api/completions');
  console.log('  GET /api/completions/by-field/:unitid');
  console.log('  GET /api/completions/trends/:unitid');
  console.log('  GET /api/completions/top-programs');
  console.log('  GET /api/financial');
  console.log('  GET /api/financial/trends/:unitid');
  console.log('  GET /api/financial/most-affordable');
  console.log('  GET /api/financial/high-pell');
  console.log('  GET /api/search/text');
  console.log('  GET /api/search/similar');
  console.log('  GET /api/search/nearby');
  console.log('  GET /api/search/advanced');
  console.log('  GET /api/stats');
  console.log('  GET /api/stats/by-state');
  console.log('  GET /api/stats/by-sector');
  console.log('  GET /api/stats/enrollment-trends');
  console.log('  GET /api/stats/completions-trends');
  console.log('  GET /api/stats/hbcu');
  console.log('  GET /api/cip');
  console.log('  GET /api/cip/search');
  console.log('  GET /api/cip/:code');
  console.log('  GET /api/cip/:code/institutions');
});

export default app;
