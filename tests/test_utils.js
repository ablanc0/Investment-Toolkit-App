/**
 * Tests for static/js/utils.js — pure formatting and math functions.
 * Run with: node tests/test_utils.js
 */

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// -- Mock DOM globals that utils.js expects -----------------------------------
global.document = {
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
        className: '',
        textContent: '',
        appendChild: () => {},
        remove: () => {},
    }),
    body: {
        insertBefore: () => {},
        appendChild: () => {},
        firstChild: null,
    },
};
global.window = {};
global.setTimeout = setTimeout;
global._displaySettings = { currencySymbol: '$', decimalPlaces: 2, percentDecimals: 2 };
global._categorySettings = [];
global._signalThresholds = {};
global._defaultSignalMode = 'avgCost';
global._analyzerData = null;
global._analyzerWarnings = null;

// -- Load utils.js in the current context ------------------------------------
const utilsPath = path.resolve(__dirname, '..', 'static', 'js', 'utils.js');
const code = fs.readFileSync(utilsPath, 'utf8');
vm.runInThisContext(code, { filename: 'utils.js' });

// -- Tests -------------------------------------------------------------------
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  PASS  ${name}`);
    } catch (err) {
        failed++;
        console.log(`  FAIL  ${name}`);
        console.log(`        ${err.message}`);
    }
}

console.log('\nutils.js tests\n');

// formatMoney
test('formatMoney: positive number', () => {
    assert.strictEqual(formatMoney(1234.56), '$1,234.56');
});

test('formatMoney: zero', () => {
    assert.strictEqual(formatMoney(0), '$0.00');
});

test('formatMoney: null returns $0.00', () => {
    assert.strictEqual(formatMoney(null), '$0.00');
});

test('formatMoney: undefined returns $0.00', () => {
    assert.strictEqual(formatMoney(undefined), '$0.00');
});

test('formatMoney: negative number', () => {
    // formatMoney prepends $ before the number, so negative is $-500.00
    assert.strictEqual(formatMoney(-500), '$-500.00');
});

test('formatMoney: large number with commas', () => {
    assert.strictEqual(formatMoney(1000000), '$1,000,000.00');
});

test('formatMoney: string number input', () => {
    assert.strictEqual(formatMoney('99.9'), '$99.90');
});

// formatPercent
test('formatPercent: positive', () => {
    assert.strictEqual(formatPercent(12.34), '12.34%');
});

test('formatPercent: zero', () => {
    assert.strictEqual(formatPercent(0), '0.00%');
});

test('formatPercent: null returns 0.00%', () => {
    assert.strictEqual(formatPercent(null), '0.00%');
});

test('formatPercent: undefined returns 0.00%', () => {
    assert.strictEqual(formatPercent(undefined), '0.00%');
});

test('formatPercent: negative', () => {
    assert.strictEqual(formatPercent(-3.5), '-3.50%');
});

// round2
test('round2: typical rounding', () => {
    assert.strictEqual(round2(3.456), 3.46);
});

test('round2: no rounding needed', () => {
    assert.strictEqual(round2(5), 5);
});

test('round2: negative', () => {
    assert.strictEqual(round2(-1.999), -2);
});

// fmtBigNum
test('fmtBigNum: trillions', () => {
    assert.strictEqual(fmtBigNum(2.5e12), '$2.50T');
});

test('fmtBigNum: billions', () => {
    assert.strictEqual(fmtBigNum(1.23e9), '$1.23B');
});

test('fmtBigNum: millions', () => {
    assert.strictEqual(fmtBigNum(45.6e6), '$45.6M');
});

test('fmtBigNum: zero returns dash', () => {
    assert.strictEqual(fmtBigNum(0), '\u2014');
});

test('fmtBigNum: null returns dash', () => {
    assert.strictEqual(fmtBigNum(null), '\u2014');
});

test('fmtBigNum: small number falls through to formatMoney', () => {
    assert.strictEqual(fmtBigNum(1234), '$1,234.00');
});

// fmtVal
test('fmtVal: null returns dash', () => {
    assert.strictEqual(fmtVal(null, '$'), '\u2014');
});

test('fmtVal: zero returns dash', () => {
    assert.strictEqual(fmtVal(0, '$'), '\u2014');
});

test('fmtVal: dollar format', () => {
    assert.strictEqual(fmtVal(42.5, '$'), '$42.50');
});

test('fmtVal: percent format', () => {
    assert.strictEqual(fmtVal(7.89, '%'), '7.89%');
});

test('fmtVal: big format', () => {
    assert.strictEqual(fmtVal(3e9, 'big'), '$3.00B');
});

test('fmtVal: multiplier format', () => {
    assert.strictEqual(fmtVal(1.5, 'x'), '1.50x');
});

test('fmtVal: number without format', () => {
    assert.strictEqual(fmtVal(3.14159), '3.14');
});

test('fmtVal: string without format', () => {
    assert.strictEqual(fmtVal('hello'), 'hello');
});

// signalColor
test('signalColor: strong buy', () => {
    const c = signalColor('Strong Buy');
    assert.strictEqual(c.fg, '#4ade80');
});

test('signalColor: buy', () => {
    const c = signalColor('Buy');
    assert.strictEqual(c.fg, '#22d3ee');
});

test('signalColor: overrated', () => {
    const c = signalColor('Overrated');
    assert.strictEqual(c.fg, '#f87171');
});

test('signalColor: empty string', () => {
    const c = signalColor('');
    assert.strictEqual(c.fg, '#6366f1');  // default
});

// recColor
test('recColor: strong_buy', () => {
    const c = recColor('strong_buy');
    assert.strictEqual(c.fg, '#4ade80');
});

test('recColor: sell', () => {
    const c = recColor('sell');
    assert.strictEqual(c.fg, '#f87171');
});

// _invtScoreColor
test('_invtScoreColor: score 9+', () => {
    assert.strictEqual(_invtScoreColor(9.5), '#4ade80');
});

test('_invtScoreColor: score 8', () => {
    assert.strictEqual(_invtScoreColor(8), '#22d3ee');
});

test('_invtScoreColor: score 6', () => {
    assert.strictEqual(_invtScoreColor(6), '#3b82f6');
});

test('_invtScoreColor: score 4', () => {
    assert.strictEqual(_invtScoreColor(4), '#f59e0b');
});

test('_invtScoreColor: score below 4', () => {
    assert.strictEqual(_invtScoreColor(2), '#f87171');
});

// -- Summary -----------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
