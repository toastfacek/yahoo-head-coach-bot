#!/usr/bin/env ts-node
// Test script to verify Yahoo Fantasy API connection
import { prisma } from '../db';
import { yfForUser, getGameKey, userTeamKey, isLeaguePostDraft } from '../services/yahoo';

async function testConnection() {
  console.log('🔍 Testing Yahoo Fantasy API connection...\n');

  const userId = 'dev'; // Default user ID
  let yf: any;

  try {
    // Step 1: Check if user has Yahoo token
    console.log('1. Checking Yahoo token...');
    const token = await prisma.yahooToken.findUnique({ where: { userId } });

    if (!token) {
      console.log('❌ No Yahoo token found for user:', userId);
      console.log('🔗 Please visit: http://localhost:3000/api/oauth/start?userId=dev');
      process.exit(1);
    }

    console.log('✅ Yahoo token found');
    console.log(`   - Expires: ${token.expiresAt}`);
    console.log(`   - Scope: ${token.scope}`);

    // Step 2: Create Yahoo client
    console.log('\n2. Creating Yahoo client...');
    yf = await yfForUser(userId);
    console.log('✅ Yahoo client created');

    // Step 3: Get game info
    console.log('\n3. Fetching game info...');
    const gameKey = await getGameKey(yf, 'nfl');
    console.log(`✅ Game key: ${gameKey}`);

    // Step 4: Get user's teams
    console.log('\n4. Fetching user teams...');
    const userTeams = await yf.user.game_teams(gameKey);
    const teams = userTeams.teams || [];

    console.log(`✅ Found ${teams.length} team(s):`);
    teams.forEach((team: any, index: number) => {
      console.log(`   ${index + 1}. ${team.name} (League: ${team.league?.name || 'Unknown'})`);
      console.log(`      - Team Key: ${team.team_key}`);
      console.log(`      - League Key: ${team.league_key}`);
    });

    if (teams.length === 0) {
      console.log('⚠️  No teams found. Make sure you have joined a fantasy league.');
      return;
    }

    // Step 5: Test each league
    console.log('\n5. Testing league connections...');
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      console.log(`\n   Testing League: ${team.league?.name || 'Unknown'}`);

      try {
        // Check draft status
        const isPostDraft = await isLeaguePostDraft(yf, team.league_key);
        console.log(`   📋 Draft status: ${isPostDraft ? 'Post-draft ✅' : 'Pre-draft ⏳'}`);

        // Get team key
        const teamKey = await userTeamKey(yf, gameKey, team.league_key);
        console.log(`   🏈 Team key: ${teamKey}`);

        // Get roster
        console.log('   👥 Fetching roster...');
        const rosterData = await yf.team.roster(teamKey);
        const roster = rosterData?.roster || [];

        console.log(`   ✅ Roster loaded: ${roster.length} players`);

        // Show sample players
        const samplePlayers = roster.slice(0, 3).map((p: any) => ({
          name: p.name?.full || 'Unknown',
          position: p.eligible_positions?.[0] || 'Unknown',
          status: p.status || 'Unknown',
        }));

        console.log('   Sample players:');
        samplePlayers.forEach((player: any, idx: number) => {
          console.log(`     ${idx + 1}. ${player.name} (${player.position}) - ${player.status}`);
        });

        console.log(`   🎯 Connection test for "${team.league?.name}" PASSED!`);
      } catch (error: any) {
        console.log(`   ❌ Error testing league "${team.league?.name}":`, error.message);
      }
    }

    console.log('\n🎉 Connection test completed successfully!');
    console.log('\nNext steps:');
    console.log(
      '- Test daily report: GET http://localhost:3000/api/reports/daily?leagueId=<your_league_id>'
    );
    console.log('- Test lineup check: POST http://localhost:3000/lineup/check');
    console.log('- Test waiver analysis: POST http://localhost:3000/waivers/run');
  } catch (error: any) {
    console.log('\n❌ Connection test failed:', error.message);

    if (error.message.includes('Tenant or user not found')) {
      console.log('\n💡 Database connection issue. Check your DATABASE_URL in .env');
    }

    if (error.message.includes('unauthorized')) {
      console.log('\n💡 Yahoo token may be expired. Try re-authorizing:');
      console.log('   http://localhost:3000/api/oauth/start?userId=dev');
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testConnection().catch(console.error);
}

export { testConnection };
