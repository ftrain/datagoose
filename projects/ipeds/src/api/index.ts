import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
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
import historicRouter from './routes/historic.js';
import authRouter from './routes/auth.js';
import dictionaryRouter from './routes/dictionary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : ['http://localhost:5173', 'http://localhost:3001'],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRouter);
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
app.use('/api/historic', historicRouter);
app.use('/api/dictionary', dictionaryRouter);

// Note: In production deployment, nginx serves the static UI files
// and handles the SPA fallback. This block is only for local testing.
if (process.env.NODE_ENV === 'production' && process.env.SERVE_STATIC) {
  const uiPath = path.join(__dirname, '..', '..', 'ui', 'dist');
  app.use(express.static(uiPath));
}

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
  console.log('  GET /api/historic/coverage');
  console.log('  GET /api/historic/enrollment');
  console.log('  GET /api/historic/enrollment/:unitid');
  console.log('  GET /api/historic/completions');
  console.log('  GET /api/historic/completions/by-field');
  console.log('  GET /api/historic/graduation');
  console.log('  GET /api/historic/graduation/:unitid');
  console.log('  GET /api/historic/institutions');
  console.log('  GET /api/historic/institutions/:unitid');
  console.log('  GET /api/historic/trends/combined');
  console.log('  GET /api/dictionary');
  console.log('  GET /api/dictionary/tables');
  console.log('  GET /api/dictionary/tables/:table');
  console.log('  GET /api/dictionary/search');
  console.log('  GET /api/dictionary/stats');
  console.log('  POST /api/dictionary/ask');
});

export default app;
