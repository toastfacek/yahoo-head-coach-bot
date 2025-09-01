import { vi } from 'vitest';
import nock from 'nock';

export const YAHOO_OAUTH_BASE_URL = 'https://api.login.yahoo.com';
export const YAHOO_API_BASE_URL = 'https://fantasysports.yahooapis.com';

export interface MockYahooTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface MockYahooUserInfo {
  guid: string;
  profile: {
    nickname: string;
    email: string;
  };
}

export const createMockTokenResponse = (overrides: Partial<MockYahooTokenResponse> = {}): MockYahooTokenResponse => ({
  access_token: 'mock_access_token_12345',
  refresh_token: 'mock_refresh_token_67890',
  expires_in: 3600,
  token_type: 'bearer',
  scope: 'fspt-w',
  ...overrides,
});

export const createMockUserInfo = (overrides: Partial<MockYahooUserInfo> = {}): MockYahooUserInfo => ({
  guid: 'ABCDEFGHIJKLMNO',
  profile: {
    nickname: 'TestUser',
    email: 'test@example.com',
  },
  ...overrides,
});

export const createMockLeagueData = () => ({
  fantasy_content: {
    users: {
      "0": {
        user: {
          "0": { user_key: "414.l.123456.ou.1" },
          "1": { user_id: "1" },
          "2": { nickname: "TestUser" },
          "3": { email: "test@example.com" }
        }
      }
    },
    games: {
      "0": {
        game: {
          "0": { game_key: "414" },
          "1": { game_id: "414" },
          "2": { name: "Football" },
          "3": { code: "nfl" },
          "4": { type: "full" },
          "5": { url: "https://football.fantasysports.yahoo.com/f1" },
          "6": { season: "2024" }
        }
      }
    }
  }
});

export class YahooAPIMocker {
  private nockScope: nock.Scope;

  constructor() {
    this.nockScope = nock(YAHOO_OAUTH_BASE_URL);
  }

  // Mock OAuth token exchange
  mockTokenExchange(response: MockYahooTokenResponse = createMockTokenResponse()) {
    this.nockScope
      .post('/oauth2/get_token')
      .reply(200, response);
    return this;
  }

  // Mock OAuth token refresh
  mockTokenRefresh(response: MockYahooTokenResponse = createMockTokenResponse()) {
    this.nockScope
      .post('/oauth2/get_token', (body: string) => {
        return body.includes('grant_type=refresh_token');
      })
      .reply(200, response);
    return this;
  }

  // Mock OAuth authorization redirect
  mockAuthorizationRedirect(state: string, code: string = 'mock_auth_code') {
    const redirectUrl = `http://localhost:3000/api/oauth/callback?code=${code}&state=${state}`;
    this.nockScope
      .get('/oauth2/request_auth')
      .query(true)
      .reply(302, '', {
        'Location': redirectUrl
      });
    return this;
  }

  // Mock OAuth error responses
  mockTokenError(error: string = 'invalid_grant', description: string = 'Invalid authorization code') {
    this.nockScope
      .post('/oauth2/get_token')
      .reply(400, {
        error,
        error_description: description
      });
    return this;
  }

  // Mock Fantasy Sports API
  mockFantasyAPI() {
    const fantasyScope = nock(YAHOO_API_BASE_URL);
    
    fantasyScope
      .get('/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues')
      .reply(200, createMockLeagueData());
    
    return this;
  }

  // Clean up all mocks
  cleanAll() {
    nock.cleanAll();
  }

  // Verify all expected requests were made
  isDone() {
    return this.nockScope.isDone();
  }
}

// Helper function to create a complete Yahoo OAuth mock
export const createYahooOAuthMock = () => new YahooAPIMocker();

// Mock axios responses for local testing
export const mockAxiosYahooResponses = () => {
  const mockPost = vi.fn();
  const mockGet = vi.fn();

  // Mock successful token exchange
  mockPost.mockImplementation((url: string, data: any) => {
    if (url.includes('oauth2/get_token')) {
      const formData = new URLSearchParams(data);
      if (formData.get('grant_type') === 'authorization_code') {
        return Promise.resolve({ data: createMockTokenResponse() });
      } else if (formData.get('grant_type') === 'refresh_token') {
        return Promise.resolve({ data: createMockTokenResponse() });
      }
    }
    return Promise.reject(new Error('Unmocked POST request'));
  });

  // Mock Fantasy API requests
  mockGet.mockImplementation((url: string) => {
    if (url.includes('fantasy/v2')) {
      return Promise.resolve({ data: createMockLeagueData() });
    }
    return Promise.reject(new Error('Unmocked GET request'));
  });

  return { mockPost, mockGet };
};