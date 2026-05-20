/**
 * /server/config/env.js
 * Fail-fast environment loader with defensive validation.
 */

const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

function requireEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === null) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  const value = String(raw).trim();
  if (value === '') {
    throw new Error(`Environment variable ${name} is set but empty`);
  }
  return value;
}

function optionalEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null) {
    return fallback;
  }
  const value = String(raw).trim();
  return value === '' ? fallback : value;
}

function normalizeOrigin(url) {
  return url.replace(/\/+$/, '');
}

function assertHttpUrl(label, value) {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(
      `${label} must be an absolute URL with http:// or https:// (got: "${value}")`
    );
  }
  try {
    const u = new URL(trimmed);
    if (!u.hostname) {
      throw new Error('missing hostname');
    }
    return normalizeOrigin(trimmed);
  } catch (e) {
    throw new Error(`${label} is not a valid URL: ${e.message}`);
  }
}

function assertPositivePort(name, portString) {
  const n = Number(portString);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535 (got: "${portString}")`);
  }
  return n;
}

const nodeEnv = optionalEnv('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

const port = assertPositivePort('PORT', requireEnv('PORT'));
const apiBaseUrl = assertHttpUrl('API_HOST', requireEnv('API_HOST'));
const clientBaseUrl = assertHttpUrl('FRONTEND_URL', requireEnv('FRONTEND_URL'));

const authRoutePrefixRaw = optionalEnv('AUTH_ROUTE_PREFIX', '/api/auth');
const normalizedAuthPrefix = authRoutePrefixRaw.startsWith('/')
  ? authRoutePrefixRaw
  : `/${authRoutePrefixRaw}`;

const clientAuthCallbackPath = optionalEnv(
  'CLIENT_AUTH_CALLBACK_PATH',
  '/login-callback'
);

function buildAbsoluteUrl(baseUrl, pathname) {
  const segment = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${baseUrl}${segment}`;
}

/**
 * OAuth redirect URIs = API_HOST + AUTH_ROUTE_PREFIX + /{provider}/callback
 * (defaults match: http://localhost:3000/api/auth/{google|facebook|github}/callback)
 */
const googleOAuthCallbackUrl = buildAbsoluteUrl(
  apiBaseUrl,
  `${normalizedAuthPrefix}/google/callback`
);
const facebookOAuthCallbackUrl = buildAbsoluteUrl(
  apiBaseUrl,
  `${normalizedAuthPrefix}/facebook/callback`
);
const githubOAuthCallbackUrl = buildAbsoluteUrl(
  apiBaseUrl,
  `${normalizedAuthPrefix}/github/callback`
);

const env = {
  nodeEnv,
  isProduction,
  port,

  api: {
    baseUrl: apiBaseUrl,
  },

  client: {
    baseUrl: clientBaseUrl,
    authCallbackPath: clientAuthCallbackPath,
    get authCallbackUrl() {
      return buildAbsoluteUrl(clientBaseUrl, clientAuthCallbackPath);
    },
  },

  mongo: {
    uri: requireEnv('MONGO_URI'),
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: optionalEnv('JWT_EXPIRES_IN', '7d'),
    cookieName: optionalEnv('JWT_COOKIE_NAME', 'access_token'),
  },

  cookie: {
    secure: optionalEnv('COOKIE_SECURE', isProduction ? 'true' : 'false') === 'true',
    sameSite: optionalEnv('COOKIE_SAME_SITE', isProduction ? 'none' : 'lax'),
    maxAgeMs: Number(optionalEnv('COOKIE_MAX_AGE_MS', String(7 * 24 * 60 * 60 * 1000))),
    domain: optionalEnv('COOKIE_DOMAIN', ''),
  },

  cors: {
    allowedOrigins: optionalEnv('CORS_ALLOWED_ORIGINS', clientBaseUrl)
      .split(',')
      .map((o) => normalizeOrigin(o.trim()))
      .filter(Boolean),
  },

  oauth: {
    google: {
      clientID: requireEnv('GOOGLE_CLIENT_ID'),
      clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
      callbackURL: googleOAuthCallbackUrl,
      scope: ['profile', 'email'],
    },
    facebook: {
      clientID: requireEnv('FACEBOOK_APP_ID'),
      clientSecret: requireEnv('FACEBOOK_APP_SECRET'),
      callbackURL: facebookOAuthCallbackUrl,
      profileFields: ['id', 'displayName', 'emails', 'photos'],
    },
    github: {
      clientID: requireEnv('GITHUB_CLIENT_ID'),
      clientSecret: requireEnv('GITHUB_CLIENT_SECRET'),
      callbackURL: githubOAuthCallbackUrl,
      scope: ['user:email'],
    },
  },

  auth: {
    routePrefix: normalizedAuthPrefix,
    handshakeMessageType: optionalEnv(
      'AUTH_HANDSHAKE_MESSAGE_TYPE',
      'SOCIAL_AUTH_HANDSHAKE'
    ),
    googleOAuthCallbackUrl,
    facebookOAuthCallbackUrl,
    githubOAuthCallbackUrl,
    buildProviderStartUrl(providerKey) {
      return buildAbsoluteUrl(apiBaseUrl, `${normalizedAuthPrefix}/${providerKey}`);
    },
  },

  buildAbsoluteUrl,
};

module.exports = env;
