#!/bin/bash
# ═══════════════════════════════════════════════════════
#  InvToolkit — Launcher (macOS / Linux)
# ═══════════════════════════════════════════════════════

cd "$(dirname "$0")"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  InvToolkit — Investment Dashboard"
echo "═══════════════════════════════════════════════════════"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install it first."
    echo "   brew install python3  (macOS)"
    echo "   sudo apt install python3 python3-pip  (Linux)"
    exit 1
fi

# Check/install dependencies
if ! python3 -c "import flask" 2>/dev/null || ! python3 -c "import yfinance" 2>/dev/null; then
    echo "📦 Installing dependencies..."
    pip3 install -r requirements.txt --break-system-packages 2>/dev/null || pip3 install -r requirements.txt
    echo ""
fi

echo "🚀 Starting server on http://localhost:5050"
echo "   Press Ctrl+C to stop"
echo ""

# Open browser after short delay
(sleep 2 && open "http://localhost:5050" 2>/dev/null || xdg-open "http://localhost:5050" 2>/dev/null) &

# Start server
python3 server.py
