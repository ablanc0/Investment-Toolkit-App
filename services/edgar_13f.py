"""
InvToolkit — SEC EDGAR 13F super-investor holdings pipeline.
Fetches, parses, and persists quarterly 13F filings for tracked investors.
"""

import json
import re
import time
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime

import requests as http_requests

from config import SUPER_INVESTORS, EDGAR_USER_AGENT, _13F_HISTORY_FILE

_13f_history = {}  # investor_key -> {fund, cik, quarters: [{quarter, filingDate, totalValue, ...}]}
_13f_progress = {"done": 0, "total": 0, "current": "", "results": {}, "running": False}
_cusip_ticker_cache = {}  # CUSIP -> ticker, shared across investors to avoid redundant OpenFIGI calls


def _load_13f_history():
    """Load historical 13F data from disk on startup.
    Mutates dict in-place so cross-module imports see the loaded data."""
    global _13f_history
    if _13F_HISTORY_FILE.exists():
        try:
            data = json.loads(_13F_HISTORY_FILE.read_text())
            _13f_history.clear()
            _13f_history.update(data)
            # Migrate renamed keys (one-time)
            _RENAMED_KEYS = {"Warren Buffett": "Greg Abel"}
            for old, new in _RENAMED_KEYS.items():
                if old in _13f_history and new not in _13f_history:
                    _13f_history[new] = _13f_history.pop(old)
            _sanitize_13f_history()
            total_q = sum(len(h.get("quarters", [])) for h in _13f_history.values())
            print(f"[13F] Loaded history: {len(_13f_history)} investors, {total_q} quarters")
        except Exception:
            _13f_history.clear()


def _sanitize_13f_history():
    """Clean up known data quality issues in historical 13F data on load."""
    dirty = False
    for key, hist in _13f_history.items():
        quarters = hist.get("quarters", [])
        if len(quarters) < 3:
            continue
        # Compute median holdings count and totalValue for this investor
        counts = sorted([q.get("holdingsCount", 0) for q in quarters if q.get("holdingsCount", 0) > 0])
        values = sorted([q.get("totalValue", 0) for q in quarters if q.get("totalValue", 0) > 0])
        if not counts or not values:
            continue
        median_count = counts[len(counts) // 2]
        median_value = values[len(values) // 2]
        # Remove quarters that are clearly amendment filings (< 10% of median holdings
        # when median is at least 10) or have wildly wrong values (>100x median)
        count_threshold = max(4, int(median_count * 0.1))
        original_len = len(quarters)
        quarters[:] = [q for q in quarters
                       if not (q.get("holdingsCount", 0) <= count_threshold and median_count >= 10)
                       and not (q.get("totalValue", 0) > median_value * 100)]
        removed = original_len - len(quarters)
        if removed:
            print(f"[13F] Sanitized {key}: removed {removed} bad quarter(s)")
            dirty = True
    if dirty:
        _save_13f_history()


def _get_latest_quarter(investor_key):
    """Return the latest quarter data for an investor from history, or None."""
    hist = _13f_history.get(investor_key)
    if not hist or not hist.get("quarters"):
        return None
    q = hist["quarters"][0]
    inv = SUPER_INVESTORS.get(investor_key, {})
    return {
        "investor": investor_key, "fund": inv.get("fund", ""), "note": inv.get("note", ""),
        "filingDate": q.get("filingDate", ""), "quarter": q.get("quarter", ""),
        "holdings": q.get("holdings", []), "totalValue": q.get("totalValue", 0),
        "holdingsCount": q.get("holdingsCount", 0), "top10pct": q.get("top10pct", 0),
    }


def _get_current_quarter_label():
    """Determine the most common latest quarter across all investors (e.g. 'Q4 2025')."""
    labels = []
    for key in SUPER_INVESTORS:
        hist = _13f_history.get(key)
        if hist and hist.get("quarters"):
            labels.append(hist["quarters"][0].get("quarter", ""))
    if not labels:
        return None
    return Counter(labels).most_common(1)[0][0]


def _save_13f_history():
    """Persist historical 13F data to disk."""
    try:
        _13F_HISTORY_FILE.write_text(json.dumps(_13f_history, default=str))
    except Exception as e:
        print(f"[13F] Failed to save history: {e}")


def _append_to_history(investor_key, result):
    """Append a quarter to history, or update it if the new filing has more holdings."""
    quarter = result.get("quarter", "")
    if not quarter:
        return
    inv = SUPER_INVESTORS.get(investor_key, {})
    if investor_key not in _13f_history:
        _13f_history[investor_key] = {"fund": inv.get("fund", ""), "cik": inv.get("cik", ""), "quarters": []}
    new_entry = {
        "quarter": quarter,
        "filingDate": result.get("filingDate", ""),
        "totalValue": result.get("totalValue", 0),
        "holdingsCount": result.get("holdingsCount", 0),
        "top10pct": result.get("top10pct", 0),
        "holdings": result.get("holdings", []),
    }
    # Check if quarter already exists
    for i, q in enumerate(_13f_history[investor_key]["quarters"]):
        if q["quarter"] == quarter:
            # Update if new data has more holdings (better filing replaces amendment)
            if result.get("holdingsCount", 0) > q.get("holdingsCount", 0):
                _13f_history[investor_key]["quarters"][i] = new_entry
                print(f"[13F] Updated {investor_key} {quarter}: {q.get('holdingsCount', 0)} → {result.get('holdingsCount', 0)} holdings")
            return
    _13f_history[investor_key]["quarters"].insert(0, new_entry)


def _edgar_request(url, timeout=15):
    """HTTP GET to SEC EDGAR with retry and rate-limit compliance."""
    for attempt in range(3):
        try:
            time.sleep(0.15)  # SEC fair access: max 10 req/sec
            r = http_requests.get(url, headers={"User-Agent": EDGAR_USER_AGENT}, timeout=timeout)
            if r.status_code == 429:
                time.sleep(10)
                continue
            r.raise_for_status()
            return r
        except http_requests.exceptions.RequestException:
            if attempt == 2:
                raise
            time.sleep(2)
    return None


def _fetch_13f_latest(cik):
    """Get the most recent 13F-HR filing accession number and date.
    Uses reportDate (period of report) for accurate quarter derivation,
    falling back to filingDate if reportDate is unavailable."""
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    r = _edgar_request(url)
    data = r.json()
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    dates = recent.get("filingDate", [])
    report_dates = recent.get("reportDate", [])
    # Prefer original 13F-HR over amendments; take the first (most recent) of each
    original_idx = None
    amendment_idx = None
    for i, form in enumerate(forms):
        if form == "13F-HR" and original_idx is None:
            original_idx = i
            break  # originals are what we want
        elif form == "13F-HR/A" and amendment_idx is None:
            amendment_idx = i
    idx = original_idx if original_idx is not None else amendment_idx
    if idx is None:
        return None
    acc = accessions[idx].replace("-", "")
    report_date = report_dates[idx] if idx < len(report_dates) else ""
    return {
        "accession": accessions[idx], "accessionClean": acc,
        "filingDate": dates[idx],
        "reportDate": report_date,  # actual quarter-end date (e.g. 2025-12-31)
    }


def _fetch_13f_infotable(cik, accession_clean, accession_raw):
    """Download the infoTable XML from a 13F filing."""
    cik_num = cik.lstrip("0")
    index_url = f"https://www.sec.gov/Archives/edgar/data/{cik_num}/{accession_clean}/"
    r = _edgar_request(index_url)
    if not r:
        return None
    # Find XML filename — prefer infotable or holding files, skip primary_doc.xml
    matches = re.findall(r'href="([^"]*(?:infotable|holding)[^"]*\.xml)"', r.text, re.IGNORECASE)
    if not matches:
        all_xml = re.findall(r'href="([^"]*\.xml)"', r.text, re.IGNORECASE)
        matches = [x for x in all_xml if "primary_doc" not in x.lower()]
        if not matches:
            matches = all_xml
    if not matches:
        return None
    xml_filename = matches[0]
    if xml_filename.startswith("http"):
        xml_url = xml_filename
    elif xml_filename.startswith("/"):
        xml_url = f"https://www.sec.gov{xml_filename}"
    else:
        xml_url = f"https://www.sec.gov/Archives/edgar/data/{cik_num}/{accession_clean}/{xml_filename}"
    r2 = _edgar_request(xml_url, timeout=30)
    if not r2:
        return None
    return r2.text


def _parse_13f_xml(xml_string):
    """Parse 13F infoTable XML into holdings list. Aggregates by CUSIP.
    Values are normalized to actual dollars (some filers report in thousands per SEC spec,
    others in dollars — we auto-detect via median per-share price)."""
    ns = {"ns": "http://www.sec.gov/edgar/document/thirteenf/informationtable"}
    root = ET.fromstring(xml_string)
    by_cusip = {}
    for entry in root.findall(".//ns:infoTable", ns):
        cusip = (entry.findtext("ns:cusip", "", ns) or "").strip()
        name = (entry.findtext("ns:nameOfIssuer", "", ns) or "").strip()
        value = int(entry.findtext("ns:value", "0", ns) or 0)
        shares_el = entry.find("ns:shrsOrPrnAmt", ns)
        shares = int(shares_el.findtext("ns:sshPrnamt", "0", ns) or 0) if shares_el else 0
        put_call = (entry.findtext("ns:putCall", "", ns) or "").strip()
        if cusip in by_cusip:
            by_cusip[cusip]["value"] += value
            by_cusip[cusip]["shares"] += shares
        else:
            by_cusip[cusip] = {
                "cusip": cusip, "name": name, "value": value,
                "shares": shares, "putCall": put_call,
            }
    holdings = list(by_cusip.values())
    # Auto-detect: SEC 13F values should be in thousands, but some filers report in dollars.
    # Compute median per-share price; if < $1, values are in thousands → multiply by 1000.
    prices = sorted([h["value"] / h["shares"] for h in holdings if h["shares"] > 0])
    if prices:
        median_price = prices[len(prices) // 2]
        if median_price < 1.0:
            for h in holdings:
                h["value"] *= 1000
    return holdings


def _openfigi_batch(cusip_list, id_type="ID_CUSIP"):
    """Resolve a list of CUSIPs/CINS via OpenFIGI with rate limiting. Returns {cusip: ticker}."""
    ticker_map = {}
    batch_count = 0
    for i in range(0, len(cusip_list), 10):
        batch = cusip_list[i:i+10]
        body = [{"idType": id_type, "idValue": c} for c in batch]
        for attempt in range(3):
            try:
                r = http_requests.post(
                    "https://api.openfigi.com/v3/mapping",
                    json=body,
                    headers={"Content-Type": "application/json"},
                    timeout=30,
                )
                if r.status_code == 200:
                    results = r.json()
                    for j, item in enumerate(results):
                        if isinstance(item, dict) and "data" in item and item["data"]:
                            entries = item["data"]
                            us_entry = next((e for e in entries if e.get("exchCode") == "US"), None)
                            chosen = us_entry or entries[0]
                            ticker_map[batch[j]] = chosen.get("ticker", "")
                    break
                elif r.status_code == 429:
                    time.sleep(30)  # wait for rate limit reset
                else:
                    break
            except Exception:
                break
        batch_count += 1
        # Rate limit: 25 req/min for unauthenticated. Pause every 20 batches.
        if batch_count % 20 == 0:
            time.sleep(30)
    return ticker_map


def _resolve_cusips_to_tickers(holdings):
    """Batch resolve CUSIPs to tickers via OpenFIGI (free, no key, 10/batch, 25 req/min).
    Uses module-level _cusip_ticker_cache to avoid redundant API calls across investors."""
    global _cusip_ticker_cache
    cusips = list(dict.fromkeys(h["cusip"] for h in holdings if h.get("cusip")))
    if not cusips:
        return holdings
    # Check cache first — only resolve unknown CUSIPs
    uncached = [c for c in cusips if c not in _cusip_ticker_cache]
    if uncached:
        ticker_map = _openfigi_batch(uncached, "ID_CUSIP")
        # Retry unresolved international CUSIPs (CINS codes starting with letter)
        unresolved_cins = [c for c in uncached if c not in ticker_map and c[0:1].isalpha()]
        if unresolved_cins:
            cins_map = _openfigi_batch(unresolved_cins, "ID_CINS")
            ticker_map.update(cins_map)
        _cusip_ticker_cache.update(ticker_map)
        print(f"[13F] CUSIP cache: {len(_cusip_ticker_cache)} total, {len(uncached)} resolved this batch")
    for h in holdings:
        h["ticker"] = _cusip_ticker_cache.get(h["cusip"], h["cusip"])
    return holdings


def _fetch_investor_13f(investor_key):
    """Full 13F pipeline for one investor. Returns dict with holdings."""
    inv = SUPER_INVESTORS.get(investor_key)
    if not inv:
        return None
    cik = inv["cik"]
    # Step 1: Find latest 13F filing
    filing = _fetch_13f_latest(cik)
    if not filing:
        return {"investor": investor_key, "fund": inv["fund"], "error": "No 13F filing found"}
    # Step 2: Download infoTable XML
    xml = _fetch_13f_infotable(cik, filing["accessionClean"], filing["accession"])
    if not xml:
        return {"investor": investor_key, "fund": inv["fund"], "error": "Could not fetch infoTable XML"}
    # Step 3: Parse holdings
    holdings = _parse_13f_xml(xml)
    # Step 4: Resolve CUSIPs to tickers
    holdings = _resolve_cusips_to_tickers(holdings)
    # Sort by value descending
    holdings.sort(key=lambda h: h["value"], reverse=True)
    total_value = sum(h["value"] for h in holdings)
    # Add portfolio percentage
    for h in holdings:
        h["pctPortfolio"] = round(h["value"] / total_value * 100, 2) if total_value else 0
    # Derive quarter from reportDate (actual period-end), falling back to filingDate
    quarter = _derive_quarter(filing.get("reportDate", ""), filing["filingDate"])
    top10pct = round(sum(h["pctPortfolio"] for h in holdings[:10]), 1)
    result = {
        "investor": investor_key,
        "fund": inv["fund"],
        "note": inv.get("note", ""),
        "filingDate": filing["filingDate"],
        "quarter": quarter,
        "holdings": holdings,
        "totalValue": total_value,
        "holdingsCount": len(holdings),
        "top10pct": top10pct,
        "fetchedAt": datetime.now().isoformat(),
    }
    _append_to_history(investor_key, result)
    _save_13f_history()
    return result


def _derive_quarter(report_date, filing_date=""):
    """Derive the reporting quarter from reportDate (period of report).
    Falls back to filing date heuristic if reportDate is unavailable."""
    # Prefer reportDate — it's the actual quarter-end (e.g. 2025-12-31 → Q4 2025)
    if report_date:
        try:
            dt = datetime.strptime(report_date, "%Y-%m-%d")
            month = dt.month
            year = dt.year
            if month <= 3:
                return f"Q1 {year}"
            elif month <= 6:
                return f"Q2 {year}"
            elif month <= 9:
                return f"Q3 {year}"
            else:
                return f"Q4 {year}"
        except (ValueError, TypeError):
            pass
    # Fallback: derive from filing date (filings are ~45 days after quarter end)
    if filing_date:
        try:
            dt = datetime.strptime(filing_date, "%Y-%m-%d")
            month = dt.month
            year = dt.year
            if month <= 2:
                return f"Q4 {year - 1}"
            elif month <= 5:
                return f"Q1 {year}"
            elif month <= 8:
                return f"Q2 {year}"
            elif month <= 11:
                return f"Q3 {year}"
            else:
                return f"Q4 {year}"
        except (ValueError, TypeError):
            pass
    return ""
