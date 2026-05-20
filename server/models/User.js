const mongoose = require('mongoose');

const providerLinkSchema = new mongoose.Schema(
  {
    providerId: {
      type: String,
      required: true,
      trim: true,
    },
    accessToken: {
      type: String,
      default: null,
      select: false,
    },
    refreshToken: {
      type: String,
      default: null,
      select: false,
    },
    linkedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    profileSnapshot: {
      displayName: { type: String, default: null },
      rawEmail: { type: String, default: null },
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    avatarUrl: {
      type: String,
      default: null,
      trim: true,
    },
    providers: {
      google: { type: providerLinkSchema, default: undefined },
      facebook: { type: providerLinkSchema, default: undefined },
      github: { type: providerLinkSchema, default: undefined },
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    lastLoginProvider: {
      type: String,
      enum: ['google', 'facebook', 'github', null],
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        if (ret.providers) {
          for (const key of Object.keys(ret.providers)) {
            if (ret.providers[key]) {
              delete ret.providers[key].accessToken;
              delete ret.providers[key].refreshToken;
            }
          }
        }
        return ret;
      },
    },
  }
);

userSchema.index(
  { email: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { email: { $type: 'string', $ne: null } },
  }
);

userSchema.index({ 'providers.google.providerId': 1 }, { sparse: true });
userSchema.index({ 'providers.facebook.providerId': 1 }, { sparse: true });
userSchema.index({ 'providers.github.providerId': 1 }, { sparse: true });

userSchema.virtual('linkedProviderKeys').get(function linkedProviderKeys() {
  return ['google', 'facebook', 'github'].filter(
    (p) => this.providers && this.providers[p]
  );
});

userSchema.methods.toPublicProfile = function toPublicProfile() {
  return {
    id: this._id.toString(),
    displayName: this.displayName,
    email: this.email,
    emailVerified: this.emailVerified,
    avatarUrl: this.avatarUrl,
    linkedProviders: this.linkedProviderKeys,
    lastLoginAt: this.lastLoginAt,
    lastLoginProvider: this.lastLoginProvider,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('User', userSchema);
