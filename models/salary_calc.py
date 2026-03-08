"""
InvToolkit — Salary and tax computation models.
Federal tax calculation, salary breakdown, and data migration helpers.
"""

from datetime import datetime

from config import FEDERAL_BRACKETS, _TAX_NAME_MAP
from services.data_store import save_portfolio


def compute_federal_tax(taxable_income):
    """Progressive federal tax using standard brackets."""
    if taxable_income <= 0:
        return 0
    tax = 0
    prev = 0
    for limit, rate in FEDERAL_BRACKETS:
        amt = min(taxable_income, limit) - prev
        if amt <= 0:
            break
        tax += amt * rate
        prev = limit
    return round(tax, 2)


def _default_taxes():
    return {
        "iraContributionPct": 0.03,
        "standardDeduction": 16100,
        "cityResidentTax": {"name": "City Tax (Resident)", "rate": 0.01, "enabled": True},
        "cityNonResidentTax": {"name": "City Tax (Non-Resident)", "rate": 0.003, "enabled": True},
        "stateTax": {"name": "State Tax", "rate": 0.0425, "enabled": True},
    }


def migrate_salary_data(salary):
    """Convert old flat salary format to new profiles structure. Idempotent."""
    if "profiles" in salary:
        return salary  # already migrated

    old = salary.copy()
    streams = []
    if old.get("w2Salary", 0) > 0:
        streams.append({"type": "W2", "amount": old["w2Salary"], "label": "Main Job"})
    if old.get("income1099", 0) > 0:
        streams.append({"type": "1099", "amount": old["income1099"], "label": "Freelance"})
    if not streams:
        streams.append({"type": "W2", "amount": 0, "label": "Main Job"})

    taxes = _default_taxes()
    if "iraContributionPct" in old:
        taxes["iraContributionPct"] = old["iraContributionPct"]
    if "lansingTaxPct" in old:
        taxes["cityResidentTax"]["rate"] = old["lansingTaxPct"]
    if "eLansingTaxPct" in old:
        taxes["cityNonResidentTax"]["rate"] = old["eLansingTaxPct"]
    if "michiganTaxPct" in old:
        taxes["stateTax"]["rate"] = old["michiganTaxPct"]

    profile = {
        "name": "Alejandro",
        "year": old.get("year", datetime.now().year),
        "incomeStreams": streams,
        "taxes": taxes,
        "projectedSalary": old.get("projectedW2", 140000),
        "history": old.get("history", []),
    }

    new_salary = {
        "activeProfile": "alejandro",
        "profiles": {"alejandro": profile},
        "savedMoney": old.get("savedMoney", 0),
        "pctSavingsToInvest": old.get("pctSavingsToInvest", 1.0),
        "pctIncomeCanSave": old.get("pctIncomeCanSave", 0.25),
        "yearsUntilRetirement": old.get("yearsUntilRetirement", 20),
        "desiredRetirementSalary": old.get("desiredRetirementSalary", 0),
        "annualInterestRate": old.get("annualInterestRate", 0),
        "returnRateRetirement": old.get("returnRateRetirement", 0.04),
    }
    return new_salary


def get_marginal_rates(profile):
    """Compute marginal tax rates for a salary profile.
    Returns dict: {federalRate, stateRate, cityRate, combinedRate} as decimals.
    """
    streams = profile.get("incomeStreams", [])
    taxes = profile.get("taxes", _default_taxes())

    w2 = sum(s["amount"] for s in streams if s.get("type") == "W2")
    t1099 = sum(s["amount"] for s in streams if s.get("type") in ("1099", "Other"))

    ira_pct = taxes.get("iraContributionPct", 0.03)
    std_deduction = taxes.get("standardDeduction", 16100)
    se_factor = 0.9235
    ss_pct = 0.062
    medicare_pct = 0.0145

    w2_ira = round(w2 * ira_pct, 2)
    w2_fed_taxable = max(0, w2 - w2_ira - std_deduction)
    t1099_se_tax = t1099 * se_factor * (ss_pct + medicare_pct) * 2
    t1099_fed_taxable = max(0, t1099 - round(t1099_se_tax / 2, 2))
    total_fed_taxable = w2_fed_taxable + t1099_fed_taxable

    marginal_fed_rate = 0
    for limit, rate in FEDERAL_BRACKETS:
        if total_fed_taxable <= limit:
            marginal_fed_rate = rate
            break

    marginal_state = taxes.get("stateTax", {}).get("rate", 0) if taxes.get("stateTax", {}).get("enabled") else 0
    marginal_city = sum(
        taxes.get(k, {}).get("rate", 0)
        for k in ("cityResidentTax",)
        if taxes.get(k, {}).get("enabled")
    )

    return {
        "federalRate": marginal_fed_rate,
        "stateRate": marginal_state,
        "cityRate": marginal_city,
        "combinedRate": marginal_fed_rate + marginal_state + marginal_city,
    }


def compute_salary_breakdown(profile):
    """Compute full tax breakdown for a salary profile."""
    streams = profile.get("incomeStreams", [])
    taxes = profile.get("taxes", _default_taxes())

    w2 = sum(s["amount"] for s in streams if s.get("type") == "W2")
    t1099 = sum(s["amount"] for s in streams if s.get("type") in ("1099", "Other"))
    total = w2 + t1099
    if total == 0:
        total = 0.01  # avoid division by zero

    ira_pct = taxes.get("iraContributionPct", 0.03)
    std_deduction = taxes.get("standardDeduction", 16100)
    se_factor = 0.9235
    ss_pct = 0.062
    medicare_pct = 0.0145

    # IRA only on W2
    w2_ira = round(w2 * ira_pct, 2)

    # Taxable base for local/state: salary minus IRA for W2, gross for 1099
    w2_local_base = w2 - w2_ira
    t1099_local_base = t1099

    # Build tax rows dynamically from config
    rows = []
    w2_deductions = w2_ira
    t1099_deductions = 0

    # Row: Annual Salary
    rows.append({"label": "Annual Salary", "total": round(total, 2), "totalMo": round(total/12, 2),
                 "w2": round(w2, 2), "w2Mo": round(w2/12, 2), "t1099": round(t1099, 2), "t1099Mo": round(t1099/12, 2), "isIncome": True})

    # Row: Pre-Tax Deductions (IRA)
    rows.append({"label": "Pre-Tax Deductions (IRA)", "total": round(w2_ira, 2), "totalMo": round(w2_ira/12, 2),
                 "w2": round(w2_ira, 2), "w2Mo": round(w2_ira/12, 2), "t1099": 0, "t1099Mo": 0,
                 "ratePct": ira_pct*100, "rateKey": "iraContributionPct"})

    # Configurable local/state taxes (toggleable)
    tax_lines = [
        ("cityResidentTax", w2_local_base, t1099_local_base),
        ("cityNonResidentTax", w2_local_base, t1099_local_base),
        ("stateTax", w2_local_base, t1099_local_base),
    ]
    w2_local_total = 0
    t1099_local_total = 0
    for key, w2_base, t1099_base in tax_lines:
        cfg = taxes.get(key, {})
        if not cfg.get("enabled", False):
            continue
        rate = cfg.get("rate", 0)
        name = cfg.get("name", key)
        w2_amt = round(w2_base * rate, 2)
        t1099_amt = round(t1099_base * rate, 2)
        total_amt = round(w2_amt + t1099_amt, 2)
        w2_local_total += w2_amt
        t1099_local_total += t1099_amt
        w2_deductions += w2_amt
        t1099_deductions += t1099_amt
        rows.append({"label": name, "total": total_amt, "totalMo": round(total_amt/12, 2),
                     "w2": w2_amt, "w2Mo": round(w2_amt/12, 2), "t1099": t1099_amt, "t1099Mo": round(t1099_amt/12, 2),
                     "ratePct": rate*100, "taxKey": key, "toggleable": True})

    # Federal tax — progressive brackets with standard deduction
    w2_fed_taxable = max(0, w2 - w2_ira - std_deduction)
    # 1099: deduct half of SE tax from federal taxable income
    t1099_se_tax = t1099 * se_factor * (ss_pct + medicare_pct) * 2
    t1099_fed_taxable = max(0, t1099 - round(t1099_se_tax / 2, 2))
    w2_federal = compute_federal_tax(w2_fed_taxable)
    t1099_federal = compute_federal_tax(t1099_fed_taxable)
    total_federal = round(w2_federal + t1099_federal, 2)
    # Compute effective federal rate for display
    fed_base = w2_fed_taxable + t1099_fed_taxable
    eff_fed_pct = round((total_federal / fed_base) * 100, 2) if fed_base > 0 else 0
    w2_deductions += w2_federal
    t1099_deductions += t1099_federal
    rows.append({"label": "Federal Tax", "total": total_federal, "totalMo": round(total_federal/12, 2),
                 "w2": w2_federal, "w2Mo": round(w2_federal/12, 2), "t1099": t1099_federal, "t1099Mo": round(t1099_federal/12, 2),
                 "effRate": eff_fed_pct, "isFederal": True})

    # Social Security
    w2_ss = round(w2 * ss_pct, 2)
    t1099_ss = round(t1099 * se_factor * ss_pct * 2, 2)
    total_ss = round(w2_ss + t1099_ss, 2)
    w2_deductions += w2_ss
    t1099_deductions += t1099_ss
    rows.append({"label": "Social Security", "total": total_ss, "totalMo": round(total_ss/12, 2),
                 "w2": w2_ss, "w2Mo": round(w2_ss/12, 2), "t1099": t1099_ss, "t1099Mo": round(t1099_ss/12, 2),
                 "fixedRate": round(ss_pct*100, 2)})

    # Medicare
    w2_med = round(w2 * medicare_pct, 2)
    t1099_med = round(t1099 * se_factor * medicare_pct * 2, 2)
    total_med = round(w2_med + t1099_med, 2)
    w2_deductions += w2_med
    t1099_deductions += t1099_med
    rows.append({"label": "Medicare", "total": total_med, "totalMo": round(total_med/12, 2),
                 "w2": w2_med, "w2Mo": round(w2_med/12, 2), "t1099": t1099_med, "t1099Mo": round(t1099_med/12, 2),
                 "fixedRate": round(medicare_pct*100, 2)})

    # Totals
    total_withheld = round(w2_deductions + t1099_deductions, 2)
    w2_takehome = round(w2 - w2_deductions, 2)
    t1099_takehome = round(t1099 - t1099_deductions, 2)
    total_takehome = round(total - total_withheld, 2)

    rows.append({"label": "Total Withheld", "total": total_withheld, "totalMo": round(total_withheld/12, 2),
                 "w2": round(w2_deductions, 2), "w2Mo": round(w2_deductions/12, 2),
                 "t1099": round(t1099_deductions, 2), "t1099Mo": round(t1099_deductions/12, 2), "isSummary": True})
    rows.append({"label": "Take-Home Pay", "total": total_takehome, "totalMo": round(total_takehome/12, 2),
                 "w2": w2_takehome, "w2Mo": round(w2_takehome/12, 2),
                 "t1099": t1099_takehome, "t1099Mo": round(t1099_takehome/12, 2), "isSummary": True, "isPositive": True})

    # Hourly / Eff Tax
    real_total = w2 + t1099  # use actual total, not the 0.01 guard
    total_hourly = round(real_total / (52 * 40), 2) if real_total > 0 else 0
    w2_hourly = round(w2 / (52 * 40), 2) if w2 > 0 else 0
    t1099_hourly = round(t1099 / (52 * 40), 2) if t1099 > 0 else 0
    total_eff = round(total_withheld / real_total, 4) if real_total > 0 else 0
    w2_eff = round(w2_deductions / w2, 4) if w2 > 0 else 0
    t1099_eff = round(t1099_deductions / t1099, 4) if t1099 > 0 else 0
    rows.append({"label": "Hourly Rate / Eff. Tax %", "total": total_hourly, "totalMo": total_eff,
                 "w2": w2_hourly, "w2Mo": w2_eff, "t1099": t1099_hourly, "t1099Mo": t1099_eff, "isRate": True})

    # Taxable income row (insert after Annual Salary)
    w2_taxable = round(w2 - w2_ira, 2)
    t1099_taxable = round(t1099, 2)
    total_taxable = round(w2_taxable + t1099_taxable, 2)
    rows.insert(1, {"label": "Taxable Income", "total": total_taxable, "totalMo": round(total_taxable/12, 2),
                     "w2": w2_taxable, "w2Mo": round(w2_taxable/12, 2), "t1099": t1099_taxable, "t1099Mo": round(t1099_taxable/12, 2)})

    # Employer cost (W2 only)
    emp_ira = round(w2 * ira_pct, 2)
    emp_futa = round(0.006 * 7000 + 0.027 * 9500, 2) if w2 > 0 else 0
    emp_ss = round(w2 * ss_pct, 2)
    emp_med = round(w2 * medicare_pct, 2)
    emp_total = round(emp_ira + emp_futa + emp_ss + emp_med, 2)
    employer = {
        "rows": [
            {"label": "IRA Match", "annual": emp_ira, "monthly": round(emp_ira/12, 2)},
            {"label": "Federal Unemployment (FUTA)", "annual": emp_futa, "monthly": round(emp_futa/12, 2)},
            {"label": "Social Security (6.2%)", "annual": emp_ss, "monthly": round(emp_ss/12, 2)},
            {"label": "Medicare (1.45%)", "annual": emp_med, "monthly": round(emp_med/12, 2)},
        ],
        "total": emp_total,
        "totalMonthly": round(emp_total/12, 2),
        "costToCompany": round(w2 + emp_total, 2),
        "costToCompanyMonthly": round((w2 + emp_total)/12, 2),
    }

    # HSA Calculator
    hsa_extra = profile.get("hsaExtraIncome", 0)
    hsa = None
    if hsa_extra > 0:
        fica_rate = ss_pct + medicare_pct  # 0.0765
        fica_cost = round(hsa_extra * fica_rate, 2)
        effective_gain = round(hsa_extra - fica_cost, 2)

        # Compute marginal combined tax rate dynamically
        rates = get_marginal_rates(profile)
        combined_marginal = rates["combinedRate"]

        aggressive = hsa_extra
        cash_neutral = effective_gain
        tax_recovered_agg = round(aggressive * combined_marginal, 2)
        tax_recovered_neutral = round(cash_neutral * combined_marginal, 2)

        hsa = {
            "extraIncome": hsa_extra,
            "ficaCost": fica_cost,
            "effectiveGain": effective_gain,
            "combinedMarginalRate": round(combined_marginal * 100, 2),
            "aggressive": {
                "contribution": aggressive,
                "taxRecovered": tax_recovered_agg,
            },
            "cashNeutral": {
                "contribution": cash_neutral,
                "taxRecovered": tax_recovered_neutral,
            },
        }

    # Projected salary (W2 only, same tax config)
    proj_amount = profile.get("projectedSalary", 0)
    projected = None
    if proj_amount > 0:
        proj_profile = {
            "incomeStreams": [{"type": "W2", "amount": proj_amount, "label": "Projected"}],
            "taxes": taxes,
        }
        proj_bd = compute_salary_breakdown(proj_profile)
        projected = {
            "amount": proj_amount,
            "rows": proj_bd["rows"],
            "summary": proj_bd["summary"],
            "vsCurrent": {
                "deltaGross": round(proj_amount - real_total, 2),
                "deltaTakeHome": round(proj_bd["summary"]["takeHomePay"] - total_takehome, 2),
                "deltaEffRate": round((proj_bd["summary"]["effectiveTaxRate"] - total_eff) * 100, 2),
            }
        }

    return {
        "rows": rows,
        "summary": {
            "annualGross": round(real_total, 2), "w2Total": round(w2, 2), "t1099Total": round(t1099, 2),
            "takeHomePay": total_takehome, "totalWithhold": total_withheld,
            "effectiveTaxRate": total_eff, "hourlyRate": total_hourly,
            "monthlySalary": round(total_takehome/12, 2),
        },
        "employer": employer,
        "projected": projected,
        "hsa": hsa,
    }


def _future_value(rate, nper, pmt, pv):
    """Compute future value of current savings (pv) plus annual contributions (pmt)
    growing at annual rate for nper years. All inputs positive."""
    if rate == 0:
        return pv + pmt * nper
    return pv * (1 + rate) ** nper + pmt * ((1 + rate) ** nper - 1) / rate


def compute_retirement_plan(salary_summary, retirement_config, portfolio_summary):
    """Compute retirement projections from salary, retirement config, and portfolio data."""
    take_home = salary_summary.get("takeHomePay", 0)
    monthly_salary = salary_summary.get("monthlySalary", 0)

    # Config with defaults
    pct_savings_invest = retirement_config.get("pctSavingsToInvest", 1.0)
    pct_can_save = retirement_config.get("pctIncomeCanSave", 0.25)
    years = retirement_config.get("yearsUntilRetirement", 20)
    ret_return_rate = retirement_config.get("returnRateRetirement", 0.04)
    other_income = retirement_config.get("otherRetirementIncome", 0)
    desired_pct = retirement_config.get("desiredRetirementPct", 0.75)

    # Portfolio data
    current_savings = portfolio_summary.get("totalPortfolio", 0)
    # Annual return: use config override if set, else portfolio return, else 7% default
    annual_return_cfg = retirement_config.get("annualReturnRate")
    if annual_return_cfg is not None:
        annual_return = annual_return_cfg
    else:
        pct = portfolio_summary.get("totalReturnPct", 0)
        annual_return = pct / 100 if pct > 0 else 0.07  # default 7%

    # Derived values
    available_to_invest = round(current_savings * pct_savings_invest, 2)
    desired_retirement_salary = round(take_home * desired_pct, 2)
    desired_monthly = round(desired_retirement_salary / 12, 2)
    monthly_investable = round(pct_can_save * take_home / 12, 2)
    annual_contribution = round(monthly_investable * 12, 2)

    # Core FV projection
    total_at_retirement = round(_future_value(annual_return, years, annual_contribution, available_to_invest), 2)
    if total_at_retirement < 0:
        total_at_retirement = 0

    # Retirement income
    passive_annual = round(total_at_retirement * ret_return_rate, 2)
    passive_monthly = round(passive_annual / 12, 2)
    total_monthly_retirement = round(passive_monthly + other_income, 2)

    # Goal fulfillment
    goal_fulfillment = round(total_monthly_retirement / desired_monthly, 2) if desired_monthly > 0 else 0

    # "Live as Today" metrics
    money_required = round(desired_retirement_salary / ret_return_rate, 2) if ret_return_rate > 0 else 0
    monthly_invest_required = round(monthly_investable / goal_fulfillment, 2) if goal_fulfillment > 0 else 0
    annual_income_required = round(take_home / goal_fulfillment, 2) if goal_fulfillment > 0 else 0

    return {
        "currentSavings": current_savings,
        "availableToInvest": available_to_invest,
        "annualSalary": take_home,
        "monthlySalary": monthly_salary,
        "desiredRetirementSalary": desired_retirement_salary,
        "desiredMonthlyRetirement": desired_monthly,
        "monthlyInvestable": monthly_investable,
        "annualReturnRate": round(annual_return * 100, 2),
        "yearsUntilRetirement": years,
        "totalAtRetirement": total_at_retirement,
        "returnRateRetirement": round(ret_return_rate * 100, 2),
        "passiveIncomeAnnual": passive_annual,
        "passiveIncomeMonthly": passive_monthly,
        "otherRetirementIncome": other_income,
        "totalMonthlyRetirement": total_monthly_retirement,
        "goalFulfillment": goal_fulfillment,
        "moneyRequired": money_required,
        "monthlyInvestmentRequired": monthly_invest_required,
        "annualIncomeRequired": annual_income_required,
        "desiredRetirementPct": desired_pct,
        "pctIncomeCanSave": pct_can_save,
        "pctSavingsToInvest": pct_savings_invest,
    }


def _get_salary_data(portfolio):
    """Get salary data, migrating if needed."""
    salary = portfolio.get("salary", {})
    if "profiles" not in salary:
        salary = migrate_salary_data(salary)
        portfolio["salary"] = salary
        save_portfolio(portfolio)
    # Fix legacy tax names + backfill missing effectiveTaxRate in history
    changed = False
    for pid, profile in salary.get("profiles", {}).items():
        taxes = profile.get("taxes", {})
        for tkey in ("cityResidentTax", "cityNonResidentTax", "stateTax"):
            cfg = taxes.get(tkey, {})
            if cfg.get("name") in _TAX_NAME_MAP:
                cfg["name"] = _TAX_NAME_MAP[cfg["name"]]
                changed = True
        for h in profile.get("history", []):
            if "effectiveTaxRate" not in h and h.get("annualPayroll", 0) > 0:
                h["effectiveTaxRate"] = round(1 - h["takeHomePay"] / h["annualPayroll"], 4)
                changed = True
    if changed:
        portfolio["salary"] = salary
        save_portfolio(portfolio)
    return salary
