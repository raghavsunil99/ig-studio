#!/bin/bash
# Double-click to start IG Studio, then it opens in your browser.
cd "$(dirname "$0")"
( sleep 1.5 && open "http://127.0.0.1:8765" ) &
python3 app.py
