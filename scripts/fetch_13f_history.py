#!/usr/bin/env python3
"""
One-time script to pull ALL historical 13F filings for super investors from SEC EDGAR.
Outputs 13f_history.json and cusip_ticker_map.json in DATA_DIR.

Usage:
    conda activate invapp
    python scripts/fetch_13f_history.py

Resumable — skips investors/quarters already in 13f_history.json.
"""

import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

import requests

# ── Configuration ───────────────────────────────────────────────────────

EDGAR_USER_AGENT = "InvToolkit alejandro@example.com"

# Data directory — same as server.py
DATA_DIR = Path.home() / "Library/CloudStorage/GoogleDrive-ale.blancoglez91@gmail.com/My Drive/Investments/portfolio-app"
HISTORY_FILE = DATA_DIR / "13f_history.json"
CUSIP_MAP_FILE = DATA_DIR / "cusip_ticker_map.json"

SUPER_INVESTORS = {
    "Warren Buffett":       {"cik": "0001067983", "fund": "Berkshire Hathaway"},
    "Michael Burry":        {"cik": "0001649339", "fund": "Scion Asset Management"},
    "Bill Ackman":          {"cik": "0001336528", "fund": "Pershing Square"},
    "Ray Dalio":            {"cik": "0001350694", "fund": "Bridgewater Associates"},
    "Seth Klarman":         {"cik": "0001061768", "fund": "Baupost Group"},
    "David Tepper":         {"cik": "0001656456", "fund": "Appaloosa Management"},
    "Howard Marks":         {"cik": "0000949509", "fund": "Oaktree Capital Management"},
    "Terry Smith":          {"cik": "0001569205", "fund": "Fundsmith LLP"},
    "Li Lu":                {"cik": "0001709323", "fund": "Himalaya Capital"},
    "Chris Hohn":           {"cik": "0001647251", "fund": "TCI Fund Management"},
    "Stanley Druckenmiller": {"cik": "0001536411", "fund": "Duquesne Family Office"},
    "Dev Kantesaria":       {"cik": "0001697868", "fund": "Valley Forge Capital"},
    "Pat Dorsey":           {"cik": "0001671657", "fund": "Dorsey Asset Management"},
    "Mohnish Pabrai":       {"cik": "0001549575", "fund": "Dalal Street"},
    "Joel Greenblatt":      {"cik": "0001510387", "fund": "Gotham Asset Management"},
    "Peter Brown":          {"cik": "0001037389", "fund": "Renaissance Technologies"},
    "Chuck Akre":           {"cik": "0001112520", "fund": "Akre Capital Management"},
    "Paul Tudor Jones":     {"cik": "0000923093", "fund": "Tudor Investment Corp"},
    "George Soros":         {"cik": "0001029160", "fund": "Soros Fund Management"},
    "Chris Davis":          {"cik": "0001036325", "fund": "Davis Selected Advisers"},
    "Chase Coleman":        {"cik": "0001167483", "fund": "Tiger Global Management"},
    "Dan Loeb":             {"cik": "0001040273", "fund": "Third Point"},
}

session = requests.Session()
session.headers.update({"User-Agent": EDGAR_USER_AGENT})


# ── SEC EDGAR Functions ─────────────────────────────────────────────────

def sec_get(url):
    """GET with rate limiting (10 req/sec max)."""
    time.sleep(0.15)
    r = session.get(url, timeout=30)
    r.raise_for_status()
    return r


def fetch_all_13f_filings(cik):
    """Get ALL 13F-HR filing accessions and dates for a CIK."""
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    data = sec_get(url).json()

    filings_list = []

    # Process recent filings
    recent = data.get("filings", {}).get("recent", {})
    _extract_13f(recent, filings_list)

    # Process historical filing batches
    for file_info in data.get("filings", {}).get("files", []):
        batch_url = f"https://data.sec.gov/submissions/{file_info['name']}"
        batch = sec_get(batch_url).json()
        _extract_13f(batch, filings_list)

    return filings_list


def _extract_13f(batch, out_list):
    """Extract 13F-HR filings from a submissions batch."""
    forms = batch.get("form", [])
    accessions = batch.get("accessionNumber", [])
    dates = batch.get("filingDate", [])
    for i, form in enumerate(forms):
        if form in ("13F-HR", "13F-HR/A"):
            acc_raw = accessions[i]
            acc_clean = acc_raw.replace("-", "")
            out_list.append({
                "accession": acc_raw,
                "accessionClean": acc_clean,
                "filingDate": dates[i],
            })


def fetch_infotable_xml(cik, accession_clean):
    """Download the infoTable XML from a 13F filing."""
    cik_num = cik.lstrip("0")
    index_url = f"https://www.sec.gov/Archives/edgar/data/{cik_num}/{accession_clean}/"
    r = sec_get(index_url)
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
    r2 = sec_get(xml_url)
    return r2.text


def parse_13f_xml(xml_string):
    """Parse 13F infoTable XML into holdings list. Aggregates by CUSIP.
    Values are normalized to actual dollars (some filers report in thousands per SEC spec,
    others in dollars — we auto-detect via median per-share price)."""
    ns = {"ns": "http://www.sec.gov/edgar/document/thirteenf/informationtable"}
    try:
        root = ET.fromstring(xml_string)
    except ET.ParseError:
        return []
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


def derive_quarter(filing_date):
    """Derive the reporting quarter from the filing date."""
    try:
        dt = datetime.strptime(filing_date, "%Y-%m-%d")
        month, year = dt.month, dt.year
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
    except Exception:
        return ""


# ── OpenFIGI CUSIP Resolution ──────────────────────────────────────────

def load_cusip_map():
    """Load persisted CUSIP→ticker map."""
    if CUSIP_MAP_FILE.exists():
        return json.loads(CUSIP_MAP_FILE.read_text())
    return {}


def save_cusip_map(cusip_map):
    """Save CUSIP→ticker map to disk."""
    CUSIP_MAP_FILE.write_text(json.dumps(cusip_map, indent=2))


def resolve_cusips(cusip_list, cusip_map):
    """Resolve unknown CUSIPs via OpenFIGI. Updates cusip_map in place."""
    unknown = [c for c in cusip_list if c and c not in cusip_map]
    if not unknown:
        return

    print(f"    Resolving {len(unknown)} new CUSIPs via OpenFIGI...")
    batch_count = 0

    for i in range(0, len(unknown), 10):
        batch = unknown[i:i+10]
        body = [{"idType": "ID_CUSIP", "idValue": c} for c in batch]
        for attempt in range(3):
            try:
                r = session.post(
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
                            cusip_map[batch[j]] = chosen.get("ticker", "")
                    break
                elif r.status_code == 429:
                    print(f"    Rate limited, waiting 30s...")
                    time.sleep(30)
                else:
                    break
            except Exception as e:
                print(f"    OpenFIGI error: {e}")
                break
        batch_count += 1
        if batch_count % 20 == 0:
            time.sleep(30)

    # Retry unresolved CINS codes (international CUSIPs starting with letter)
    unresolved_cins = [c for c in unknown if c not in cusip_map and c[0:1].isalpha()]
    if unresolved_cins:
        print(f"    Retrying {len(unresolved_cins)} CINS codes...")
        for i in range(0, len(unresolved_cins), 10):
            batch = unresolved_cins[i:i+10]
            body = [{"idType": "ID_CINS", "idValue": c} for c in batch]
            for attempt in range(3):
                try:
                    r = session.post(
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
                                cusip_map[batch[j]] = chosen.get("ticker", "")
                        break
                    elif r.status_code == 429:
                        time.sleep(30)
                    else:
                        break
                except Exception:
                    break
            batch_count += 1
            if batch_count % 20 == 0:
                time.sleep(30)


# ── Main Pipeline ───────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  13F Historical Data Pull — All Investors, All Quarters")
    print("=" * 60)

    # Load existing data for resumability
    history = {}
    if HISTORY_FILE.exists():
        history = json.loads(HISTORY_FILE.read_text())
        print(f"Loaded existing history: {len(history)} investors")

    cusip_map = load_cusip_map()
    print(f"Loaded CUSIP map: {len(cusip_map)} entries")
    print()

    investors = list(SUPER_INVESTORS.items())
    for idx, (name, info) in enumerate(investors, 1):
        cik = info["cik"]
        fund = info["fund"]
        print(f"[{idx}/{len(investors)}] {name} — {fund} (CIK {cik})")

        # Get existing quarters for this investor
        existing_quarters = set()
        if name in history:
            existing_quarters = {q["quarter"] for q in history[name].get("quarters", [])}

        # Fetch all 13F filings
        try:
            filings = fetch_all_13f_filings(cik)
        except Exception as e:
            print(f"  ERROR fetching filings list: {e}")
            continue

        print(f"  Found {len(filings)} 13F filings")

        if name not in history:
            history[name] = {"fund": fund, "cik": cik, "quarters": []}

        new_quarters = 0
        errors = 0

        for fi, filing in enumerate(filings):
            quarter = derive_quarter(filing["filingDate"])
            if not quarter:
                continue

            # Skip if already have this quarter
            if quarter in existing_quarters:
                continue

            try:
                xml = fetch_infotable_xml(cik, filing["accessionClean"])
                if not xml:
                    print(f"  {quarter}: no XML found, skipping")
                    errors += 1
                    continue

                holdings = parse_13f_xml(xml)
                if not holdings:
                    print(f"  {quarter}: no holdings parsed, skipping")
                    errors += 1
                    continue

                # Collect CUSIPs for batch resolution later
                all_cusips = [h["cusip"] for h in holdings if h.get("cusip")]
                resolve_cusips(all_cusips, cusip_map)

                # Apply ticker map
                for h in holdings:
                    h["ticker"] = cusip_map.get(h["cusip"], h["cusip"])

                # Sort and compute percentages
                holdings.sort(key=lambda h: h["value"], reverse=True)
                total_value = sum(h["value"] for h in holdings)
                for h in holdings:
                    h["pctPortfolio"] = round(h["value"] / total_value * 100, 2) if total_value else 0

                top10pct = round(sum(h["pctPortfolio"] for h in holdings[:10]), 1)

                quarter_data = {
                    "quarter": quarter,
                    "filingDate": filing["filingDate"],
                    "totalValue": total_value,
                    "holdingsCount": len(holdings),
                    "top10pct": top10pct,
                    "holdings": holdings,
                }
                history[name]["quarters"].append(quarter_data)
                existing_quarters.add(quarter)
                new_quarters += 1
                print(f"  {quarter} ({filing['filingDate']}): {len(holdings)} holdings, ${total_value/1e9:.1f}B")

            except Exception as e:
                print(f"  {quarter}: ERROR — {e}")
                errors += 1

        # Sort quarters chronologically (most recent first)
        history[name]["quarters"].sort(
            key=lambda q: q.get("filingDate", ""), reverse=True
        )

        print(f"  Done: {new_quarters} new quarters, {errors} errors, {len(history[name]['quarters'])} total")

        # Save after each investor (crash resilience)
        HISTORY_FILE.write_text(json.dumps(history, default=str))
        save_cusip_map(cusip_map)
        print()

    # Final stats
    print("=" * 60)
    total_quarters = sum(len(h["quarters"]) for h in history.values())
    print(f"Complete: {len(history)} investors, {total_quarters} total quarters")
    print(f"CUSIP map: {len(cusip_map)} entries")
    print(f"History file: {HISTORY_FILE}")
    print(f"CUSIP map file: {CUSIP_MAP_FILE}")


if __name__ == "__main__":
    main()
