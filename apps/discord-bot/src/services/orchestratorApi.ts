import axios, { AxiosInstance } from 'axios';
import { env } from '../utils/config';
import { apiLogger } from '../utils/logger';
import { OrchestratorResponse, FantasyReportData } from '../types/discord';

export class OrchestratorApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: env.ORCHESTRATOR_URL + '/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Yahoo-Fantasy-Discord-Bot/1.0.0'
      }
    });

    this.api.interceptors.request.use(
      (config) => {
        apiLogger.debug({ url: config.url, method: config.method }, 'API request');
        return config;
      }
    );

    this.api.interceptors.response.use(
      (response) => {
        apiLogger.debug({ status: response.status, url: response.config.url }, 'API response');
        return response;
      },
      (error) => {
        apiLogger.error({ 
          error: error.message, 
          status: error.response?.status,
          url: error.config?.url 
        }, 'API error');
        throw error;
      }
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      const healthUrl = `${this.api.defaults.baseURL}/health`;
      apiLogger.info({ healthUrl }, 'Attempting health check');
      const response = await this.api.get('/health');
      apiLogger.info({ status: response.status, healthUrl }, 'Health check successful');
      return response.status === 200;
    } catch (error) {
      const healthUrl = `${this.api.defaults.baseURL}/health`;
      apiLogger.error({ 
        error: error instanceof Error ? error.message : error, 
        healthUrl,
        baseURL: this.api.defaults.baseURL,
        timeout: this.api.defaults.timeout 
      }, 'Health check failed');
      return false;
    }
  }

  async getOAuthUrl(userId: string): Promise<string> {
    // Directly construct the orchestrator OAuth start URL for Discord users to click
    try {
      const url = `${env.ORCHESTRATOR_URL}/api/oauth/start?userId=${encodeURIComponent(userId)}`;
      return url;
    } catch (error) {
      apiLogger.error({ error, userId }, 'Failed to construct OAuth URL');
      throw new Error('Failed to generate authentication URL');
    }
  }

  async createOAuthSession(discordId: string): Promise<string> {
    try {
      apiLogger.debug({ discordId, url: this.api.defaults.baseURL }, 'Attempting to create OAuth session');
      const response = await this.api.post('/oauth/session', { discordId });
      apiLogger.debug({ discordId, status: response.status, hasData: !!response.data }, 'OAuth session response received');
      
      const url = response.data?.authorize_url;
      if (!url) {
        apiLogger.error({ discordId, responseData: response.data }, 'Missing authorize_url in response');
        throw new Error('Missing authorize_url');
      }
      return url;
    } catch (error) {
      apiLogger.error({ 
        error, 
        discordId, 
        baseURL: this.api.defaults.baseURL,
        errorDetails: error instanceof Error ? {
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n')
        } : error
      }, 'Failed to create OAuth session');
      
      // Throw with more specific error information
      if (error instanceof Error) {
        throw new Error(`Failed to initialize authentication: ${error.message}`);
      }
      throw new Error('Failed to initialize authentication');
    }
  }

  async checkOAuthStatus(userId: string): Promise<{ authenticated: boolean; userInfo?: any }> {
    try {
      const statusUrl = `${this.api.defaults.baseURL}/oauth/status?userId=${userId}`;
      apiLogger.info({ statusUrl, userId }, 'Checking OAuth status');
      const response = await this.api.get(`/oauth/status?userId=${userId}`);
      apiLogger.info({ 
        statusUrl, 
        userId, 
        status: response.status, 
        authenticated: response.data?.authenticated 
      }, 'OAuth status check result');
      return response.data;
    } catch (error) {
      const statusUrl = `${this.api.defaults.baseURL}/oauth/status?userId=${userId}`;
      apiLogger.error({ 
        error: error instanceof Error ? error.message : error, 
        userId, 
        statusUrl,
        baseURL: this.api.defaults.baseURL 
      }, 'Failed to check OAuth status');
      return { authenticated: false };
    }
  }

  async getUserLeagues(userId: string): Promise<any[]> {
    try {
      const response = await this.api.get(`/leagues?userId=${userId}`);
      return response.data.leagues || [];
    } catch (error) {
      apiLogger.error({ error, userId }, 'Failed to get user leagues');
      throw new Error('Failed to retrieve leagues');
    }
  }

  async getDailyReport(userId: string, leagueId: string): Promise<AsyncIterable<string>> {
    try {
      const response = await this.api.get(`/reports/daily?userId=${userId}&leagueId=${leagueId}`, {
        responseType: 'stream',
        headers: {
          'Accept': 'text/event-stream'
        }
      });

      return this.parseServerSentEvents(response.data);
    } catch (error) {
      apiLogger.error({ error, userId, leagueId }, 'Failed to get daily report');
      throw new Error('Failed to generate daily report');
    }
  }

  async checkLineup(userId: string, leagueId: string): Promise<FantasyReportData> {
    try {
      const response = await this.api.post('/lineup/check', {
        userId,
        leagueId
      });
      
      return this.parseFantasyReport(response.data);
    } catch (error) {
      apiLogger.error({ error, userId, leagueId }, 'Failed to check lineup');
      throw new Error('Failed to analyze lineup');
    }
  }

  async analyzeWaivers(userId: string, leagueId: string): Promise<FantasyReportData> {
    try {
      const response = await this.api.post('/waivers/run', {
        userId,
        leagueId
      });
      
      return this.parseFantasyReport(response.data);
    } catch (error) {
      apiLogger.error({ error, userId, leagueId }, 'Failed to analyze waivers');
      throw new Error('Failed to analyze waiver wire');
    }
  }

  async getPendingApprovals(userId: string, leagueId: string): Promise<any[]> {
    try {
      const response = await this.api.get(`/approvals/pending?userId=${userId}&leagueId=${leagueId}`);
      return response.data.pending || [];
    } catch (error) {
      apiLogger.error({ error, userId, leagueId }, 'Failed to get pending approvals');
      throw new Error('Failed to retrieve pending approvals');
    }
  }

  async approveRecommendation(userId: string, recommendationId: string): Promise<boolean> {
    try {
      const response = await this.api.post('/approvals/approve', {
        userId,
        recommendationId
      });
      return response.data.success === true;
    } catch (error) {
      apiLogger.error({ error, userId, recommendationId }, 'Failed to approve recommendation');
      throw new Error('Failed to approve recommendation');
    }
  }

  async rejectRecommendation(userId: string, recommendationId: string): Promise<boolean> {
    try {
      const response = await this.api.post('/approvals/reject', {
        userId,
        recommendationId
      });
      return response.data.success === true;
    } catch (error) {
      apiLogger.error({ error, userId, recommendationId }, 'Failed to reject recommendation');
      throw new Error('Failed to reject recommendation');
    }
  }

  async sendChatMessage(userId: string, message: string, leagueId?: string): Promise<AsyncIterable<string>> {
    try {
      const response = await this.api.post('/chat', {
        userId,
        message,
        leagueId
      }, {
        responseType: 'stream',
        headers: {
          'Accept': 'text/event-stream'
        }
      });

      return this.parseServerSentEvents(response.data);
    } catch (error) {
      apiLogger.error({ error, userId, message }, 'Failed to send chat message');
      throw new Error('Failed to process your message');
    }
  }

  private async* parseServerSentEvents(stream: any): AsyncIterable<string> {
    let buffer = '';
    
    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              yield parsed.content;
            }
          } catch {
            // Skip malformed JSON
            yield data;
          }
        }
      }
    }
  }

  private parseFantasyReport(data: any): FantasyReportData {
    // Parse the response from orchestrator into standardized format
    return {
      summary: data.summary || [],
      lineup: data.lineup || [],
      waivers: data.waivers || [],
      notes: data.notes || []
    };
  }
}

export const orchestratorApi = new OrchestratorApiService();
