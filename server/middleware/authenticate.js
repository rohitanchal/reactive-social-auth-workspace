/**
 * /server/middleware/authenticate.js
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') {
    return null;
  }
  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
}

function extractTokenFromRequest(req) {
  const bearer = extractBearerToken(req.headers.authorization);
  if (bearer) {
    return bearer;
  }
  if (req.cookies && req.cookies[env.jwt.cookieName]) {
    return req.cookies[env.jwt.cookieName];
  }
  return null;
}

async function authenticate(req, res, next) {
  try {
    const token = extractTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const decoded = jwt.verify(token, env.jwt.secret);
    const user = await User.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found.',
      });
    }

    req.user = user;
    req.auth = {
      sub: decoded.sub,
      email: decoded.email,
      iat: decoded.iat,
      exp: decoded.exp,
    };
    return next();
  } catch (_err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    });
  }
}

module.exports = {
  authenticate,
  extractTokenFromRequest,
};
