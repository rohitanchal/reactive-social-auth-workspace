/**
 * /server/routes/auth.js
 *
 * Mounted at env.auth.routePrefix (default /api/auth).
 *
 * OAuth entry + callback (same success path for google | facebook | github):
 *   GET  /api/auth/:provider              → passport.authenticate
 *   GET  /api/auth/:provider/callback     → JWT cookie + redirect to FRONTEND login-callback
 *   GET  /api/auth/:provider/callback/    → trailing slash (Google Console parity)
 *
 * Success: deliverAuthSuccess → HttpOnly cookie + redirect env.client.authCallbackUrl
 *   (e.g. http://localhost:4200/login-callback).
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { passport, SUPPORTED_PROVIDERS } = require('../config/passport');
const env = require('../config/env');
const {
  authenticate,
  extractTokenFromRequest,
} = require('../middleware/authenticate');

const router = express.Router();

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      emailVerified: user.emailVerified,
    },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );
}

function setAuthCookie(res, token) {
  const opts = {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    maxAge: env.cookie.maxAgeMs,
    path: '/',
  };
  if (env.cookie.domain) {
    opts.domain = env.cookie.domain;
  }
  res.cookie(env.jwt.cookieName, token, opts);
}

function buildHandshakeHtml(messagePayload) {
  const serialized = JSON.stringify(messagePayload).replace(/</g, '\\u003c');
  const targetOrigin = env.client.baseUrl;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Auth</title></head>
<body>
<script>
(function () {
  var payload = ${serialized};
  var targetOrigin = ${JSON.stringify(targetOrigin)};
  var redirectUrl = ${JSON.stringify(env.client.authCallbackUrl)};
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(payload, targetOrigin);
    window.close();
  } else {
    window.location.replace(redirectUrl);
  }
})();
</script>
<noscript><a href="${env.client.authCallbackUrl}">Continue</a></noscript>
</body></html>`;
}

function handleOAuthCallback(providerKey) {
  return (req, res, next) => {
    passport.authenticate(providerKey, { session: false }, (err, user, info) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        const reason =
          info && info.message ? info.message : 'Authentication denied.';
        return res.redirect(
          `${env.client.authCallbackUrl}?error=${encodeURIComponent(reason)}`
        );
      }
      req.authUser = user;
      return next();
    })(req, res, next);
  };
}

function deliverAuthSuccess(req, res) {
  const user = req.authUser;
  const token = signAccessToken(user);
  setAuthCookie(res, token);

  const handshakePayload = {
    type: env.auth.handshakeMessageType,
    status: 'success',
    user: user.toPublicProfile(),
    issuedAt: new Date().toISOString(),
  };

  const acceptsHtml =
    req.headers.accept && String(req.headers.accept).includes('text/html');
  const useHandshake =
    req.query.display === 'popup' || req.query.handshake === '1' || acceptsHtml;

  if (useHandshake) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(buildHandshakeHtml(handshakePayload));
  }

  return res.redirect(env.client.authCallbackUrl);
}

router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'auth', mount: env.auth.routePrefix });
});

router.get('/session', authenticate, (req, res) => {
  const existing = extractTokenFromRequest(req);
  const accessToken = existing || signAccessToken(req.user);
  res.json({
    success: true,
    authenticated: true,
    user: req.user.toPublicProfile(),
    accessToken,
  });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, user: req.user.toPublicProfile() });
});

router.post('/logout', authenticate, (_req, res) => {
  res.clearCookie(env.jwt.cookieName, {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    path: '/',
    ...(env.cookie.domain ? { domain: env.cookie.domain } : {}),
  });
  res.json({ success: true });
});

for (const providerKey of SUPPORTED_PROVIDERS) {
  router.get(`/${providerKey}`, (req, res, next) => {
    const opts = { session: false };
    if (req.query.display === 'popup') {
      opts.state = 'popup';
    }
    passport.authenticate(providerKey, opts)(req, res, next);
  });

  const stack = [handleOAuthCallback(providerKey), deliverAuthSuccess];
  router.get(`/${providerKey}/callback`, ...stack);
  router.get(`/${providerKey}/callback/`, ...stack);
}

router.get('/providers', (_req, res) => {
  res.json({
    success: true,
    googleCallbackUrl: env.auth.googleOAuthCallbackUrl,
    facebookCallbackUrl: env.auth.facebookOAuthCallbackUrl,
    githubCallbackUrl: env.auth.githubOAuthCallbackUrl,
    providers: SUPPORTED_PROVIDERS.map((key) => ({
      key,
      startUrl: env.auth.buildProviderStartUrl(key),
      popupStartUrl: `${env.auth.buildProviderStartUrl(key)}?display=popup`,
    })),
    clientCallbackUrl: env.client.authCallbackUrl,
  });
});

module.exports = router;
