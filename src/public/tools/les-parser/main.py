"""
les_parser main.py

PyScript port of usda-nfc-les-parser — parses USDA NFC Earnings & Leave
Statements (AD-334) entirely in the browser. The statement text is extracted
from the PDF with pypdf (installed at runtime via micropip) and parsed with
the same regex layer as the source CLI. No data ever leaves the page.

Test notes (PyScript testing is limited — see AGENTS.md):
- parse_les_text() is stdlib-only and pure: it was verified locally against a
  synthetic AD-334 sample (dates, GROSS PAY/NET PAY/TOTAL DEDUCTIONS lines,
  deduction items 75/02 75/15 76 77 78 83 97, leave items 61/62/50, YTD
  ANN/SICK/COMP rows) asserting balanced financials and correct extraction.
- Browser checks: paste sample text -> parse -> fields/tables render; upload
  path covered by error branches (non-PDF, scanned PDF).
"""

import csv
import io
import json
import re
from decimal import Decimal, InvalidOperation

from pyscript import document

# ---------------------------------------------------------------------------
# Constants — NFC AD-334 standard item codes (ported verbatim)
# ---------------------------------------------------------------------------

DEDUCTION_PATTERNS = [
    ("75", "02", "RETIREMENT",              r"RETIREMENT"),
    ("75", "15", "TSP-FERS",                r"TSP-FERS"),
    ("75", "16", "TSP-FERS CATCH-UP",       r"TSP-FERS CATCH-UP"),
    ("75", "17", "401(K)",                  r"401\(K\)(?!\(TAXABLE\))"),
    ("75", "18", "401(K) CATCH-UP",         r"401\(K\) CATCH-UP"),
    ("75", "25", "401(K)(TAXABLE)",         r"401\(K\)\(TAXABLE\)"),
    ("76", "",   "SOCIAL SECURITY (OASDI)", r"SOCIAL SECURITY \(OASDI\)"),
    ("77", "",   "FEDERAL TAX",             r"FEDERAL TAX"),
    ("78", "",   "STATE TAX",               r"ST TAX"),
    ("83", "",   "FEHBA",                   r"FEHBA"),
    ("86", "",   "DENTAL/VISION",           r"DENTAL.VISION"),
    ("88", "60", "HEALTH SAVINGS ACCOUNT",  r"HEALTH SAVINGS"),
    ("89", "",   "FLEXIBLE SPENDING",       r"FLEXIBLE SPENDING"),
    ("97", "",   "MEDICARE TAX",            r"MEDICARE TAX"),
]

LEAVE_EARNINGS_PATTERNS = [
    ("50", "CREDIT HOURS"),
    ("51", "SEP MNTCE ALLOW TAXABLE"),
    ("52", "CYCLE PROGRAM"),
    ("61", "ANNUAL LEAVE"),
    ("62", "SICK LEAVE"),
    ("64", "COMPENSATORY LEAVE"),
    ("66", "OTHER LEAVE"),
]

SINGLE_AMOUNT_EARNINGS_CODES = [
    ("51", "SEP MNTCE ALLOW TAXABLE"),
    ("52", "CYCLE PROGRAM"),
    ("44", "CASH AWARD"),
    ("44", "QSI"),
]

YTD_LEAVE_TYPES = [
    "ANN",
    "SICK",
    "COMP",
    "MILITARY",
    "TIME OFF AWARD",
    "CREDIT HOURS-BY PAY PERIOD",
    "RELIGIOUS COMP-BY PAY PERIOD",
    "TRAVEL COMP-BY PAY PERIOD",
    "BPAPRA COMPENSATORY",
    "BPAPRA OBLIGATED DEBT",
    "DISABLED VETERAN LEAVE",
]

PAY_TYPES = {
    "PA":  "Per Annum",
    "PH":  "Per Hour",
    "SES": "Senior Executive Service",
    "AD":  "Administratively Determined",
    "EX":  "Executive Schedule",
    "SL":  "Senior Level",
}

SAMPLE_TEXT = """AD-334  EARNINGS AND LEAVE STATEMENT
NFC  PAY PERIOD: 04/05/2026 04/18/2026
Official Pay Date 04/30/2026

$88,245.00 PA

GROSS PAY 80.00 3,677.00 44,124.00
75 02 RETIREMENT 184.00 2,208.00
75 15 TSP-FERS 183.85 2,206.20
76 SOCIAL SECURITY (OASDI) 228.00 2,736.00
77 FEDERAL TAX 412.33 4,947.96
78 ST TAX 150.00 1,800.00
83 FEHBA 134.68 1,616.16
97 MEDICARE TAX 53.32 639.84
TOTAL DEDUCTIONS ** 1,346.18 16,153.16
NET PAY ** 2,330.82 28,029.84

61 ANNUAL LEAVE 8.00 208.11
62 SICK LEAVE 4.00 104.06
50 CREDIT HOURS 2.00 55.00

ANN 40.00 16.00 24.00
SICK 52.00 8.00 44.00
COMP 6.00 0.00 6.00
"""


# ---------------------------------------------------------------------------
# Pure parsing layer — ported 1:1 from usda_nfc_les_parser.parse_les()
# ---------------------------------------------------------------------------

def _clean_amount(s):
    try:
        return Decimal(s.replace(",", ""))
    except (InvalidOperation, AttributeError, TypeError):
        return None


def _validate_financials(data):
    gross = _clean_amount(data.get("gross_pay_pp"))
    net   = _clean_amount(data.get("net_pay_pp"))
    deds  = _clean_amount(data.get("total_deductions_pp"))
    if None in (gross, net, deds):
        return None
    return gross == net + deds


def parse_les_text(text, source_file="pasted-text.txt"):
    """Parse the extracted text of an AD-334 statement into a result dict."""
    if "NFC" not in text and "AD-334" not in text and "EARNINGS AND LEAVE" not in text:
        # Not fatal — layout varies. Diagnostics surface the risk.
        pass

    data = {"_source_file": source_file}

    m = re.search(r'(\d{2}/\d{2}/\d{4})\s+(\d{2}/\d{2}/\d{4})', text)
    if m:
        data["pay_period_start"] = m.group(1)
        data["pay_period_end"]   = m.group(2)

    m = re.search(r'Official Pay Date\s+(\d{2}/\d{2}/\d{4})', text, re.IGNORECASE)
    if m:
        data["official_pay_date"] = m.group(1)
    else:
        all_dates = re.findall(r'\b(\d{2}/\d{2}/\d{4})\b', text)
        pp_end = data.get("pay_period_end", "")
        future_dates = [d for d in all_dates if d >= pp_end]
        if future_dates:
            data["official_pay_date"] = future_dates[-1]
        elif all_dates:
            data["official_pay_date"] = all_dates[-1]

    m = re.search(r'\$([\d,]+\.\d{2})\s+(PA|PH|SES|AD|EX|SL)\b', text)
    if m:
        data["salary_rate"]    = m.group(1)
        data["pay_type_code"]  = m.group(2)
        data["pay_type_label"] = PAY_TYPES.get(m.group(2), m.group(2))

    m = re.search(
        r'GROSS PAY.*?([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})',
        text
    )
    if m:
        data["gross_pay_hours"] = m.group(1)
        data["gross_pay_pp"]    = m.group(2)
        data["gross_pay_ytd"]   = m.group(3)
    else:
        m = re.search(r'GROSS PAY.*?([\d,]+\.\d{2})\s+([\d,]+\.\d{2})', text)
        if m:
            data["gross_pay_pp"]  = m.group(1)
            data["gross_pay_ytd"] = m.group(2)

    m = re.search(r'NET PAY \*+\s+([\d,.]+)\s+([\d,.]+)', text)
    if m:
        data["net_pay_pp"]  = m.group(1)
        data["net_pay_ytd"] = m.group(2)

    m = re.search(r'TOTAL DEDUCTIONS \*+\s+([\d,.]+)\s+([\d,.]+)', text)
    if m:
        data["total_deductions_pp"]  = m.group(1)
        data["total_deductions_ytd"] = m.group(2)

    deductions = []
    for item, code, label, desc_pattern in DEDUCTION_PATTERNS:
        code_part = rf'\s+{code}' if code else ''
        pattern = rf'{item}{code_part}\s+{desc_pattern}.*?([\d,]+\.\d{{2}})\s+([\d,]+\.\d{{2}})'
        m = re.search(pattern, text)
        if m:
            deductions.append({
                "item":        item,
                "code":        code,
                "description": label,
                "pp_amount":   m.group(1),
                "ytd_amount":  m.group(2),
            })
    data["deductions"] = deductions

    leave_earnings = []
    for code, label in LEAVE_EARNINGS_PATTERNS:
        m = re.search(rf'{code}\s+{re.escape(label)}\s+([\d,.]+)\s+([\d,.]+)', text)
        if m:
            leave_earnings.append({
                "code":        code,
                "description": label,
                "hours":       m.group(1),
                "amount":      m.group(2),
            })
    for code, label in SINGLE_AMOUNT_EARNINGS_CODES:
        if any(le["code"] == code for le in leave_earnings):
            continue
        pattern = rf'{code}\s+.*?{re.escape(label)}\s+.*?([\d,]+\.\d{{2}})\s+([\d,]+\.\d{{2}})'
        m = re.search(pattern, text)
        if m:
            leave_earnings.append({
                "code":        code,
                "description": label,
                "hours":       "",
                "amount":      m.group(1),
                "ytd_amount":  m.group(2),
            })
        else:
            pattern2 = rf'{code}\s+.*?{re.escape(label)}\s+([\d,]+\.\d{{2}})'
            m2 = re.search(pattern2, text)
            if m2:
                leave_earnings.append({
                    "code":        code,
                    "description": label,
                    "hours":       "",
                    "amount":      m2.group(1),
                })
    data["leave_earnings"] = leave_earnings

    ytd_leave = []
    for leave_type in YTD_LEAVE_TYPES:
        m = re.search(
            rf'(?<!\w){re.escape(leave_type)}\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)',
            text
        )
        if m:
            ytd_leave.append({
                "type":    leave_type,
                "accrued": m.group(1),
                "used":    m.group(2),
                "balance": m.group(3),
            })

    if not ytd_leave:
        m = re.search(
            r'\b(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})\b',
            text
        )
        if m:
            n = m.groups()
            ytd_leave = [
                {"type": "ANNUAL", "accrued": n[0], "used": n[1], "balance": n[2]},
                {"type": "SICK",   "accrued": n[3], "used": n[4], "balance": n[5]},
                {"type": "COMP",   "accrued": n[6], "used": "",   "balance": ""},
            ]

    data["ytd_leave_status"] = ytd_leave

    required = [
        "gross_pay_pp", "net_pay_pp", "total_deductions_pp",
        "salary_rate", "pay_period_start", "pay_period_end",
    ]
    data["_missing_fields"]     = [f for f in required if f not in data]
    data["_financials_balance"] = _validate_financials(data)
    data["_deductions_found"]   = len(deductions)
    data["_leave_items_found"]  = len(leave_earnings)

    return data


def extract_pdf_text(data):
    """Extract text from PDF bytes with pypdf (Pyodide-compatible)."""
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def result_to_csv_rows(results):
    """Flatten results to CSV rows (stdlib csv replaces the source's pandas)."""
    rows = []
    for r in results:
        row = {k: v for k, v in r.items()
               if not isinstance(v, (list, dict)) and not k.startswith("_")}
        for d in r.get("deductions", []):
            col = d["description"].replace(" ", "_").replace("(", "").replace(")", "")
            row[f"ded_{col}_pp"]  = d["pp_amount"]
            row[f"ded_{col}_ytd"] = d["ytd_amount"]
        for l in r.get("leave_earnings", []):
            col = l["description"].replace(" ", "_")
            row[f"leave_{col}_hours"]  = l["hours"]
            row[f"leave_{col}_amount"] = l["amount"]
        rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# DOM wiring
# ---------------------------------------------------------------------------

import js  # noqa: E402  (DOM access after the pure section)


def _esc(s):
    s = "" if s is None else str(s)
    return (s.replace("&", "&amp;").replace("<", "&lt;")
             .replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#39;"))


_last_result = None
_last_results = None


def _set_status(msg, is_error=False):
    box = document.querySelector("#lesStatus")
    if not box:
        return
    box.textContent = msg
    box.classList.toggle("parse-status--error", is_error)


def _set_text(id_, value):
    el = document.querySelector(f"#{id_}")
    if el:
        el.textContent = "" if value is None else str(value)


def _maybe_set_row(field_id, label, value):
    """Hide a meta row entirely when the field was not found."""
    el = document.querySelector(f"#{field_id}")
    if not el:
        return
    if value is None:
        el.style.display = "none"
    else:
        el.style.display = ""
        el.querySelector("strong").textContent = str(value)


def _render_detail(data):
    fields = [
        ("lesPayPeriod", "Pay period", " ".join(
            v for v in (data.get("pay_period_start"), data.get("pay_period_end")) if v) or None),
        ("lesPayDate", "Official pay date", data.get("official_pay_date")),
        ("lesSalary", "Salary / rate",
         (data.get("salary_rate") + " (" + data.get("pay_type_label", "") + ")") if data.get("salary_rate") else None),
        ("lesGrossPp", "Gross pay (PP)", data.get("gross_pay_pp")),
        ("lesNetPp", "Net pay (PP)", data.get("net_pay_pp")),
        ("lesDedsPp", "Total deductions (PP)", data.get("total_deductions_pp")),
        ("lesGrossYtd", "Gross pay (YTD)", data.get("gross_pay_ytd")),
        ("lesNetYtd", "Net pay (YTD)", data.get("net_pay_ytd")),
    ]
    for field_id, label, value in fields:
        _maybe_set_row(field_id, label, value)

    balance = data.get("_financials_balance")
    badge = document.querySelector("#lesBalance")
    if badge:
        if balance is True:
            badge.textContent = "BALANCED ✓"
            badge.style.background = "var(--success)"
            badge.style.color = "var(--bg)"
        elif balance is False:
            badge.textContent = "OUT OF BALANCE"
            badge.style.background = "var(--danger)"
            badge.style.color = "#fff"
        else:
            badge.textContent = "UNVERIFIABLE"
            badge.style.background = "var(--bg2)"
            badge.style.color = "var(--muted)"

    ded_body = document.querySelector("#lesDeductionsBody")
    if ded_body:
        ded_body.innerHTML = "".join(
            "<tr><td>" + _esc(d["description"]) + "</td><td>"
            + _esc((d["item"] + "-" + d["code"]) if d["code"] else d["item"]) + "</td><td>"
            + _esc(d["pp_amount"]) + "</td><td>" + _esc(d["ytd_amount"]) + "</td></tr>"
            for d in data.get("deductions", [])
        ) or '<tr><td colspan="4">No deduction line items matched.</td></tr>'

    leave_body = document.querySelector("#lesLeaveBody")
    if leave_body:
        leave_body.innerHTML = "".join(
            "<tr><td>" + _esc(l["code"]) + "</td><td>" + _esc(l["description"]) + "</td><td>"
            + _esc(l.get("hours") or "—") + "</td><td>" + _esc(l.get("amount")) + "</td></tr>"
            for l in data.get("leave_earnings", [])
        ) or '<tr><td colspan="4">No leave/earnings items matched.</td></tr>'

    ytd_body = document.querySelector("#lesYtdBody")
    if ytd_body:
        ytd_body.innerHTML = "".join(
            "<tr><td>" + _esc(y["type"]) + "</td><td>" + _esc(y["accrued"]) + "</td><td>"
            + _esc(y["used"] or "—") + "</td><td>" + _esc(y["balance"] or "—") + "</td></tr>"
            for y in data.get("ytd_leave_status", [])
        ) or '<tr><td colspan="4">No YTD leave rows matched.</td></tr>'

    missing = data.get("_missing_fields") or []
    diag = document.querySelector("#lesDiag")
    if diag:
        parts = [f"{data.get('_deductions_found', 0)} deductions",
                 f"{data.get('_leave_items_found', 0)} leave items"]
        if missing:
            parts.append("missing: " + ", ".join(missing))
        diag.textContent = " · ".join(parts)


def _render_result(data):
    global _last_result
    _last_result = data
    _render_detail(data)
    out = document.querySelector("#lesJson")
    if out:
        out.value = json.dumps(data, indent=2)
    for section in ("#lesResults", "#lesResults2", "#lesJsonWindow", "#lesDownloadRow"):
        el = document.querySelector(section)
        if el:
            el.style.display = ""


async def _ensure_pypdf():
    import micropip
    await micropip.install("pypdf")


def parse_pasted(event=None):
    """Parse statement text pasted into the textarea (pdfplumber/pypdf output)."""
    box = document.querySelector("#lesRawText")
    text = (box.value or "").strip() if box else ""
    if not text:
        _set_status("Paste statement text first, or upload a PDF.", True)
        return
    data = parse_les_text(text, "pasted-text.txt")
    _render_result(data)
    missing = data.get("_missing_fields")
    if data.get("_financials_balance") is True:
        _set_status("Parsed pasted text — financials balance. ✓")
    elif missing:
        _set_status(f"Parsed, but fields are missing ({', '.join(missing)}). The text layout may not match AD-334.", True)
    else:
        _set_status("Parsed pasted text. Review the diagnostics — financials could not be verified.")


async def parse_files(event=None):
    """Parse uploaded AD-334 PDFs locally with pypdf. Nothing is uploaded."""
    input_el = document.querySelector("#pdfInput")
    files = input_el.files if input_el else None
    if files is None or files.length == 0:
        _set_status("Choose one or more PDF statements first.", True)
        return
    _set_status("Loading PDF engine (first run downloads ~300 kB)...")
    try:
        await _ensure_pypdf()
    except Exception:
        _set_status("Could not load the pypdf engine (network blocked?). Paste the statement text instead.", True)
        return

    results = []
    errors = 0
    for i in range(files.length):
        f = files.item(i)
        name = f.name
        if not name.lower().endswith(".pdf"):
            results.append({"_source_file": name, "_error": "Not a PDF file"})
            errors += 1
            continue
        try:
            buf = await f.arrayBuffer()
            text = extract_pdf_text(bytes(buf.to_bytes()))
        except Exception as e:
            results.append({"_source_file": name, "_error": f"Could not open PDF: {e}"})
            errors += 1
            continue
        if not text.strip():
            results.append({"_source_file": name, "_error": "PDF appears to be scanned/image-based. OCR required."})
            errors += 1
            continue
        results.append(parse_les_text(text, name))

    global _last_results
    _last_results = results
    good = [r for r in results if "_error" not in r]
    if good:
        _render_result(good[0])
    _set_status(f"Parsed {len(good)} of {len(results)} file(s)." + (f" {errors} file(s) had errors." if errors else ""))


def _download(filename, content, mime):
    blob = js.Blob.new([content], {"type": mime})
    url = js.URL.createObjectURL(blob)
    a = js.document.createElement("a")
    a.href = url
    a.download = filename
    js.document.body.appendChild(a)
    a.click()
    a.remove()
    js.URL.revokeObjectURL(url)


def download_json(event=None):
    if _last_result is None:
        _set_status("Nothing parsed yet.", True)
        return
    _download("les-parsed.json", json.dumps(_last_result, indent=2), "application/json")


def download_csv(event=None):
    results = _last_results or ([_last_result] if _last_result else None)
    if not results:
        _set_status("Nothing parsed yet.", True)
        return
    rows = result_to_csv_rows(results)
    if not rows:
        _set_status("No flat fields to export.", True)
        return
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=list(rows[0].keys()), extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    _download("les-parsed.csv", out.getvalue(), "text/csv")


def load_sample(event=None):
    box = document.querySelector("#lesRawText")
    if box:
        box.value = SAMPLE_TEXT
    parse_pasted()
    _set_status("Loaded a synthetic (non-real) AD-334 sample — balanced financials.")


def main():
    # Buttons use py-click attributes in the page — PyScript manages the
    # JS↔Python callables for those. Plain addEventListener would pass a
    # borrowed proxy that Pyodide destroys when main() returns.
    _set_status("Upload an AD-334 PDF, or paste statement text. Parsing happens entirely in your browser.")


main()
