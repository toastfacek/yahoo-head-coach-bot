declare module 'yahoo-fantasy' {
  interface YahooFantasyClient {
    game: {
      meta(code: string): Promise<any>;
    };
    league: {
      meta(leagueKey: string): Promise<any>;
    };
    user: {
      game_teams(gameKey: string): Promise<any>;
    };
    team: {
      roster(teamKey: string): Promise<any>;
      transactions(teamKey: string): {
        add(data: any): Promise<any>;
      };
    };
    setUserToken(token: string): void;
    setRefreshToken(token: string): void;
  }

  class YahooFantasy {
    constructor(
      clientId: string,
      clientSecret: string,
      onRefresh: (tokenData: any) => void,
      redirectUri: string
    );

    game: YahooFantasyClient['game'];
    league: YahooFantasyClient['league'];
    user: YahooFantasyClient['user'];
    team: YahooFantasyClient['team'];
    setUserToken: YahooFantasyClient['setUserToken'];
    setRefreshToken: YahooFantasyClient['setRefreshToken'];
  }

  export = YahooFantasy;
}
