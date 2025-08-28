// Mock Yahoo Fantasy API responses and client
import { vi } from 'vitest';

export const mockYahooClient = {
  game: {
    meta: vi.fn()
  },
  league: {
    meta: vi.fn()
  },
  getLeagueTeams: vi.fn(),
  getUserGameTeams: vi.fn(),
  user: {
    game_teams: vi.fn()
  },
  team: {
    roster: vi.fn(),
    transactions: vi.fn().mockReturnValue({
      add: vi.fn()
    })
  },
  setUserToken: vi.fn(),
  setRefreshToken: vi.fn(),
  getGameMeta: vi.fn()
};

// Mock Yahoo Fantasy module
vi.mock('yahoo-fantasy', () => {
  return {
    default: vi.fn(() => mockYahooClient)
  };
});

// Sample roster data
export const mockRosterData = {
  roster: [
    {
      player_id: '12345',
      player_key: 'nfl.p.12345',
      name: { full: 'Josh Allen' },
      editorial_player_key: 'nfl.p.12345',
      position_type: 'O',
      eligible_positions: ['QB'],
      selected_position: 'QB',
      status: 'HEALTHY'
    },
    {
      player_id: '23456',
      player_key: 'nfl.p.23456', 
      name: { full: 'Christian McCaffrey' },
      editorial_player_key: 'nfl.p.23456',
      position_type: 'O',
      eligible_positions: ['RB'],
      selected_position: 'RB',
      status: 'O'  // Out/Injured
    },
    {
      player_id: '34567',
      player_key: 'nfl.p.34567',
      name: { full: 'Cooper Kupp' },
      editorial_player_key: 'nfl.p.34567',
      position_type: 'O', 
      eligible_positions: ['WR'],
      selected_position: 'BN',  // Benched
      status: 'Q'  // Questionable
    }
  ]
};

// Sample league metadata
export const mockLeagueData = {
  league_key: '431.l.123456',
  league_id: '123456',
  name: 'Test League',
  draft_status: 'postdraft',
  season: 2024
};

// Sample game metadata
export const mockGameData = {
  game_key: '431',
  game_id: '431',
  name: 'NFL',
  season: '2024'
};

// Sample user teams data
export const mockUserTeams = {
  teams: [
    {
      team_key: '431.l.123456.t.1',
      team_id: '1',
      league_key: '431.l.123456',
      name: 'Test Team'
    }
  ]
};

// Sample transaction response
export const mockTransactionResponse = {
  transaction: {
    transaction_id: 'trans_123',
    type: 'add_drop',
    status: 'successful',
    players: [
      { player_key: 'nfl.p.12345', transaction_type: 'add' },
      { player_key: 'nfl.p.23456', transaction_type: 'drop' }
    ]
  }
};

// Helper to setup common mock responses
export function setupYahooMocks() {
  mockYahooClient.game.meta.mockResolvedValue(mockGameData);
  mockYahooClient.getGameMeta.mockResolvedValue(mockGameData);
  mockYahooClient.league.meta.mockResolvedValue(mockLeagueData);
  mockYahooClient.getLeagueTeams.mockResolvedValue({ teams: [{ team_key: '431.l.123456.t.1', managers: [{ guid: 'test-user-1' }] }] });
  mockYahooClient.getUserGameTeams.mockResolvedValue(mockUserTeams);
  mockYahooClient.user.game_teams.mockResolvedValue(mockUserTeams);
  mockYahooClient.team.roster.mockResolvedValue(mockRosterData);
  mockYahooClient.team.transactions().add.mockResolvedValue(mockTransactionResponse);
}

// Helper to reset all mocks
export function resetYahooMocks() {
  vi.clearAllMocks();
}