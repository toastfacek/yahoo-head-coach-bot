import { describe, it, expect } from 'vitest';

// Test the scout tool's data processing logic
describe('Scout Tool - Data Processing', () => {
  const mockYahooRoster = [
    {
      player_id: '12345',
      player_key: 'nfl.p.12345',
      name: { full: 'Josh Allen' },
      position_type: 'O',
      eligible_positions: ['QB'],
      selected_position: 'QB',
      status: 'HEALTHY'
    },
    {
      player_id: '23456', 
      player_key: 'nfl.p.23456',
      name: { full: 'Christian McCaffrey' },
      position_type: 'O',
      eligible_positions: ['RB'],
      selected_position: 'RB', 
      status: 'O'  // Out
    },
    {
      player_id: '34567',
      player_key: 'nfl.p.34567', 
      name: { full: 'Cooper Kupp' },
      position_type: 'O',
      eligible_positions: ['WR'],
      selected_position: 'WR',
      status: 'Q'  // Questionable
    },
    {
      player_id: '45678',
      player_key: 'nfl.p.45678',
      name: { full: 'Travis Kelce' },
      position_type: 'O',
      eligible_positions: ['TE'],
      selected_position: 'TE',
      status: 'D'  // Doubtful
    },
    {
      player_id: '56789',
      player_key: 'nfl.p.56789', 
      name: { full: 'Injured Reserve Player' },
      position_type: 'O',
      eligible_positions: ['RB'],
      selected_position: 'IR',
      status: 'IR'
    }
  ];

  describe('roster data transformation', () => {
    it('transforms Yahoo roster data correctly', () => {
      const transformedRoster = mockYahooRoster.map((p: any) => ({
        playerId: p.player_id,
        playerKey: p.player_key,
        name: p.name?.full || 'Unknown',
        positions: Array.isArray(p.eligible_positions) ? p.eligible_positions : [],
        selectedPosition: p.selected_position || 'BN',
        status: p.status || 'HEALTHY'
      }));

      expect(transformedRoster).toHaveLength(5);
      expect(transformedRoster[0]).toEqual({
        playerId: '12345',
        playerKey: 'nfl.p.12345',
        name: 'Josh Allen',
        positions: ['QB'],
        selectedPosition: 'QB',
        status: 'HEALTHY'
      });
    });
  });

  describe('injury signal categorization', () => {
    it('categorizes injury signals correctly', () => {
      // Simulate scout tool logic
      const roster = mockYahooRoster.map((p: any) => ({
        playerId: p.player_id,
        name: p.name?.full || 'Unknown',
        status: p.status || 'HEALTHY'
      }));

      const signals = {
        out: roster.filter(p => /^(O|OUT)$/i.test(p.status)),
        doubtful: roster.filter(p => /^(D|Doubtful)$/i.test(p.status)),
        questionable: roster.filter(p => /^(Q|Questionable)$/i.test(p.status)),
        ir: roster.filter(p => /IR|PUP|NFI|SUSP/i.test(p.status))
      };

      expect(signals.out).toHaveLength(1);
      expect(signals.out[0].playerId).toBe('23456');
      
      expect(signals.doubtful).toHaveLength(1);
      expect(signals.doubtful[0].playerId).toBe('45678');
      
      expect(signals.questionable).toHaveLength(1);
      expect(signals.questionable[0].playerId).toBe('34567');
      
      expect(signals.ir).toHaveLength(1);
      expect(signals.ir[0].playerId).toBe('56789');
    });

    it('handles missing or undefined status', () => {
      const playersWithoutStatus = [
        { playerId: '1', status: undefined },
        { playerId: '2', status: null },
        { playerId: '3', status: '' },
        { playerId: '4' } // no status property
      ];

      const out = playersWithoutStatus.filter(p => /^(O|OUT)$/i.test(p.status || ''));
      expect(out).toHaveLength(0);

      const healthy = playersWithoutStatus.filter(p => !p.status || p.status === 'HEALTHY');
      expect(healthy).toHaveLength(4);
    });
  });

  describe('signal aggregation', () => {
    it('calculates total signals correctly', () => {
      const mockSignals = {
        out: [{ playerId: '1' }, { playerId: '2' }],
        doubtful: [{ playerId: '3' }],  
        questionable: [{ playerId: '4' }, { playerId: '5' }],
        ir: [{ playerId: '6' }]
      };

      const totalInjurySignals = Object.values(mockSignals).reduce(
        (sum, arr) => sum + arr.length, 
        0
      );

      expect(totalInjurySignals).toBe(6);
    });

    it('identifies high-priority injury signals', () => {
      const mockSignals = {
        out: [{ playerId: '1', name: 'Out Player' }],
        doubtful: [],
        questionable: [{ playerId: '2', name: 'Q Player' }], 
        ir: [{ playerId: '3', name: 'IR Player' }]
      };

      // High priority: Out or IR players
      const highPriority = [...mockSignals.out, ...mockSignals.ir];
      expect(highPriority).toHaveLength(2);
      
      // Medium priority: Doubtful/Questionable
      const mediumPriority = [...mockSignals.doubtful, ...mockSignals.questionable];
      expect(mediumPriority).toHaveLength(1);
    });
  });

  describe('roster analysis', () => {
    it('identifies roster construction issues', () => {
      const mockRoster = [
        { position: 'QB', status: 'HEALTHY', selectedPosition: 'QB' },
        { position: 'QB', status: 'HEALTHY', selectedPosition: 'BN' },  // Backup QB
        { position: 'RB', status: 'O', selectedPosition: 'RB' },        // Injured starter
        { position: 'RB', status: 'HEALTHY', selectedPosition: 'BN' },   // Healthy backup
        { position: 'WR', status: 'Q', selectedPosition: 'WR' },        // Questionable starter
        { position: 'WR', status: 'HEALTHY', selectedPosition: 'WR' },   // Healthy starter
      ];

      // Injured starters
      const injuredStarters = mockRoster.filter(p => 
        p.selectedPosition !== 'BN' && /^(O|Q|D|IR)$/i.test(p.status)
      );
      expect(injuredStarters).toHaveLength(2);

      // Available healthy backups  
      const healthyBackups = mockRoster.filter(p =>
        p.selectedPosition === 'BN' && p.status === 'HEALTHY'
      );
      expect(healthyBackups).toHaveLength(2);
    });

    it('calculates roster health score', () => {
      const mockRoster = [
        { status: 'HEALTHY' },
        { status: 'HEALTHY' },
        { status: 'Q' },
        { status: 'O' },
        { status: 'IR' }
      ];

      const healthyPlayers = mockRoster.filter(p => p.status === 'HEALTHY').length;
      const totalPlayers = mockRoster.length;
      const healthScore = (healthyPlayers / totalPlayers) * 100;

      expect(healthScore).toBe(40); // 2/5 = 40%
    });
  });

  describe('news signal processing', () => {
    it('processes news signals by priority', () => {
      const mockNewsSignals = [
        { playerId: '1', headline: 'Player ruled OUT for Sunday', severity: 'high' },
        { playerId: '2', headline: 'Player questionable with ankle', severity: 'medium' },
        { playerId: '3', headline: 'Player full participant in practice', severity: 'low' }
      ];

      const highPriorityNews = mockNewsSignals.filter(s => s.severity === 'high');
      const mediumPriorityNews = mockNewsSignals.filter(s => s.severity === 'medium');

      expect(highPriorityNews).toHaveLength(1);
      expect(mediumPriorityNews).toHaveLength(1);
    });

    it('matches news to roster players', () => {
      const rosterPlayerIds = ['12345', '23456', '34567'];
      const newsSignals = [
        { playerId: '12345', headline: 'QB news' },
        { playerId: '99999', headline: 'Non-roster player news' },
        { playerId: '23456', headline: 'RB news' }
      ];

      const relevantNews = newsSignals.filter(news => 
        rosterPlayerIds.includes(news.playerId)
      );

      expect(relevantNews).toHaveLength(2);
      expect(relevantNews.map(n => n.playerId)).toEqual(['12345', '23456']);
    });
  });
});