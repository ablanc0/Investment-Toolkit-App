/**
 * FMP Stock Analyzer — Google Apps Script
 *
 * Fetches financial data from FMP API and populates the Stock Analyzer sheet.
 * 5 API calls per refresh, 5 years of data.
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
 * API: 5 calls per refresh × 250/day free tier = ~50 refreshes/day
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

  // ── Fetch 5 endpoints (5 API calls) ──
  var income   = fmpFetch("income-statement", ticker);
  var cashflow = fmpFetch("cash-flow-statement", ticker);
  var balance  = fmpFetch("balance-sheet-statement", ticker);
  var metrics  = fmpFetch("key-metrics", ticker);
  var ratios   = fmpFetch("ratios", ticker);

  if (!income.length) {
    SpreadsheetApp.getUi().alert("No data found for " + ticker);
    return;
  }

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

  // ── Fill individual cells used by DCF calculator ──

  // AL115-AL119: FCF history (most recent → oldest), AL = column 38
  for (var j = 0; j < n; j++) {
    sh.getRange(115 + j, 38).setValue(cashflow[j] ? cashflow[j].freeCashFlow : "");
  }

  // N3-N7: Year labels for FCF history (most recent → oldest), N = column 14
  for (var j = 0; j < n; j++) {
    sh.getRange(3 + j, 14).setValue(parseInt(cashflow[j].date.substring(0, 4)));
  }

  // Latest year values for DCF inputs
  sh.getRange(99, 25).setValue(income[0].operatingIncome);         // Y99:  EBIT
  sh.getRange(99, 35).setValue(income[0].weightedAverageShsOut);   // AI99: Shares
  sh.getRange(107, 9).setValue(balance[0].cashAndCashEquivalents); // I107: Cash
  sh.getRange(107, 51).setValue(balance[0].totalDebt);             // AY107: Total Debt
  sh.getRange(123, 28).setValue(                                   // AB123: Interest Coverage
    ratios[0] ? ratios[0].interestCoverageRatio : ""
  );

  ss.toast(ticker + " — " + n + " years loaded (5 API calls)", "FMP ✓", 5);
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
