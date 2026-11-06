"""Generate the deterministic synthetic AP dataset as CSVs in data/.

Single line item per document (architecture Section 2): header == line level.
Run: python -m app.seed [output_dir]
"""
import random
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

VENDORS = [
    ("V001", "Apex Bulk Industrial Supplies"),
    ("V002", "Midwest Paper & Packaging Corp"),
    ("V003", "Acme Wholesale Suppy"),  # master-data spelling; invoice says "Supply" (seeded)
    ("V004", "Continental Fasteners & Steel LLC"),
    ("V005", "Great Lakes Chemical Distribution"),
    ("V006", "Cascade Logistics & Drayage Inc"),
    ("V007", "Summit Electronics Wholesale Ltd"),
    ("V008", "Pinnacle Safety Equipment Co"),
    ("V009", "Tri-State Uniform & Linen Supply"),
    ("V010", "Harbor Point Food Service"),
    ("V011", "Redwood Office Products"),
    ("V012", "Keystone Industrial Tools"),
]
VNAME = dict(VENDORS)

# (invoice_number, vendor_id, po_number, po_date, invoice_date, po_qty, po_amount,
#  inv_qty, inv_amount, grn_qty (None = no GRN), grn_notes, invoice_vendor_name_override)
SEEDED = [
    ("INV-2026-9041", "V001", "PO-77210", "2026-10-15", "2026-11-02", 350, 24500.00, 350, 24500.00, 350, "", None),
    ("INV-88204", "V002", "PO-77194", "2026-10-20", "2026-11-03", 250, 10000.00, 250, 10450.00, 250, "", None),
    ("INV-61208", "V003", "PO-77340", "2026-10-22", "2026-11-04", 100, 14200.00, 100, 14200.00, 100, "", "Acme Wholesale Supply"),
    ("INV-43019", "V004", "PO-77402", "2026-10-24", "2026-10-18", 800, 18750.00, 800, 18750.00, 800, "", None),
    ("INV-72901", "V005", "PO-77488", "2026-10-14", "2026-11-01", 500, 38500.00, 500, 38500.00, 460, "", None),
    ("INV-33981", "V006", "PO-77519", "2026-10-25", "2026-11-04", 4, 6800.00, 4, 6800.00, None, "", None),
    ("INV-55102", "V007", "PO-77620", "2026-10-28", "2026-11-05", 100, 20000.00, 100, 21600.00, 120,
     "120 units @ $180 special bulk tier = $21,600.00", None),
    ("INV-19042", "V008", "PO-77088", "2026-10-12", "2026-10-30", 70, 4200.00, 70, 4320.00, 70, "", None),
    ("INV-80912", "V009", "PO-76901", "2026-10-26", "2026-10-25", 50, 1450.00, 50, 1450.00, 50, "", None),
    # stale invoice (> 90 days old at the as-of date)
    ("INV-10077", "V010", "PO-76500", "2026-07-01", "2026-07-20", 120, 3600.00, 120, 3600.00, 120, "", None),
    # within tolerance (1.0% over) -> must stay clean
    ("INV-20999", "V011", "PO-77700", "2026-10-10", "2026-10-20", 200, 5000.00, 200, 5050.00, 200, "", None),
]


def build(seed: int = 42):
    rng = random.Random(seed)
    vendors = pd.DataFrame(VENDORS, columns=["vendor_id", "name"])
    pos, grns, invs = [], [], []
    grn_n = 99000

    def add(inv_no, vid, po_no, po_date, inv_date, po_qty, po_amt, inv_qty, inv_amt, grn_qty, notes, inv_vendor):
        nonlocal grn_n
        pos.append((po_no, vid, po_date, po_qty, po_amt))
        if grn_qty is not None:
            grn_n += 1
            grn_no = "GRN-99411" if inv_no == "INV-55102" else f"GRN-{grn_n}"
            grns.append((grn_no, po_no, inv_date if inv_date > po_date else po_date, grn_qty, notes))
        invs.append((f"I{len(invs) + 1:04d}", inv_no, vid, inv_vendor or VNAME[vid], po_no, inv_date, inv_qty, inv_amt))

    for row in SEEDED:
        add(*row)
    # exact duplicate of the first invoice, re-submitted later (same vendor, number, amount)
    invs.append((f"I{len(invs) + 1:04d}", "INV-2026-9041", "V001", VNAME["V001"], "PO-77210", "2026-11-05", 350, 24500.00))

    base = date(2026, 9, 15)
    for i in range(30):
        vid = rng.choice(VENDORS)[0]
        po_date = base + timedelta(days=rng.randint(0, 35))
        inv_date = min(po_date + timedelta(days=rng.randint(3, 14)), date(2026, 11, 5))
        qty = rng.choice([20, 40, 50, 60, 80, 100, 150, 200, 300])
        unit = rng.choice([12.5, 18, 24, 36.5, 45, 60, 85, 120])
        po_amt = round(qty * unit, 2)
        inv_amt = round(po_amt * (1 + rng.uniform(-0.015, 0.015)), 2)
        add(f"INV-{20001 + i}", vid, f"PO-{78001 + i}", po_date.isoformat(), inv_date.isoformat(),
            qty, po_amt, qty, inv_amt, qty, "", None)

    return {
        "vendors": vendors,
        "purchase_orders": pd.DataFrame(pos, columns=["po_number", "vendor_id", "po_date", "quantity", "amount"]),
        "goods_receipts": pd.DataFrame(grns, columns=["grn_number", "po_number", "receipt_date", "quantity_received", "notes"]),
        "invoices": pd.DataFrame(invs, columns=["invoice_id", "invoice_number", "vendor_id", "vendor_name",
                                                "po_number", "invoice_date", "quantity", "amount"]),
    }


def write(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, df in build().items():
        df.to_csv(out_dir / f"{name}.csv", index=False)


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "data"
    write(target)
    print(f"wrote dataset to {target}")
