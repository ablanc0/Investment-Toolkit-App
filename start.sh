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

# Activate conda environment
CONDA_BASE="${CONDA_PREFIX:-$HOME/miniconda3}"
if [ -f "$CONDA_BASE/etc/profile.d/conda.sh" ]; then
    source "$CONDA_BASE/etc/profile.d/conda.sh"
    conda activate invapp 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "⚠️  Conda env 'invapp' not found. Creating it..."
        conda create -n invapp python=3.13 -y
        conda activate invapp
        pip install -r requirements.txt
    fi
    echo "🐍 Using conda env: invapp ($(python --version))"
else
    # Fallback: check system Python
    if ! command -v python3 &> /dev/null; then
        echo "❌ Python 3 not found. Please install conda or Python 3."
        exit 1
    fi
    if ! python3 -c "import flask" 2>/dev/null || ! python3 -c "import yfinance" 2>/dev/null; then
        echo "📦 Installing dependencies..."
        pip3 install -r requirements.txt --break-system-packages 2>/dev/null || pip3 install -r requirements.txt
    fi
fi

echo "🚀 Starting server on http://localhost:5050"
echo "   Press Ctrl+C to stop"
echo ""

# Open browser after short delay
(sleep 2 && open "http://localhost:5050" 2>/dev/null || xdg-open "http://localhost:5050" 2>/dev/null) &

# Start server
python server.py 2>/dev/null || python3 server.py
