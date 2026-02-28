/**
 * Central Adaptor Service — API Server
 *
 * Lightweight Express server that:
 * - Serves adaptor definitions to browser plugin instances
 * - Accepts user contributions (selector updates, new steps, verifications)
 * - Processes contributions to update adaptor confidence scores
 *
 * Designed to be deployed on any Node.js host (Railway, Render, Fly.io, etc.)
 * with a PostgreSQL database (Supabase, Neon, etc.)
 */

import express from 'express';
import cors from 'cors';
import { adaptorRoutes } from './routes/adaptors';
import { contributionRoutes } from './routes/contributions';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [
    // Chrome extension origins
    /^chrome-extension:\/\//,
    // Development
    'http://localhost:*',
  ],
}));
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/adaptors', adaptorRoutes);
app.use('/api/adaptors', contributionRoutes);

// Start
app.listen(PORT, () => {
  console.log(`Adaptor service running on port ${PORT}`);
});

export default app;
