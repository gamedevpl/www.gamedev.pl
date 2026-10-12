import { SubmissionFacade } from './submission-facade.js';
import type { OAuthStore } from './slices/oauth.js';

export abstract class OAuthFacade extends SubmissionFacade {
  protected abstract oauthStore: OAuthStore;

  createOAuthDeviceAuthorization(
    ...args: Parameters<OAuthStore['createOAuthDeviceAuthorization']>
  ): ReturnType<OAuthStore['createOAuthDeviceAuthorization']> {
    return this.oauthStore.createOAuthDeviceAuthorization(...args);
  }

  getOAuthDeviceAuthorization(
    ...args: Parameters<OAuthStore['getOAuthDeviceAuthorization']>
  ): ReturnType<OAuthStore['getOAuthDeviceAuthorization']> {
    return this.oauthStore.getOAuthDeviceAuthorization(...args);
  }

  decideOAuthDeviceAuthorization(
    ...args: Parameters<OAuthStore['decideOAuthDeviceAuthorization']>
  ): ReturnType<OAuthStore['decideOAuthDeviceAuthorization']> {
    return this.oauthStore.decideOAuthDeviceAuthorization(...args);
  }

  pollOAuthDeviceAuthorization(
    ...args: Parameters<OAuthStore['pollOAuthDeviceAuthorization']>
  ): ReturnType<OAuthStore['pollOAuthDeviceAuthorization']> {
    return this.oauthStore.pollOAuthDeviceAuthorization(...args);
  }

  eraseOAuthDeviceAuthorizations(
    ...args: Parameters<OAuthStore['eraseOAuthDeviceAuthorizations']>
  ): ReturnType<OAuthStore['eraseOAuthDeviceAuthorizations']> {
    return this.oauthStore.eraseOAuthDeviceAuthorizations(...args);
  }

  createOAuthClient(...args: Parameters<OAuthStore['createOAuthClient']>): ReturnType<OAuthStore['createOAuthClient']> {
    return this.oauthStore.createOAuthClient(...args);
  }

  getOAuthClient(...args: Parameters<OAuthStore['getOAuthClient']>): ReturnType<OAuthStore['getOAuthClient']> {
    return this.oauthStore.getOAuthClient(...args);
  }

  createOAuthGrant(...args: Parameters<OAuthStore['createOAuthGrant']>): ReturnType<OAuthStore['createOAuthGrant']> {
    return this.oauthStore.createOAuthGrant(...args);
  }

  getOAuthGrant(...args: Parameters<OAuthStore['getOAuthGrant']>): ReturnType<OAuthStore['getOAuthGrant']> {
    return this.oauthStore.getOAuthGrant(...args);
  }

  getOAuthGrantByRefreshTokenId(
    ...args: Parameters<OAuthStore['getOAuthGrantByRefreshTokenId']>
  ): ReturnType<OAuthStore['getOAuthGrantByRefreshTokenId']> {
    return this.oauthStore.getOAuthGrantByRefreshTokenId(...args);
  }

  listOAuthGrantsByOwner(
    ...args: Parameters<OAuthStore['listOAuthGrantsByOwner']>
  ): ReturnType<OAuthStore['listOAuthGrantsByOwner']> {
    return this.oauthStore.listOAuthGrantsByOwner(...args);
  }

  revokeOAuthGrant(...args: Parameters<OAuthStore['revokeOAuthGrant']>): ReturnType<OAuthStore['revokeOAuthGrant']> {
    return this.oauthStore.revokeOAuthGrant(...args);
  }

  createOAuthAccessToken(
    ...args: Parameters<OAuthStore['createOAuthAccessToken']>
  ): ReturnType<OAuthStore['createOAuthAccessToken']> {
    return this.oauthStore.createOAuthAccessToken(...args);
  }

  getAsAccessToken(...args: Parameters<OAuthStore['getAsAccessToken']>): ReturnType<OAuthStore['getAsAccessToken']> {
    return this.oauthStore.getAsAccessToken(...args);
  }

  deleteOAuthAccessToken(
    ...args: Parameters<OAuthStore['deleteOAuthAccessToken']>
  ): ReturnType<OAuthStore['deleteOAuthAccessToken']> {
    return this.oauthStore.deleteOAuthAccessToken(...args);
  }

  createOAuthAuthCode(
    ...args: Parameters<OAuthStore['createOAuthAuthCode']>
  ): ReturnType<OAuthStore['createOAuthAuthCode']> {
    return this.oauthStore.createOAuthAuthCode(...args);
  }

  consumeOAuthAuthCode(
    ...args: Parameters<OAuthStore['consumeOAuthAuthCode']>
  ): ReturnType<OAuthStore['consumeOAuthAuthCode']> {
    return this.oauthStore.consumeOAuthAuthCode(...args);
  }

  rotateOAuthRefreshToken(
    ...args: Parameters<OAuthStore['rotateOAuthRefreshToken']>
  ): ReturnType<OAuthStore['rotateOAuthRefreshToken']> {
    return this.oauthStore.rotateOAuthRefreshToken(...args);
  }

  issueOAuthTokensFromGrant(
    ...args: Parameters<OAuthStore['issueOAuthTokensFromGrant']>
  ): ReturnType<OAuthStore['issueOAuthTokensFromGrant']> {
    return this.oauthStore.issueOAuthTokensFromGrant(...args);
  }
}
