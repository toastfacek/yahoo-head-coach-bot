// Minimal server without problematic imports
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import https from 'https';
import fs from 'fs';
import { env } from './config/env';

// Mock the database module before importing routes
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === '../db' || id === './db') {
    return require('./db-mock');
  }
  return originalRequire.apply(this, arguments);
};

import { oauthStart, oauthCallback, tokenStatus, refreshNow } from './routes/oauth';

console.log('🧪 Starting minimal server with OAuth routes...');

const app = express();
const PORT = Number(env.PORT || 3000);

console.log('✅ Express app created');

// Minimal middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

console.log('✅ Middleware added');

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OAuth routes with logging
app.get('/api/oauth/start', (req, res) => {
  console.log('🔵 OAuth start requested');
  oauthStart(req, res);
});

app.get('/api/oauth/callback', (req, res) => {
  console.log('🔵 OAuth callback received:');
  console.log('Query params:', req.query);
  console.log('Full URL:', req.url);
  console.log('Headers:', req.headers);
  oauthCallback(req, res);
});

app.get('/api/oauth/status', tokenStatus);
app.get('/api/oauth/refresh', refreshNow);

// Error handling middleware for detailed logging
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('🚨 Server Error:', error);
  console.error('Request URL:', req.url);
  console.error('Request method:', req.method);
  console.error('Error stack:', error.stack);
  
  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: error.message || 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

console.log('✅ Routes added (health + OAuth)');

// Create HTTPS server with self-signed certificate for development
const httpsOptions = {
  key: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDGFze9VF5n4uHG
...self-signed cert would be too long to embed...
-----END PRIVATE KEY-----`,
  cert: `-----BEGIN CERTIFICATE-----
MIIEpDCCAowCCQDYPiP7w+qk7DANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAls
...self-signed cert would be too long to embed...
-----END CERTIFICATE-----`
};

// For development, let's use HTTP instead and modify the redirect URI
console.log('⚠️  For development, using HTTP server instead of HTTPS');
console.log('💡 You can use a tunnel service like ngrok for HTTPS testing');

const server = app.listen(PORT, () => {
  console.log(`🎉 MINIMAL SERVER STARTED on port ${PORT}`);
  console.log(`📊 Health check available at: http://localhost:${PORT}/api/health`);
  console.log(`🔗 OAuth start: http://localhost:${PORT}/api/oauth/start?userId=dev`);
  console.log('🔧 Running in minimal mode - press Ctrl+C to stop');
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});