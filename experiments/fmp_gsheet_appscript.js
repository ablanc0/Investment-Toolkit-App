/**
 * FMP Stock Analyzer — Google Apps Script
 *
 * Fetches financial data from FMP API and populates the Stock Analyzer sheet.
 * 6 API calls per refresh, 5 years of data + company profile.
 *
 * Setup:
 *   1. In your Google Sheet: Extensions → Apps Script
 *   2. Delete any existing code, paste this entire file
 *   3. Click Save (Ctrl+S), then close the Apps Script editor
 *   4. Reload the Google Sheet — "FMP Tools" menu will appear
 *
 * Usage:
 *   1. Enter a ticker in cell A2 of the "Stock Analyzer" sheet
 *   2. Click FMP Tools → Refresh Stock Data
 *   3. Wait ~10 seconds — all data will populate
 *
 * API: 6 calls per refresh × 250/day free tier = ~41 refreshes/day
 */

// ─── Configuration ──────────────────────────────────────────────────────────
const FMP_KEY    = "Yt3XCJh6dH3GNabskOSVMpQqKBzbSh70";
const FMP_BASE   = "https://financialmodelingprep.com/stable";
const SHEET_NAME = "Stock Analyzer";

// ─── Menu ───────────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("FMP Tools")
    .addItem("Refresh Stock Data", "refreshStockData")
    .addToUi();
}

// ─── Main entry point ───────────────────────────────────────────────────────
function refreshStockData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { SpreadsheetApp.getUi().alert("Sheet '" + SHEET_NAME + "' not found"); return; }

  var ticker = String(sh.getRange("A2").getValue()).trim().toUpperCase();
  if (!ticker) { SpreadsheetApp.getUi().alert("Enter a ticker in cell A2"); return; }

  ss.toast("Fetching data for " + ticker + "…", "FMP", -1);

  // ── Fetch 6 endpoints (6 API calls) ──
  var profile  = fmpFetch("profile", ticker);
  var income   = fmpFetch("income-statement", ticker);
  var cashflow = fmpFetch("cash-flow-statement", ticker);
  var balance  = fmpFetch("balance-sheet-statement", ticker);
  var metrics  = fmpFetch("key-metrics", ticker);
  var ratios   = fmpFetch("ratios", ticker);

  if (!income.length) {
    SpreadsheetApp.getUi().alert("No data found for " + ticker);
    return;
  }

  // ── Company Profile → directly to display cells ──
  var prof = profile.length ? profile[0] : {};
  sh.getRange("C2").setValue(prof.companyName || "");   // Company Name
  sh.getRange("E2").setValue(prof.sector || "");        // Sector
  sh.getRange("H4").setValue(prof.beta || "");          // Beta

  // ── Redirect K18 WACC: was =AC95 (old FMP profile), now computed from CAPM ──
  // WACC = Equity Weight × Cost of Equity + Debt Weight × Cost of Debt
  sh.getRange("K18").setFormula("=H16*H10+I16*I10");

  // ── Clear old broken FMP add-on formulas ──
  ["A94", "A98", "A106", "A114"].forEach(function(cell) {
    sh.getRange(cell).setValue("");
  });

  // Sort most-recent first
  [income, cashflow, balance, metrics, ratios].forEach(function(arr) {
    arr.sort(function(a, b) { return b.date.localeCompare(a.date); });
  });

  var n = Math.min(income.length, 5);

  // ── Build row arrays (oldest → newest, matching columns X → AB) ──
  // API index 0 = newest, n-1 = oldest
  // Column index 0 = oldest (X=col24), n-1 = newest (AB=col28)

  function buildRow(data, field, transform) {
    var row = [];
    for (var col = 0; col < n; col++) {
      var apiIdx = n - 1 - col;
      var val = (apiIdx < data.length && data[apiIdx]) ? data[apiIdx][field] : null;
      if (val === undefined) val = null;
      if (transform && val !== null) val = transform(val);
      row.push(val !== null ? val : "");
    }
    return row;
  }

  // Year headers
  var yearRow = buildRow(income, "date", function(d) { return parseInt(d.substring(0, 4)); });

  // From income-statement
  var revRow    = buildRow(income, "revenue");
  var epsRow    = buildRow(income, "epsDiluted");
  var sharesRow = buildRow(income, "weightedAverageShsOut");
  var ebitRow   = buildRow(income, "operatingIncome");

  // From cash-flow-statement
  var fcfRow    = buildRow(cashflow, "freeCashFlow");
  var divPdRow  = buildRow(cashflow, "netDividendsPaid", function(v) { return Math.abs(v || 0); });

  // From balance-sheet-statement
  var ndRow     = buildRow(balance, "netDebt");
  var debtRow   = buildRow(balance, "totalDebt");
  var eqRow     = buildRow(balance, "totalStockholdersEquity");
  var cashRow   = buildRow(balance, "cashAndCashEquivalents");

  // From key-metrics
  var roaRow    = buildRow(metrics, "returnOnAssets");
  var roeRow    = buildRow(metrics, "returnOnEquity");
  var roicRow   = buildRow(metrics, "returnOnInvestedCapital");

  // From ratios
  var fcfPsRow  = buildRow(ratios, "freeCashFlowPerShare");
  var gpmRow    = buildRow(ratios, "grossProfitMargin");
  var npmRow    = buildRow(ratios, "netProfitMargin");
  var icRow     = buildRow(ratios, "interestCoverageRatio");
  var dyRow     = buildRow(ratios, "dividendYield");
  var dpsRow    = buildRow(ratios, "dividendPerShare");
  var prRow     = buildRow(ratios, "dividendPayoutRatio");
  var taxRow    = buildRow(ratios, "effectiveTaxRate");

  // Computed rows
  var fcfMargRow = [];
  var ndFcfRow   = [];
  var fcfPrRow   = [];
  for (var i = 0; i < n; i++) {
    fcfMargRow.push(revRow[i] ? fcfRow[i] / revRow[i] : "");
    ndFcfRow.push(fcfRow[i] ? ndRow[i] / fcfRow[i] : "");
    fcfPrRow.push(fcfRow[i] ? divPdRow[i] / Math.abs(fcfRow[i]) : "");
  }

  // ── Write data table (rows 22-52, columns X=24 to AB=28) ──
  // Each entry: [row, values]
  var writes = [
    [22, yearRow],       // Year headers
    [23, revRow],        // Revenue
    // 24: Revenue Growth — sheet formula, skip
    [25, fcfRow],        // FCF
    [26, fcfPsRow],      // FCF/Share
    // 27: FCF/Share Growth — sheet formula, skip
    [28, epsRow],        // EPS
    // 29: EPS Growth — sheet formula, skip
    [30, gpmRow],        // Gross Profit Margin
    [31, npmRow],        // Net Profit Margin
    [32, fcfMargRow],    // FCF Margin (computed)
    [33, ndRow],         // Net Debt
    // 34: Net Debt Growth — sheet formula, skip
    [35, ndFcfRow],      // Net Debt to FCF (computed)
    [36, icRow],         // Interest Coverage
    [37, dyRow],         // Dividend Yield
    [38, divPdRow],      // Dividend Paid (abs value)
    [39, dpsRow],        // Dividends per Share
    // 40: Dividend per Share Growth — sheet formula, skip
    [41, prRow],         // Payout Ratio
    [42, fcfPrRow],      // FCF Payout Ratio (computed)
    [43, sharesRow],     // Shares Outstanding
    // 44: Shares Outstanding Growth — sheet formula, skip
    [45, roaRow],        // ROA
    [46, roeRow],        // ROE
    [47, ebitRow],       // EBIT
    [48, taxRow],        // Tax Rate
    [49, debtRow],       // Total Debt
    [50, eqRow],         // Total Equity
    [51, cashRow],       // Cash & Equivalents
    [52, roicRow],       // ROIC
  ];

  writes.forEach(function(w) {
    sh.getRange(w[0], 24, 1, n).setValues([w[1]]);
  });

  // ── FCF history formulas: AL115-119 reference data table row 25 (reversed) ──
  // AL115=AB25 (newest), AL116=AA25, AL117=Z25, AL118=Y25, AL119=X25 (oldest)
  var fcfCols = ["AB25", "AA25", "Z25", "Y25", "X25"];
  for (var j = 0; j < n; j++) {
    sh.getRange(115 + j, 38).setFormula("=" + fcfCols[j]);
  }

  // N3-N7: Year labels referencing data table row 22 (reversed)
  var yearCols = ["AB22", "AA22", "Z22", "Y22", "X22"];
  for (var j = 0; j < n; j++) {
    sh.getRange(3 + j, 14).setFormula("=" + yearCols[j]);
  }

  ss.toast(ticker + " — " + n + " years loaded (6 API calls)", "FMP ✓", 5);
}

// ─── API helper ─────────────────────────────────────────────────────────────
function fmpFetch(endpoint, ticker) {
  var url = FMP_BASE + "/" + endpoint +
    "?symbol=" + encodeURIComponent(ticker) +
    "&period=annual&limit=5&apikey=" + FMP_KEY;
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var text = resp.getContentText();
    var data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    Logger.log("FMP non-array response [" + endpoint + "]: " + text.substring(0, 200));
    return [];
  } catch (e) {
    Logger.log("FMP error [" + endpoint + "]: " + e);
    return [];
  }
}
