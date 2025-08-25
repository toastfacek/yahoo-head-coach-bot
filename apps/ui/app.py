import streamlit as st
import requests
from sseclient import SSEClient  # pip install sseclient-py

API_BASE = st.secrets.get("API_BASE", "http://localhost:3000/api")

st.set_page_config(page_title="Fantasy HeadCoach", layout="wide")
st.title("Fantasy HeadCoach – Yahoo (PRD-driven)")

league_id = st.text_input("League ID", value=st.session_state.get("league_id", ""))
if league_id:
    st.session_state["league_id"] = league_id

col1, col2, col3 = st.columns(3)
with col1:
    if st.button("Run Daily Report"):
        st.write("Running…")
        # Stream tokens as they arrive
        messages = SSEClient(f"{API_BASE}/reports/daily?leagueId={league_id}")
        placeholder = st.empty()
        buf = ""
        for ev in messages.events():
            if ev.data:
                buf += ev.data
                placeholder.markdown(buf)

with col2:
    if st.button("Check Lineup"):
        r = requests.post(f"{API_BASE}/lineup/check", json={"leagueId": league_id})
        st.json(r.json())

with col3:
    if st.button("Run Waivers"):
        r = requests.post(f"{API_BASE}/waivers/run", json={"leagueId": league_id})
        st.json(r.json())

st.subheader("Approvals")
# fetch staged actions
r = requests.get(f"{API_BASE}/approvals/pending", params={"leagueId": league_id})
if r.ok:
    pending = r.json().get("pending", [])
    for p in pending:
        with st.expander(f"{p['id']} — {p['summary']} (conf {p['confidence']*100:.0f}%)"):
            st.json(p)
            c1, c2 = st.columns(2)
            if c1.button(f"Approve {p['id']}", key=f"a{p['id']}"):
                requests.post(f"{API_BASE}/approvals/approve", json={"id": p["id"]})
                st.rerun()
            if c2.button(f"Reject {p['id']}", key=f"r{p['id']}"):
                requests.post(f"{API_BASE}/approvals/reject", json={"id": p["id"]})
                st.rerun()
