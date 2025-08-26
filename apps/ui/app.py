import streamlit as st
import requests
from sseclient import SSEClient  # pip install sseclient-py

API_BASE = st.secrets.get("API_BASE", "http://localhost:3000/api")

st.set_page_config(page_title="Fantasy HeadCoach", layout="wide")
st.title("🏈 Fantasy HeadCoach – Yahoo AI Assistant")

# Initialize session state
if 'user_id' not in st.session_state:
    st.session_state['user_id'] = 'dev'
if 'league_id' not in st.session_state:
    st.session_state['league_id'] = ''

# OAuth Status Section
st.subheader("🔐 Authentication Status")
col1, col2 = st.columns([2, 1])

with col1:
    try:
        oauth_status = requests.get(f"{API_BASE}/oauth/status", params={"userId": st.session_state['user_id']}, timeout=5).json()
        if oauth_status.get("hasToken"):
            st.success(f"✅ Authenticated as user: {oauth_status['userId']}")
            expires_in = oauth_status.get('expiresInSeconds', 0)
            if expires_in > 0:
                st.info(f"Token expires in {expires_in // 60} minutes")
            else:
                st.warning("Token expired - please re-authenticate")
        else:
            st.error("❌ Not authenticated with Yahoo")
    except:
        st.error("❌ Cannot connect to authentication server")

with col2:
    if st.button("🔗 Authenticate with Yahoo"):
        st.write(f"[Click here to authenticate]({API_BASE}/oauth/start?userId={st.session_state['user_id']})")

# League Selection Section
st.subheader("🏆 League Selection")

# Try to fetch available leagues
leagues_available = False
try:
    leagues_response = requests.get(f"{API_BASE}/leagues", params={"userId": st.session_state['user_id']}, timeout=5)
    if leagues_response.status_code == 200:
        leagues_data = leagues_response.json()
        leagues = leagues_data.get('leagues', [])
        if leagues:
            leagues_available = True
            league_options = {f"{league['name']} ({league['id']})": league['id'] for league in leagues}
            
            selected_league = st.selectbox(
                "Choose your league:",
                options=list(league_options.keys()),
                index=0 if league_options else None
            )
            
            if selected_league:
                st.session_state['league_id'] = league_options[selected_league]
                st.success(f"Selected league: {selected_league}")
        else:
            st.warning("No leagues found for your account")
    else:
        error_info = leagues_response.json()
        if leagues_response.status_code == 401:
            st.error("❌ Please authenticate with Yahoo first using the button above")
        else:
            st.error(f"Error fetching leagues: {error_info.get('message', 'Unknown error')}")
except Exception as e:
    st.error(f"Cannot connect to server: {str(e)}")

# Manual league ID input as fallback
if not leagues_available:
    st.info("💡 You can also manually enter your league ID if you know it")
    league_id = st.text_input("League ID", value=st.session_state.get("league_id", ""), help="Find your league ID in your Yahoo Fantasy URL")
    if league_id:
        st.session_state["league_id"] = league_id

# Only show tools if we have a league selected
if st.session_state.get('league_id'):
    st.divider()
    st.subheader(f"🛠️ Fantasy Tools for League: {st.session_state['league_id']}")

    col1, col2, col3 = st.columns(3)
    with col1:
        if st.button("📈 Daily Report"):
            st.write("Running daily report...")
            try:
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

    with col2:
        if st.button("📋 Check Lineup"):
            try:
                r = requests.post(f"{API_BASE}/lineup/check", json={"leagueId": st.session_state['league_id']})
                if r.ok:
                    st.success("Lineup check complete!")
                    st.json(r.json())
                else:
                    st.error(f"Error: {r.status_code}")
            except Exception as e:
                st.error(f"Error checking lineup: {e}")

    with col3:
        if st.button("🔄 Run Waivers"):
            try:
                r = requests.post(f"{API_BASE}/waivers/run", json={"leagueId": st.session_state['league_id']})
                if r.ok:
                    st.success("Waiver analysis complete!")
                    st.json(r.json())
                else:
                    st.error(f"Error: {r.status_code}")
            except Exception as e:
                st.error(f"Error running waivers: {e}")

    # Approvals Section
    st.divider()
    st.subheader("⚖️ Pending Approvals")
    
    try:
        r = requests.get(f"{API_BASE}/approvals/pending", params={"leagueId": st.session_state['league_id']})
        if r.ok:
            pending = r.json().get("pending", [])
            if pending:
                for p in pending:
                    confidence_pct = p.get('confidence', 0) * 100 if isinstance(p.get('confidence'), (int, float)) else 0
                    with st.expander(f"🎯 {p.get('summary', 'Recommendation')} (Confidence: {confidence_pct:.0f}%)"):
                        st.json(p)
                        c1, c2 = st.columns(2)
                        if c1.button(f"✅ Approve", key=f"a{p.get('id', 'unknown')}"):
                            approve_r = requests.post(f"{API_BASE}/approvals/approve", json={"id": p.get("id")})
                            if approve_r.ok:
                                st.success("Approved!")
                                st.rerun()
                            else:
                                st.error("Approval failed")
                        if c2.button(f"❌ Reject", key=f"r{p.get('id', 'unknown')}"):
                            reject_r = requests.post(f"{API_BASE}/approvals/reject", json={"id": p.get("id")})
                            if reject_r.ok:
                                st.success("Rejected!")
                                st.rerun()
                            else:
                                st.error("Rejection failed")
            else:
                st.info("No pending recommendations. Great job managing your team! 🎉")
        else:
            st.warning("Could not fetch pending approvals")
    except Exception as e:
        st.error(f"Error fetching approvals: {e}")

else:
    st.info("👆 Please select a league above to access the fantasy tools")
