import streamlit as st
import requests
from sseclient import SSEClient  # pip install sseclient-py
import time
from datetime import datetime

API_BASE = st.secrets.get("API_BASE", "http://localhost:3000/api")

st.set_page_config(
    page_title="Fantasy HeadCoach", 
    page_icon="🏈",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for modern design
st.markdown("""
<style>
    /* Hide Streamlit branding */
    .css-1jc7ptx, .e1ewe7hr3, .viewerBadge_container__1QSob,
    .styles_viewerBadge__1yB5_, #MainMenu, header, footer {
        visibility: hidden;
    }
    
    /* Main background */
    .main .block-container {
        padding-top: 2rem;
        padding-bottom: 2rem;
    }
    
    /* Hero banner gradient */
    .hero-banner {
        background: linear-gradient(135deg, #10B981 0%, #3B82F6 100%);
        padding: 2rem;
        border-radius: 1rem;
        color: white;
        margin-bottom: 2rem;
        position: relative;
        overflow: hidden;
    }
    
    .hero-banner::before {
        content: '';
        position: absolute;
        top: -50%;
        right: -20px;
        width: 100px;
        height: 200%;
        background: rgba(255, 255, 255, 0.1);
        transform: rotate(15deg);
    }
    
    .hero-title {
        font-size: 2.5rem;
        font-weight: bold;
        margin-bottom: 0.5rem;
    }
    
    .hero-subtitle {
        font-size: 1.2rem;
        opacity: 0.9;
    }
    
    /* Stat cards */
    .stat-card {
        background: white;
        padding: 1.5rem;
        border-radius: 1rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        border: 1px solid #E5E7EB;
        margin-bottom: 1rem;
    }
    
    .stat-value {
        font-size: 2rem;
        font-weight: bold;
        color: #1F2937;
        margin-bottom: 0.25rem;
    }
    
    .stat-label {
        color: #6B7280;
        font-size: 0.875rem;
        font-weight: 500;
    }
    
    .stat-change {
        font-size: 0.75rem;
        font-weight: 500;
        margin-top: 0.25rem;
    }
    
    .stat-change.positive { color: #10B981; }
    .stat-change.neutral { color: #6B7280; }
    
    /* Player cards */
    .player-card {
        background: white;
        padding: 1rem;
        border-radius: 0.75rem;
        border: 1px solid #E5E7EB;
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 0.5rem;
    }
    
    .player-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        color: white;
        font-size: 1rem;
    }
    
    .player-avatar.qb { background: #3B82F6; }
    .player-avatar.rb { background: #10B981; }
    .player-avatar.wr { background: #F59E0B; }
    .player-avatar.te { background: #8B5CF6; }
    .player-avatar.k { background: #EF4444; }
    .player-avatar.dst { background: #6B7280; }
    
    .player-info {
        flex: 1;
    }
    
    .player-name {
        font-weight: 600;
        color: #1F2937;
        margin-bottom: 0.25rem;
    }
    
    .player-team {
        color: #6B7280;
        font-size: 0.875rem;
    }
    
    .player-points {
        text-align: right;
        font-weight: 600;
        color: #1F2937;
    }
    
    /* Action cards */
    .action-card {
        background: white;
        padding: 1.5rem;
        border-radius: 1rem;
        border: 1px solid #E5E7EB;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 1rem;
    }
    
    .action-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    .action-icon {
        width: 48px;
        height: 48px;
        border-radius: 0.75rem;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1rem;
        font-size: 1.5rem;
    }
    
    .action-card.primary .action-icon { background: #DBEAFE; }
    .action-card.success .action-icon { background: #D1FAE5; }
    .action-card.warning .action-icon { background: #FEF3C7; }
    .action-card.info .action-icon { background: #E0F2FE; }
    .action-card.danger .action-icon { background: #FEE2E2; }
    .action-card.purple .action-icon { background: #EDE9FE; }
    
    .action-title {
        font-weight: 600;
        color: #1F2937;
        margin-bottom: 0.5rem;
    }
    
    .action-description {
        color: #6B7280;
        font-size: 0.875rem;
    }
    
    /* Sidebar styling */
    .css-1d391kg {
        background: #F8FAFC;
    }
    
    /* Ensure sidebar expand button is always visible */
    .css-1lcbmhc .css-1outpf7 {
        visibility: visible !important;
        opacity: 1 !important;
    }
    
    /* Style the sidebar toggle button */
    .css-1lcbmhc .css-1outpf7 .css-1cpxqw2 {
        background: #3B82F6 !important;
        color: white !important;
        border-radius: 0 8px 8px 0 !important;
        padding: 8px !important;
        margin-top: 10px !important;
    }
    
    /* Sidebar collapse/expand button styling */
    .css-1lcbmhc .css-1outpf7:hover .css-1cpxqw2 {
        background: #2563EB !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
    }
    
    /* Make sure the sidebar toggle is always accessible */
    [data-testid="collapsedControl"] {
        display: block !important;
        visibility: visible !important;
        z-index: 999999 !important;
        background: #3B82F6 !important;
        border-radius: 0 8px 8px 0 !important;
        margin-top: 10px !important;
    }
    
    [data-testid="collapsedControl"]:hover {
        background: #2563EB !important;
    }
    
    /* Floating expand button as backup */
    .floating-expand-btn {
        position: fixed;
        top: 20px;
        left: 10px;
        z-index: 999999;
        background: #3B82F6;
        color: white;
        border: none;
        border-radius: 0 8px 8px 0;
        padding: 8px 12px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        font-size: 16px;
        display: none;
    }
    
    .floating-expand-btn:hover {
        background: #2563EB;
    }
    
    /* Show floating button when sidebar is collapsed */
    .css-1lcbmhc.css-12ttj6m ~ .main .floating-expand-btn {
        display: block;
    }
    
    /* Status indicators */
    .status-indicator {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border-radius: 2rem;
        font-size: 0.875rem;
        font-weight: 500;
    }
    
    .status-indicator.success {
        background: #D1FAE5;
        color: #065F46;
    }
    
    .status-indicator.warning {
        background: #FEF3C7;
        color: #92400E;
    }
    
    .status-indicator.error {
        background: #FEE2E2;
        color: #991B1B;
    }
</style>
""", unsafe_allow_html=True)

# Add floating expand button with JavaScript
st.markdown("""
<div class="floating-expand-btn" onclick="expandSidebar()">☰</div>

<script>
function expandSidebar() {
    // Try multiple methods to expand the sidebar
    
    // Method 1: Click the Streamlit collapse button
    const collapseBtn = document.querySelector('[data-testid="collapsedControl"]');
    if (collapseBtn) {
        collapseBtn.click();
        return;
    }
    
    // Method 2: Try other Streamlit sidebar toggle selectors
    const toggleSelectors = [
        '.css-1lcbmhc .css-1outpf7',
        '.css-1cpxqw2',
        '[aria-label="Open sidebar"]',
        '.sidebar-toggle',
        '.css-1lcbmhc button'
    ];
    
    for (const selector of toggleSelectors) {
        const btn = document.querySelector(selector);
        if (btn) {
            btn.click();
            return;
        }
    }
    
    // Method 3: Force show sidebar by manipulating classes
    const sidebar = document.querySelector('.css-1lcbmhc');
    if (sidebar && sidebar.classList.contains('css-12ttj6m')) {
        sidebar.classList.remove('css-12ttj6m');
    }
    
    // Hide the floating button after expanding
    setTimeout(() => {
        const floatingBtn = document.querySelector('.floating-expand-btn');
        if (floatingBtn) floatingBtn.style.display = 'none';
    }, 100);
}

// Auto-detect when sidebar is collapsed and show floating button
function checkSidebarState() {
    const sidebar = document.querySelector('.css-1lcbmhc');
    const floatingBtn = document.querySelector('.floating-expand-btn');
    
    if (sidebar && floatingBtn) {
        if (sidebar.classList.contains('css-12ttj6m')) {
            // Sidebar is collapsed
            floatingBtn.style.display = 'block';
        } else {
            // Sidebar is expanded  
            floatingBtn.style.display = 'none';
        }
    }
}

// Check sidebar state periodically
setInterval(checkSidebarState, 500);

// Initial check
setTimeout(checkSidebarState, 1000);
</script>
""", unsafe_allow_html=True)

# Initialize session state
if 'user_id' not in st.session_state:
    st.session_state['user_id'] = 'dev'
if 'league_id' not in st.session_state:
    st.session_state['league_id'] = ''
if 'current_page' not in st.session_state:
    st.session_state['current_page'] = 'Dashboard'

# Sidebar Navigation
with st.sidebar:
    st.markdown("### 🏈 Fantasy HeadCoach")
    st.markdown("---")
    
    # Navigation menu
    pages = {
        "📊 Dashboard": "Dashboard",
        "👥 Roster": "Roster", 
        "🔄 Waivers": "Waivers",
        "📈 Analysis": "Analysis",
        "🎯 Strategy": "Strategy"
    }
    
    for page_name, page_key in pages.items():
        if st.button(page_name, key=page_key, use_container_width=True):
            st.session_state['current_page'] = page_key
    
    st.markdown("---")
    
    # OAuth Status in Sidebar
    st.markdown("**Authentication**")
    try:
        oauth_status = requests.get(f"{API_BASE}/oauth/status", params={"userId": st.session_state['user_id']}, timeout=5).json()
        if oauth_status.get("hasToken"):
            st.markdown('<div class="status-indicator success">✅ Connected</div>', unsafe_allow_html=True)
            expires_in = oauth_status.get('expiresInSeconds', 0)
            if expires_in > 0:
                st.caption(f"Expires in {expires_in // 60}m")
        else:
            st.markdown('<div class="status-indicator error">❌ Disconnected</div>', unsafe_allow_html=True)
            if st.button("🔗 Connect Yahoo", use_container_width=True):
                st.markdown(f"[Click here to authenticate]({API_BASE}/oauth/start?userId={st.session_state['user_id']})")
    except:
        st.markdown('<div class="status-indicator error">❌ Server Error</div>', unsafe_allow_html=True)
    
    st.markdown("---")
    
    # League Selection in Sidebar
    st.markdown("**League Selection**")
    league_selected = False
    
    try:
        leagues_response = requests.get(f"{API_BASE}/leagues", params={"userId": st.session_state['user_id']}, timeout=5)
        if leagues_response.status_code == 200:
            leagues_data = leagues_response.json()
            leagues = leagues_data.get('leagues', [])
            if leagues:
                league_options = {f"{league['name']} ({league['id']})": league['id'] for league in leagues}
                
                # Show current selection if any
                current_selection = None
                if st.session_state.get('league_id'):
                    for display_name, league_id in league_options.items():
                        if league_id == st.session_state['league_id']:
                            current_selection = display_name
                            break
                
                selected_league = st.selectbox(
                    "Choose league:",
                    options=list(league_options.keys()),
                    index=list(league_options.keys()).index(current_selection) if current_selection else 0,
                    key="sidebar_league_selector"
                )
                
                if selected_league:
                    st.session_state['league_id'] = league_options[selected_league]
                    league_selected = True
                    # Show current league name
                    league_name = selected_league.split(' (')[0]  # Extract name without ID
                    st.success(f"📋 {league_name}")
            else:
                st.warning("No leagues found")
                if st.button("🔄 Refresh", key="refresh_leagues", use_container_width=True):
                    st.rerun()
        else:
            if leagues_response.status_code == 401:
                st.error("🔑 Please authenticate first")
            else:
                st.error("⚠️ Error fetching leagues")
                if st.button("🔄 Retry", key="retry_leagues", use_container_width=True):
                    st.rerun()
    except Exception as e:
        # Manual league ID input as fallback in sidebar
        st.caption("⚙️ Manual entry:")
        league_id = st.text_input(
            "League ID",
            value=st.session_state.get("league_id", ""),
            placeholder="Enter league ID",
            key="manual_league_id"
        )
        if league_id:
            st.session_state["league_id"] = league_id
            league_selected = True
            st.success(f"📋 League: {league_id}")

# Store league_selected in session state for main content
st.session_state['league_selected'] = league_selected

# Main content based on selected page
if st.session_state['current_page'] == 'Dashboard':
    # Get league selection status from sidebar
    league_selected = st.session_state.get('league_selected', False)

    # Only show dashboard content if we have a league selected
    if league_selected and st.session_state.get('league_id'):
        # Loading state for dashboard data
        with st.spinner("Loading your fantasy dashboard..."):
            # Fetch team statistics
            team_stats = None
            stats_error = None
            try:
                stats_response = requests.get(f"{API_BASE}/team/stats", 
                                            params={"userId": st.session_state['user_id'], 
                                                   "leagueId": st.session_state['league_id']}, 
                                            timeout=5)
                if stats_response.status_code == 200:
                    team_stats = stats_response.json()
                else:
                    stats_error = f"Failed to load stats (Error {stats_response.status_code})"
            except requests.exceptions.Timeout:
                stats_error = "Request timed out - server may be slow"
            except requests.exceptions.ConnectionError:
                stats_error = "Cannot connect to server - check if it's running"
            except Exception as e:
                stats_error = f"Unexpected error: {str(e)}"
                
        # Show error if stats failed to load
        if stats_error:
            st.warning(f"⚠️ {stats_error}. Using sample data for display.")

        # Hero Banner with real data
        if team_stats:
            current_week = team_stats.get('currentWeek', {}).get('week', 1)
            record = team_stats.get('record', {})
            user_record = f"{record.get('wins', 0)}-{record.get('losses', 0)}"
            
            # Determine title based on record
            if record.get('wins', 0) > record.get('losses', 0):
                title = "Welcome back, Champion!"
            elif record.get('wins', 0) == record.get('losses', 0):
                title = "Ready to break the tie?"
            else:
                title = "Time for a comeback!"
        else:
            # Fallback for when stats aren't available
            current_week = 1
            user_record = "0-0"
            title = "Welcome to Fantasy Football!"
        
        st.markdown(f"""
        <div class="hero-banner">
            <div class="hero-title">{title}</div>
            <div class="hero-subtitle">Ready to dominate Week {current_week}?</div>
        </div>
        """, unsafe_allow_html=True)

        # Stat Cards Row with real data
        col1, col2, col3, col4 = st.columns(4)
        
        if team_stats:
            record = team_stats.get('record', {})
            points = team_stats.get('points', {})
            current_week = team_stats.get('currentWeek', {})
            opponent = team_stats.get('opponent', {})
            
            with col1:
                st.markdown(f"""
                <div class="stat-card">
                    <div class="stat-value">{record.get('wins', 0)}-{record.get('losses', 0)}</div>
                    <div class="stat-label">Record</div>
                    <div class="stat-change neutral">#{record.get('rank', 'N/A')} in league</div>
                </div>
                """, unsafe_allow_html=True)
            
            with col2:
                st.markdown(f"""
                <div class="stat-card">
                    <div class="stat-value">{points.get('total', 0)}</div>
                    <div class="stat-label">Total Points</div>
                    <div class="stat-change positive">+{points.get('vsAverage', 0)} vs avg</div>
                </div>
                """, unsafe_allow_html=True)
            
            with col3:
                st.markdown(f"""
                <div class="stat-card">
                    <div class="stat-value">{current_week.get('projected', 0)}</div>
                    <div class="stat-label">This Week</div>
                    <div class="stat-change neutral">Projected points</div>
                </div>
                """, unsafe_allow_html=True)
            
            with col4:
                opp_record = opponent.get('record', {})
                st.markdown(f"""
                <div class="stat-card">
                    <div class="stat-value">{opponent.get('name', 'TBD')}</div>
                    <div class="stat-label">Opponent</div>
                    <div class="stat-change neutral">{opp_record.get('wins', 0)}-{opp_record.get('losses', 0)} • {opponent.get('points', 0)} pts</div>
                </div>
                """, unsafe_allow_html=True)
        else:
            # Fallback to generic data if API fails
            with col1:
                st.markdown("""
                <div class="stat-card">
                    <div class="stat-value">0-0</div>
                    <div class="stat-label">Record</div>
                    <div class="stat-change neutral">Season not started</div>
                </div>
                """, unsafe_allow_html=True)
            
            with col2:
                st.markdown("""
                <div class="stat-card">
                    <div class="stat-value">0</div>
                    <div class="stat-label">Total Points</div>
                    <div class="stat-change neutral">Season not started</div>
                </div>
                """, unsafe_allow_html=True)
            
            with col3:
                st.markdown(f"""
                <div class="stat-card">
                    <div class="stat-value">TBD</div>
                    <div class="stat-label">Week {current_week}</div>
                    <div class="stat-change neutral">Projections loading...</div>
                </div>
                """, unsafe_allow_html=True)
            
            with col4:
                st.markdown("""
                <div class="stat-card">
                    <div class="stat-value">TBD</div>
                    <div class="stat-label">Opponent</div>
                    <div class="stat-change neutral">Matchup TBD</div>
                </div>
                """, unsafe_allow_html=True)
        
        # Star Players Section
        st.subheader("⭐ Your Star Players")
        col1, col2, col3 = st.columns(3)
        
        # Fetch roster data
        roster_data = None
        roster_error = None
        try:
            roster_response = requests.get(f"{API_BASE}/team/roster", 
                                         params={"userId": st.session_state['user_id'], 
                                                "leagueId": st.session_state['league_id']}, 
                                         timeout=5)
            if roster_response.status_code == 200:
                roster_data = roster_response.json()
            else:
                roster_error = f"Failed to load roster (Error {roster_response.status_code})"
        except requests.exceptions.Timeout:
            roster_error = "Roster request timed out"
        except requests.exceptions.ConnectionError:
            roster_error = "Cannot connect to server for roster data"
        except Exception as e:
            roster_error = f"Roster error: {str(e)}"
            
        if roster_error:
            st.info(f"ℹ️ {roster_error}. Showing sample players.")
        
        if roster_data and roster_data.get('starters'):
            star_players = roster_data['starters'][:3]  # Top 3 starters
        else:
            # Fallback data
            star_players = [
                {"name": "Josh Allen", "position": "QB", "team": "BUF", "points": 23.4},
                {"name": "Christian McCaffrey", "position": "RB", "team": "SF", "points": 18.7},
                {"name": "Tyreek Hill", "position": "WR", "team": "MIA", "points": 21.1}
            ]
        
        for i, player in enumerate(star_players):
            if i < 3:  # Only show top 3
                with [col1, col2, col3][i]:
                    st.markdown(f"""
                    <div class="player-card">
                        <div class="player-avatar {player['position'].lower()}">{player['position']}</div>
                        <div class="player-info">
                            <div class="player-name">{player['name']}</div>
                            <div class="player-team">{player['team']} • {player['points']} pts</div>
                        </div>
                    </div>
                    """, unsafe_allow_html=True)
        
        # Quick Actions Section
        st.subheader("⚡ Quick Actions")
        
        action_col1, action_col2, action_col3 = st.columns(3)
        action_col4, action_col5, action_col6 = st.columns(3)
        
        actions = [
            {"title": "Find a Running Back", "desc": "Scout available RBs on waivers", "icon": "🔍", "color": "primary", "key": "find_rb"},
            {"title": "Set Your Lineup", "desc": "Optimize your starting roster", "icon": "👥", "color": "success", "key": "set_lineup"},
            {"title": "Check Weather", "desc": "Weather impact on games", "icon": "🌤️", "color": "info", "key": "check_weather"},
            {"title": "Matchup Analysis", "desc": "Deep dive into this week", "icon": "📊", "color": "purple", "key": "matchup"},
            {"title": "Trade Finder", "desc": "Discover trade opportunities", "icon": "🔄", "color": "warning", "key": "trade_finder"},
            {"title": "Injury Report", "desc": "Latest injury updates", "icon": "🏥", "color": "danger", "key": "injury_report"}
        ]
        
        action_cols = [action_col1, action_col2, action_col3, action_col4, action_col5, action_col6]
        
        for i, action in enumerate(actions):
            with action_cols[i]:
                if st.button(f"{action['icon']} {action['title']}", key=action['key'], use_container_width=True):
                    if action['key'] == 'find_rb':
                        st.session_state['current_page'] = 'Waivers'
                        st.rerun()
                    elif action['key'] == 'set_lineup':
                        st.session_state['current_page'] = 'Roster'
                        st.rerun()
                    elif action['key'] == 'matchup':
                        st.session_state['current_page'] = 'Analysis'
                        st.rerun()
                    else:
                        st.info(f"Opening {action['title']}...")
                st.caption(action['desc'])

        # Pending Approvals Section
        st.subheader("⚖️ Pending Recommendations")
        
        try:
            with st.spinner("Loading recommendations..."):
                r = requests.get(f"{API_BASE}/approvals/pending", 
                               params={"leagueId": st.session_state['league_id']}, 
                               timeout=5)
            if r.ok:
                pending = r.json().get("pending", [])
                if pending:
                    for p in pending:
                        confidence_pct = p.get('confidence', 0) * 100 if isinstance(p.get('confidence'), (int, float)) else 0
                        
                        with st.container():
                            st.markdown(f"""
                            <div class="stat-card">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                                    <div>
                                        <div class="stat-value" style="font-size: 1.25rem;">{p.get('summary', 'Recommendation')}</div>
                                        <div class="stat-change positive">Confidence: {confidence_pct:.0f}%</div>
                                    </div>
                                </div>
                            </div>
                            """, unsafe_allow_html=True)
                            
                            col1, col2 = st.columns(2)
                            if col1.button(f"✅ Approve", key=f"a{p.get('id', 'unknown')}", use_container_width=True):
                                approve_r = requests.post(f"{API_BASE}/approvals/approve", json={"id": p.get("id")})
                                if approve_r.ok:
                                    st.success("Approved!")
                                    st.rerun()
                                else:
                                    st.error("Approval failed")
                            if col2.button(f"❌ Reject", key=f"r{p.get('id', 'unknown')}", use_container_width=True):
                                reject_r = requests.post(f"{API_BASE}/approvals/reject", json={"id": p.get("id")})
                                if reject_r.ok:
                                    st.success("Rejected!")
                                    st.rerun()
                                else:
                                    st.error("Rejection failed")
                else:
                    st.info("🎉 No pending recommendations. Your team is optimized!")
            else:
                st.warning(f"Could not fetch pending approvals (Error {r.status_code})")
        except requests.exceptions.Timeout:
            st.warning("⏱️ Request timed out while loading recommendations")
        except requests.exceptions.ConnectionError:
            st.warning("🔌 Cannot connect to server for recommendations")
        except Exception as e:
            st.error(f"Unexpected error loading approvals: {str(e)}")
    else:
        st.info("👈 Please select a league in the sidebar to access your dashboard")

# Other pages (placeholder content for now)
elif st.session_state['current_page'] == 'Roster':
    st.title("👥 Team Roster")
    
    if st.session_state.get('league_selected', False) and st.session_state.get('league_id'):
        st.info("Roster management coming soon...")
        
        if st.button("📋 Check Lineup", use_container_width=True):
            try:
                with st.spinner("Checking your lineup..."):
                    r = requests.post(f"{API_BASE}/lineup/check", json={"leagueId": st.session_state['league_id']})
                    if r.ok:
                        st.success("✅ Lineup check complete!")
                        st.json(r.json())
                    else:
                        st.error(f"❌ Error: {r.status_code}")
            except Exception as e:
                st.error(f"Error checking lineup: {e}")
    else:
        st.info("👈 Please select a league in the sidebar to access roster tools")

elif st.session_state['current_page'] == 'Waivers':
    st.title("🔄 Waiver Wire")
    
    if st.session_state.get('league_selected', False) and st.session_state.get('league_id'):
        st.info("Waiver wire analysis coming soon...")
        
        if st.button("🔄 Run Waiver Analysis", use_container_width=True):
            try:
                with st.spinner("Analyzing waiver wire..."):
                    r = requests.post(f"{API_BASE}/waivers/run", json={"leagueId": st.session_state['league_id']})
                    if r.ok:
                        st.success("✅ Waiver analysis complete!")
                        st.json(r.json())
                    else:
                        st.error(f"❌ Error: {r.status_code}")
            except Exception as e:
                st.error(f"Error running waivers: {e}")
    else:
        st.info("👈 Please select a league in the sidebar to access waiver tools")

elif st.session_state['current_page'] == 'Analysis':
    st.title("📈 Analytics & Insights")
    
    if st.session_state.get('league_selected', False) and st.session_state.get('league_id'):
        st.info("Advanced analytics coming soon...")
        
        if st.button("📈 Generate Daily Report", use_container_width=True):
            try:
                with st.spinner("Generating your daily report..."):
                    # Stream tokens as they arrive
                    messages = SSEClient(f"{API_BASE}/reports/daily?leagueId={st.session_state['league_id']}")
                    placeholder = st.empty()
                    buf = ""
                    for ev in messages.events():
                        if ev.data:
                            buf += ev.data + "\n"
                            placeholder.markdown(buf)
            except Exception as e:
                st.error(f"Error running daily report: {e}")
    else:
        st.info("👈 Please select a league in the sidebar to access analytics")

elif st.session_state['current_page'] == 'Strategy':
    st.title("🎯 Strategy & Planning")
    st.info("Strategic planning tools coming soon...")

