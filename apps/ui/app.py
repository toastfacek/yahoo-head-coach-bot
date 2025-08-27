import streamlit as st
import requests
from sseclient import SSEClient  # pip install sseclient-py
import time
from datetime import datetime

API_BASE = st.secrets.get("API_BASE", "http://localhost:3000/api")

# Show connection status in sidebar
st.sidebar.markdown("### 🔗 Server Status")
try:
    health_response = requests.get(f"{API_BASE}/health", timeout=3)
    if health_response.status_code == 200:
        st.sidebar.success("✅ Server Connected")
    else:
        st.sidebar.error("❌ Server Error") 
except:
    st.sidebar.warning("⏳ Server Starting...")
    st.sidebar.markdown(f"**Direct Auth URL:** {API_BASE}/oauth/start?userId=dev")

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
    
    /* Force sidebar to always be visible and disable collapse */
    [data-testid="stSidebar"] {
        display: block !important;
        width: 21rem !important;
        min-width: 21rem !important;
        transform: translateX(0) !important;
    }
    
    /* Hide all sidebar collapse/expand buttons */
    [data-testid="stSidebar"] button[kind="headerNoPadding"],
    [data-testid="collapsedControl"],
    .css-1lcbmhc button,
    .sidebar-nav-link {
        display: none !important;
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
    
    /* Persistent Chat Sidebar Styles */
    .chat-container {
        position: fixed;
        right: 0;
        top: 0;
        height: 100vh;
        z-index: 1000;
        transition: transform 0.3s ease;
        background: white;
        border-left: 1px solid #E5E7EB;
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
    }
    
    .chat-container.collapsed {
        transform: translateX(calc(100% - 50px));
        width: 350px;
    }
    
    .chat-container.expanded {
        transform: translateX(0);
        width: 350px;
    }
    
    .chat-toggle-button {
        position: absolute;
        left: -40px;
        top: 20px;
        width: 40px;
        height: 40px;
        background: #10B981;
        color: white;
        border: none;
        border-radius: 8px 0 0 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        transition: background-color 0.2s;
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
    }
    
    .chat-toggle-button:hover {
        background: #059669;
    }
    
    .chat-header {
        background: #10B981;
        color: white;
        padding: 1rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #E5E7EB;
        flex-shrink: 0;
    }
    
    .chat-title {
        font-weight: 600;
        font-size: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    
    .chat-messages {
        flex: 1;
        padding: 1rem;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        background: #FAFAFA;
    }
    
    .chat-message {
        max-width: 80%;
        padding: 0.75rem 1rem;
        border-radius: 1rem;
        word-wrap: break-word;
    }
    
    .chat-message.user {
        align-self: flex-end;
        background: #10B981;
        color: white;
        border-bottom-right-radius: 0.25rem;
    }
    
    .chat-message.agent {
        align-self: flex-start;
        background: white;
        color: #374151;
        border: 1px solid #E5E7EB;
        border-bottom-left-radius: 0.25rem;
    }
    
    .chat-input-container {
        padding: 1rem;
        border-top: 1px solid #E5E7EB;
        background: white;
        flex-shrink: 0;
    }
    
    .chat-input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #D1D5DB;
        border-radius: 0.5rem;
        outline: none;
        font-size: 0.875rem;
        resize: none;
    }
    
    .chat-input:focus {
        border-color: #10B981;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
    }
    
    .chat-send-button {
        margin-top: 0.5rem;
        width: 100%;
        padding: 0.75rem;
        background: #10B981;
        color: white;
        border: none;
        border-radius: 0.5rem;
        cursor: pointer;
        font-weight: 500;
        transition: background-color 0.2s;
    }
    
    .chat-send-button:hover {
        background: #059669;
    }
    
    .chat-send-button:disabled {
        background: #9CA3AF;
        cursor: not-allowed;
    }
    
    .chat-typing {
        align-self: flex-start;
        background: white;
        border: 1px solid #E5E7EB;
        border-radius: 1rem;
        border-bottom-left-radius: 0.25rem;
        padding: 0.75rem 1rem;
        color: #6B7280;
        font-style: italic;
        animation: pulse 1.5s ease-in-out infinite;
    }
    
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
    
    /* Mobile responsiveness */
    @media (max-width: 768px) {
        .chat-container {
            width: 100vw !important;
        }
        
        .chat-container.collapsed {
            transform: translateX(calc(100% - 40px));
        }
        
        .chat-toggle-button {
            left: -35px;
            width: 35px;
            height: 35px;
            font-size: 1rem;
        }
    }
</style>
""", unsafe_allow_html=True)


# Initialize session state
if 'user_id' not in st.session_state:
    st.session_state['user_id'] = 'dev'
if 'league_id' not in st.session_state:
    st.session_state['league_id'] = ''
if 'current_page' not in st.session_state:
    st.session_state['current_page'] = 'Dashboard'

# Chat sidebar session state
if 'chat_expanded' not in st.session_state:
    st.session_state['chat_expanded'] = False
if 'chat_messages' not in st.session_state:
    st.session_state['chat_messages'] = []
if 'chat_input' not in st.session_state:
    st.session_state['chat_input'] = ''
if 'chat_processing' not in st.session_state:
    st.session_state['chat_processing'] = False

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
                
                # Show refresh button if token expires soon (< 1 hour)
                if expires_in < 3600:
                    if st.button("🔄 Refresh Token", use_container_width=True, help="Refresh your Yahoo authentication"):
                        try:
                            refresh_response = requests.get(f"{API_BASE}/oauth/refresh", 
                                                           params={"userId": st.session_state['user_id']}, 
                                                           timeout=10)
                            if refresh_response.status_code == 200:
                                st.success("✅ Token refreshed successfully!")
                                st.rerun()
                            else:
                                st.error("❌ Failed to refresh token. Please reconnect.")
                        except Exception as e:
                            st.error(f"❌ Refresh failed: {str(e)}")
        else:
            st.markdown('<div class="status-indicator error">❌ Disconnected</div>', unsafe_allow_html=True)
            if st.button("🔗 Connect Yahoo", use_container_width=True):
                # Store the auth URL in session state and show instructions
                auth_url = f"{API_BASE}/oauth/start?userId={st.session_state['user_id']}"
                st.markdown(f"[🚀 **Click here to authenticate with Yahoo**]({auth_url})")
                st.info("Open the link above in a new tab, complete authentication, then refresh this page.")
    except Exception as e:
        st.markdown('<div class="status-indicator error">❌ Auth Error</div>', unsafe_allow_html=True)
        if st.button("🔄 Reconnect", use_container_width=True, help="Reconnect to Yahoo Fantasy"):
            # Force reconnection flow
            auth_url = f"{API_BASE}/oauth/start?userId={st.session_state['user_id']}"
            st.session_state['auth_url'] = auth_url  
            st.session_state['show_auth_modal'] = True
            st.rerun()
        st.caption("Connection issue - click to reconnect")
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

# Modal removed - direct authentication links only
if False:  # Disabled modal
    st.markdown("""
    <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
    ">
        <div style="
            background: white;
            padding: 2rem;
            border-radius: 1rem;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        ">
            <h3 style="margin-top: 0; color: #1F2937;">🔐 Yahoo Fantasy Authentication</h3>
            <p style="color: #6B7280; margin-bottom: 1.5rem;">
                To access your fantasy football data, you need to authenticate with Yahoo Fantasy Sports.
                This is secure and only grants access to your fantasy teams.
            </p>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # Create columns for the modal content
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        st.markdown("### 🔐 Yahoo Fantasy Authentication")
        st.markdown("""
        **Steps to connect:**
        1. Click the button below to open Yahoo authentication
        2. Log in with your Yahoo credentials  
        3. Grant permission to access your fantasy data
        4. Return to this page once complete
        """)
        
        # Authentication button
        auth_url = st.session_state.get('auth_url', f"{API_BASE}/oauth/start?userId={st.session_state['user_id']}")
        
        if st.button("🚀 Authenticate with Yahoo", use_container_width=True, type="primary"):
            st.markdown(f'<meta http-equiv="refresh" content="0; url={auth_url}">', unsafe_allow_html=True)
            st.markdown(f"**Click here if not redirected:** [{auth_url}]({auth_url})")
        
        # Also show as a clickable link
        st.markdown(f"""
        <div style="text-align: center; margin: 1rem 0;">
            <a href="{auth_url}" target="_blank" style="
                display: inline-block;
                background: #720E9E;
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
            ">🚀 Open Yahoo Authentication</a>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("---")
        
        st.markdown("**After authenticating with Yahoo:**")
        st.info("✨ Once you complete authentication, this page will automatically refresh and show your fantasy data!")
        
        # Auto-check authentication status every few seconds
        st.markdown("""
        <script>
            // Auto-refresh to check authentication status
            setTimeout(function() {
                window.location.reload();
            }, 5000); // Refresh every 5 seconds to check auth status
        </script>
        """, unsafe_allow_html=True)
        
        # Manual buttons
        col_a, col_b = st.columns(2)
        with col_a:
            if st.button("✅ I've completed authentication", use_container_width=True):
                st.session_state['show_auth_modal'] = False
                st.rerun()
        
        with col_b:
            if st.button("❌ Cancel", use_container_width=True):
                st.session_state['show_auth_modal'] = False
                st.rerun()
                
    # Add a note about the authentication modal being open
    st.stop()  # Prevent the rest of the page from rendering

# Main content based on selected page
if st.session_state['current_page'] == 'Dashboard':
    # Get league selection status from sidebar
    league_selected = st.session_state.get('league_selected', False)

    # Check authentication status for main dashboard
    try:
        oauth_status = requests.get(f"{API_BASE}/oauth/status", params={"userId": st.session_state['user_id']}, timeout=5).json()
        is_authenticated = oauth_status.get("hasToken", False)
    except:
        is_authenticated = False
    
    # Show authentication prompt if not authenticated
    if not is_authenticated:
        st.markdown("""
        <div style="text-align: center; padding: 3rem 1rem; background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%); border-radius: 1rem; margin: 2rem 0;">
            <h2 style="color: #92400E; margin-bottom: 1rem;">🔐 Connect Your Yahoo Fantasy Account</h2>
            <p style="color: #78350F; font-size: 1.1rem; margin-bottom: 2rem;">
                To get started with your HeadCoach assistant, connect your Yahoo Fantasy Football account.
                This allows us to analyze your team and provide personalized recommendations.
            </p>
        </div>
        """, unsafe_allow_html=True)
        
        # Authentication button prominently displayed
        col1, col2, col3 = st.columns([1, 2, 1])
        with col2:
            if st.button("🚀 Connect Yahoo Fantasy Account", 
                        use_container_width=True, 
                        type="primary",
                        help="Secure authentication with Yahoo Fantasy Sports"):
                auth_url = f"{API_BASE}/oauth/start?userId={st.session_state['user_id']}"
                st.markdown(f"[🚀 **Click here to authenticate with Yahoo**]({auth_url})")
                st.info("Open the link above in a new tab, complete authentication, then refresh this page.")
        
        # Add some helpful information
        st.markdown("---")
        st.markdown("""
        ### ❓ What happens when you connect?
        
        **Secure & Safe:**
        - Uses Yahoo's official OAuth system
        - Only accesses your fantasy football data
        - No access to email, passwords, or personal information
        - Can be revoked anytime from your Yahoo account settings
        
        **What you'll get:**
        - Real-time roster analysis and injury updates
        - Personalized waiver wire recommendations  
        - Lineup optimization suggestions
        - Chat with your AI HeadCoach assistant
        - Automated decision-making based on your preferences
        """)
        
        st.stop()  # Exit early if not authenticated

    # Only show dashboard content if we have a league selected  
    elif league_selected and st.session_state.get('league_id'):
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

# Chat message handling function
def send_chat_message(message: str, league_id: str, current_page: str):
    """Send message to HeadCoach and get streaming response"""
    if not message.strip():
        return
        
    # Add user message to chat history
    st.session_state['chat_messages'].append({
        'sender': 'user',
        'content': message.strip(),
        'timestamp': time.time()
    })
    
    try:
        # Set processing state
        st.session_state['chat_processing'] = True
        
        # Send message to chat API
        response = requests.post(f"{API_BASE}/chat", 
            json={
                "message": message,
                "leagueId": league_id,
                "userId": st.session_state.get('user_id', 'dev'),
                "currentPage": current_page
            },
            headers={'Content-Type': 'application/json'},
            stream=True,
            timeout=30
        )
        
        if response.status_code == 200:
            # Process Server-Sent Events streaming response
            agent_response = ""
            for line in response.iter_lines():
                if line:
                    line_text = line.decode('utf-8')
                    if line_text.startswith('data: '):
                        try:
                            import json
                            data_json = line_text[6:]  # Remove 'data: ' prefix
                            if data_json.strip():
                                data = json.loads(data_json)
                                if isinstance(data, dict) and 'content' in data:
                                    agent_response += data['content']
                        except json.JSONDecodeError:
                            # Handle non-JSON data (fallback)
                            chunk = line_text[6:] if line_text.startswith('data: ') else line_text
                            if chunk.strip() and chunk not in ['[DONE]', '{"status": "connected", "message": "HeadCoach is thinking..."}']:
                                agent_response += chunk
            
            # Add agent response to chat history
            if agent_response.strip():
                st.session_state['chat_messages'].append({
                    'sender': 'agent', 
                    'content': agent_response.strip(),
                    'timestamp': time.time()
                })
        else:
            # Handle error response
            st.session_state['chat_messages'].append({
                'sender': 'agent',
                'content': f'Sorry, I encountered an error processing your request. Please try again.',
                'timestamp': time.time()
            })
            
    except Exception as e:
        st.session_state['chat_messages'].append({
            'sender': 'agent',
            'content': f'Sorry, I couldn\'t process your message right now: {str(e)}',
            'timestamp': time.time()
        })
    finally:
        # Clear processing state
        st.session_state['chat_processing'] = False

# Persistent Chat Sidebar - Streamlit native implementation
def render_chat_sidebar():
    """Render chat sidebar with Streamlit components in a container"""
    
    # Create fixed chat toggle button
    st.markdown(f"""
    <div style="
        position: fixed; 
        right: 20px; 
        top: 20px; 
        z-index: 999;
        background: #10B981;
        color: white;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: all 0.2s ease;
    " onclick="document.getElementById('chat-toggle-hidden').click();" 
       onmouseover="this.style.background='#059669'"
       onmouseout="this.style.background='#10B981'">
        {'✕' if st.session_state.get('chat_expanded', False) else '💬'}
    </div>
    """, unsafe_allow_html=True)
    
    # Hidden Streamlit button for state management
    if st.button("Toggle Chat", key="chat-toggle-hidden", help="Chat with HeadCoach",
                type="primary" if not st.session_state.get('chat_expanded', False) else "secondary"):
        st.session_state['chat_expanded'] = not st.session_state.get('chat_expanded', False)
        st.rerun()
    
    # Hide the actual Streamlit button with CSS
    st.markdown("""
    <style>
        button[data-testid="stButton"][key="chat-toggle-hidden"] {
            display: none !important;
        }
    </style>
    """, unsafe_allow_html=True)
    
    # Render expanded chat interface if toggled open
    if st.session_state.get('chat_expanded', False):
        with st.container():
            st.markdown("""
            <style>
                @media (max-width: 768px) {
                    .chat-sidebar {
                        width: 100vw !important;
                        height: 100vh !important;
                    }
                }
            </style>
            <div class="chat-sidebar" style="
                position: fixed; 
                right: 0; 
                top: 0; 
                height: 100vh; 
                width: 350px; 
                background: white; 
                border-left: 1px solid #E5E7EB; 
                box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1); 
                z-index: 1000; 
                display: flex; 
                flex-direction: column;
            ">
                <div style="
                    background: #10B981; 
                    color: white; 
                    padding: 1rem; 
                    font-weight: 600;
                    border-bottom: 1px solid #E5E7EB;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                ">
                    <span>🤖 HeadCoach Assistant</span>
                    <small style="opacity: 0.8;">
                        {st.session_state.get('current_page', 'Dashboard')}
                    </small>
                </div>
            </div>
            """, unsafe_allow_html=True)
            
            # Chat messages container with fixed positioning
            messages_container = st.container()
            with messages_container:
                st.markdown('<div style="position: fixed; right: 0; top: 60px; width: 350px; height: calc(100vh - 140px); overflow-y: auto; padding: 1rem; background: #FAFAFA; z-index: 1001;">', unsafe_allow_html=True)
                
                # Display chat messages
                for message in st.session_state.get('chat_messages', []):
                    if message['sender'] == 'user':
                        st.markdown(f"""
                        <div style="
                            background: #10B981; 
                            color: white; 
                            padding: 0.75rem 1rem; 
                            border-radius: 1rem; 
                            margin: 0.5rem 0; 
                            margin-left: 20%; 
                            border-bottom-right-radius: 0.25rem;
                        ">
                            {message['content']}
                        </div>
                        """, unsafe_allow_html=True)
                    else:
                        st.markdown(f"""
                        <div style="
                            background: white; 
                            color: #374151; 
                            padding: 0.75rem 1rem; 
                            border-radius: 1rem; 
                            margin: 0.5rem 0; 
                            margin-right: 20%; 
                            border: 1px solid #E5E7EB;
                            border-bottom-left-radius: 0.25rem;
                        ">
                            {message['content']}
                        </div>
                        """, unsafe_allow_html=True)
                
                # Show typing indicator if processing
                if st.session_state.get('chat_processing', False):
                    st.markdown("""
                    <div style="
                        background: white; 
                        color: #6B7280; 
                        padding: 0.75rem 1rem; 
                        border-radius: 1rem; 
                        margin: 0.5rem 0; 
                        margin-right: 20%; 
                        border: 1px solid #E5E7EB;
                        font-style: italic;
                        animation: pulse 1.5s ease-in-out infinite;
                    ">
                        HeadCoach is thinking...
                    </div>
                    """, unsafe_allow_html=True)
                
                st.markdown('</div>', unsafe_allow_html=True)
            
            # Chat input at the bottom
            st.markdown('<div style="position: fixed; right: 0; bottom: 0; width: 350px; background: white; border-top: 1px solid #E5E7EB; padding: 1rem; z-index: 1001;">', unsafe_allow_html=True)
            
            # Chat input form
            with st.form("chat_form", clear_on_submit=True):
                user_message = st.text_area(
                    "Message HeadCoach...", 
                    placeholder="Ask about your lineup, waivers, or anything fantasy football...",
                    max_chars=500,
                    height=60,
                    key="chat_input_field",
                    disabled=st.session_state.get('chat_processing', False)
                )
                
                submitted = st.form_submit_button(
                    "Send Message" if not st.session_state.get('chat_processing', False) else "Processing...",
                    disabled=st.session_state.get('chat_processing', False),
                    use_container_width=True
                )
                
                if submitted and user_message.strip() and st.session_state.get('league_id'):
                    # Process the chat message
                    send_chat_message(
                        user_message, 
                        st.session_state.get('league_id', ''),
                        st.session_state.get('current_page', 'Dashboard')
                    )
                    st.rerun()
                elif submitted and not st.session_state.get('league_id'):
                    st.error("Please select a league first to chat with HeadCoach!")
            
            st.markdown('</div>', unsafe_allow_html=True)
    
    return None  # No HTML to return since we use Streamlit components

# Handle chat initialization

# Add welcome message if chat is empty
if len(st.session_state.get('chat_messages', [])) == 0:
    st.session_state['chat_messages'] = [{
        'sender': 'agent',
        'content': f'👋 Hi! I\'m your HeadCoach assistant. I can help you with lineup decisions, waiver wire picks, and fantasy football strategy. Currently viewing: **{st.session_state.get("current_page", "Dashboard")}**\n\nTry asking me:\n- "Should I start Player X this week?"\n- "Who should I pick up from waivers?"\n- "How does my team look?"',
        'timestamp': time.time()
    }]

# Render the persistent chat sidebar
render_chat_sidebar()

