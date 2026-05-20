/**
 * /server/config/passport.js
 *
 * Callback URLs (must match developer consoles):
 *   Google:   http://localhost:3000/api/auth/google/callback
 *   Facebook: http://localhost:3000/api/auth/facebook/callback
 *   GitHub:   http://localhost:3000/api/auth/github/callback
 *
 * All strategies share findOrLinkUser: provider ID → verified-email merge → create.
 */

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;

const User = require('../models/User');
const env = require('./env');

const SUPPORTED_PROVIDERS = ['google', 'facebook', 'github'];

const GOOGLE_STRATEGY_CALLBACK_URL = env.buildAbsoluteUrl(
  env.api.baseUrl,
  `${env.auth.routePrefix}/google/callback`
);
const FACEBOOK_STRATEGY_CALLBACK_URL = env.buildAbsoluteUrl(
  env.api.baseUrl,
  `${env.auth.routePrefix}/facebook/callback`
);
const GITHUB_STRATEGY_CALLBACK_URL = env.buildAbsoluteUrl(
  env.api.baseUrl,
  `${env.auth.routePrefix}/github/callback`
);

function extractProfilePayload(providerKey, profile, accessToken, refreshToken) {
  let emails = Array.isArray(profile.emails) ? profile.emails : [];

  if (
    providerKey === 'github' &&
    emails.length === 0 &&
    profile._json &&
    typeof profile._json.email === 'string' &&
    profile._json.email.trim() !== ''
  ) {
    emails = [{ value: profile._json.email, verified: true }];
  }

  const primaryEmailRecord =
    emails.find((entry) => entry.verified) || emails[0] || null;
  const primaryEmail = primaryEmailRecord
    ? String(primaryEmailRecord.value).trim().toLowerCase()
    : null;

  let emailVerified = Boolean(primaryEmailRecord && primaryEmailRecord.verified);
  if (
    (providerKey === 'facebook' || providerKey === 'github') &&
    primaryEmail
  ) {
    emailVerified = true;
  }

  const photos = Array.isArray(profile.photos) ? profile.photos : [];
  const avatarUrl = photos[0] && photos[0].value ? photos[0].value : null;

  const displayName =
    profile.displayName ||
    [profile.name && profile.name.givenName, profile.name && profile.name.familyName]
      .filter(Boolean)
      .join(' ') ||
    profile.username ||
    'Social User';

  return {
    providerKey,
    providerId: String(profile.id),
    displayName,
    email: primaryEmail,
    emailVerified,
    avatarUrl,
    accessToken: accessToken || null,
    refreshToken: refreshToken || null,
    rawEmail: primaryEmail,
  };
}

function buildProviderPatch(payload) {
  return {
    providerId: payload.providerId,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    linkedAt: new Date(),
    profileSnapshot: {
      displayName: payload.displayName,
      rawEmail: payload.rawEmail,
    },
  };
}

async function findUserByProviderId(providerKey, providerId) {
  return User.findOne({
    [`providers.${providerKey}.providerId`]: providerId,
  }).exec();
}

async function findUserByVerifiedEmail(email) {
  if (!email) {
    return null;
  }
  return User.findOne({ email, emailVerified: true }).exec();
}

function applyProviderLink(user, providerKey, providerPatch, payload) {
  if (!user.providers) {
    user.providers = {};
  }
  user.providers[providerKey] = providerPatch;
  user.lastLoginAt = new Date();
  user.lastLoginProvider = providerKey;

  if (!user.displayName && payload.displayName) {
    user.displayName = payload.displayName;
  }
  if (!user.avatarUrl && payload.avatarUrl) {
    user.avatarUrl = payload.avatarUrl;
  }
  if (payload.emailVerified && payload.email) {
    user.email = payload.email;
    user.emailVerified = true;
  } else if (!user.email && payload.email) {
    user.email = payload.email;
    user.emailVerified = Boolean(payload.emailVerified);
  }

  return user;
}

async function findOrLinkUser(providerKey, profile, accessToken, refreshToken) {
  if (!SUPPORTED_PROVIDERS.includes(providerKey)) {
    throw new Error(`Unsupported provider: ${providerKey}`);
  }

  const payload = extractProfilePayload(
    providerKey,
    profile,
    accessToken,
    refreshToken
  );
  const providerPatch = buildProviderPatch(payload);

  let user = await findUserByProviderId(providerKey, payload.providerId);

  if (!user && payload.emailVerified && payload.email) {
    user = await findUserByVerifiedEmail(payload.email);
  }

  if (user) {
    applyProviderLink(user, providerKey, providerPatch, payload);
    await user.save();
    return user;
  }

  try {
    const created = await User.create({
      displayName: payload.displayName,
      email: payload.email,
      emailVerified: payload.emailVerified,
      avatarUrl: payload.avatarUrl,
      lastLoginAt: new Date(),
      lastLoginProvider: providerKey,
      providers: {
        [providerKey]: providerPatch,
      },
    });
    return created;
  } catch (error) {
    if (error && error.code === 11000) {
      const byProvider = await findUserByProviderId(
        providerKey,
        payload.providerId
      );
      if (byProvider) {
        applyProviderLink(byProvider, providerKey, providerPatch, payload);
        await byProvider.save();
        return byProvider;
      }
      if (payload.email) {
        const byEmail = await findUserByVerifiedEmail(payload.email);
        if (byEmail) {
          applyProviderLink(byEmail, providerKey, providerPatch, payload);
          await byEmail.save();
          return byEmail;
        }
      }
    }
    throw error;
  }
}

function registerStrategyVerify(providerKey) {
  return async function verify(accessToken, refreshToken, profile, done) {
    try {
      const user = await findOrLinkUser(
        providerKey,
        profile,
        accessToken,
        refreshToken
      );
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  };
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

if (GOOGLE_STRATEGY_CALLBACK_URL !== env.oauth.google.callbackURL) {
  throw new Error(
    'Google callback URL mismatch between passport bootstrap and env.oauth.google'
  );
}
if (FACEBOOK_STRATEGY_CALLBACK_URL !== env.oauth.facebook.callbackURL) {
  throw new Error(
    'Facebook callback URL mismatch between passport bootstrap and env.oauth.facebook'
  );
}
if (GITHUB_STRATEGY_CALLBACK_URL !== env.oauth.github.callbackURL) {
  throw new Error(
    'GitHub callback URL mismatch between passport bootstrap and env.oauth.github'
  );
}

passport.use(
  new GoogleStrategy(
    {
      clientID: env.oauth.google.clientID,
      clientSecret: env.oauth.google.clientSecret,
      callbackURL: GOOGLE_STRATEGY_CALLBACK_URL,
      scope: env.oauth.google.scope,
    },
    registerStrategyVerify('google')
  )
);

passport.use(
  new FacebookStrategy(
    {
      clientID: env.oauth.facebook.clientID,
      clientSecret: env.oauth.facebook.clientSecret,
      callbackURL: FACEBOOK_STRATEGY_CALLBACK_URL,
      profileFields: env.oauth.facebook.profileFields,
      enableProof: true,
    },
    registerStrategyVerify('facebook')
  )
);

passport.use(
  new GitHubStrategy(
    {
      clientID: env.oauth.github.clientID,
      clientSecret: env.oauth.github.clientSecret,
      callbackURL: GITHUB_STRATEGY_CALLBACK_URL,
      scope: env.oauth.github.scope,
    },
    registerStrategyVerify('github')
  )
);

module.exports = {
  passport,
  findOrLinkUser,
  SUPPORTED_PROVIDERS,
};
