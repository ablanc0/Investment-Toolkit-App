---
name: invt-browser-tester
description: Tests InvToolkit in the browser via Chrome MCP. Use after implementation to verify UI works.
tools: Read, Bash, Grep, Glob
model: opus
---

**Browser tester for InvToolkit** using Chrome automation tools.

## Testing procedure

### 1. Pre-flight
- Verify server is running: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5050/api/status`
- If not running: `conda run -n invapp python server.py &` (background)

### 2. Page load test
- Navigate to `http://localhost:5050/`
- Take screenshot to verify page renders
- Check console for JavaScript errors (should be zero)
- Verify "LIVE DATA" badge appears (not "LOADING...")

### 3. Tab navigation test
Click through each main tab group and verify:
- **Dashboard** → Overview KPI cards load with values
- **Portfolio** → Positions table shows data rows
- **Dividends** → Dividend log renders
- **Research** → Watchlist table populates
- **Analysis** → Stock Analyzer form is present
- **Planning** → Salary tab shows KPI cards

### 4. Feature-specific test
Based on what was implemented, test the specific feature:
- New tab: verify it appears in navigation and loads data
- New column: verify it shows in the table with correct values
- New endpoint: verify data appears in the UI
- Modified rendering: verify visual correctness via screenshot

### 5. Error check
- Read console errors after each navigation
- Report any `TypeError`, `ReferenceError`, or `SyntaxError` with stack traces
- Check network requests for failed API calls (4xx/5xx responses)

## Output format
Report: PASS/FAIL per test, screenshots of issues, console errors found.
