/**
 * /server/app.js
 *
 * Mounts auth + OAuth routes at /api/auth (see env.auth.routePrefix).
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const mongoose = require('mongoose');

const env = require('./config/env');
require('./config/passport');
const { passport } = require('./config/passport');
const authRoutes = require('./routes/auth');

const app = express();

app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (env.cors.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(passport.initialize());

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    nodeEnv: env.nodeEnv,
    apiBaseUrl: env.api.baseUrl,
    clientBaseUrl: env.client.baseUrl,
    authMount: env.auth.routePrefix,
    googleOAuthCallbackUrl: env.auth.googleOAuthCallbackUrl,
  });
});

app.use(env.auth.routePrefix, authRoutes);

app.use((err, _req, res, _next) => {
  const status = err.statusCode || 500;
  const message =
    env.isProduction && status === 500
      ? 'Internal server error.'
      : err.message || 'Internal server error.';
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ success: false, message });
});

async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongo.uri, { serverSelectionTimeoutMS: 8000 });
  console.log('[server] MongoDB connected');
}

async function start() {
  await connectDatabase();
  app.listen(env.port, () => {
    console.log(`[server] ${env.nodeEnv} — ${env.api.baseUrl}`);
    console.log(`[server] Auth routes: ${env.api.baseUrl}${env.auth.routePrefix}`);
    console.log(`[server] Google OAuth callback: ${env.auth.googleOAuthCallbackUrl}`);
    console.log(`[server] CORS: ${env.cors.allowedOrigins.join(', ')}`);
    console.log(`[server] SPA callback: ${env.client.authCallbackUrl}`);
  });
}

start().catch((err) => {
  console.error('[server] failed to start:', err.message);
  if (String(err.message).includes('ECONNREFUSED')) {
    console.error(
      '[server] Hint: start MongoDB (e.g. docker run -d -p 27017:27017 mongo:7)'
    );
  }
  process.exit(1);
});

module.exports = app;
