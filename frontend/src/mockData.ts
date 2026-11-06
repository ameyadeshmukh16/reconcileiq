import { Case, TimelineEvent, RunSummary } from "./types";

export const INITIAL_RUN_ID = "run-20261106-0842";

export const INITIAL_RUN_SUMMARY: RunSummary = {
  run_id: INITIAL_RUN_ID,
  started_at: "2026-11-06T08:42:15Z",
  total_cases: 9,
  by_status: {
    awaiting_review: 7,
    approved: 1,
    dismissed: 1,
  },
  by_severity: {
    high: 5,
    medium: 3,
    low: 1,
  },
};

export const MOCK_CASES: Case[] = [
  // 1. duplicate_invoice (rule_engine, provider none, status awaiting_review, templated action)
  {
    case_id: "case-101-dup",
    invoice_number: "INV-2026-9041",
    vendor_name: "Apex Bulk Industrial Supplies",
    po_number: "PO-77210",
    invoice_amount: 24500.0,
    po_amount: 24500.0,
    quantity_billed: 350,
    quantity_received: 350,
    invoice_date: "2026-11-02",
    po_date: "2026-10-15",
    anomaly_type: "duplicate_invoice",
    detection_method: "rule_engine",
    investigation_provider: "none",
    investigation_model: null,
    recommendation_rationale:
      "Voucher VCH-2026-7811 already disbursed $24,500.00 for the identical 350 units under PO-77210 on Oct 28, 2026.",
    evidence: [
      {
        source: "invoice",
        field: "invoice_number",
        value: "INV-2026-9041",
      },
      {
        source: "invoice",
        field: "hash_signature",
        value: "SHA256:4b91f08a9c3e21e909a888c3a1b",
      },
      {
        source: "purchase_order",
        field: "prior_settlement_ref",
        value: "VCH-2026-7811 (Settled 2026-10-28, $24,500.00)",
      },
      {
        source: "goods_receipt",
        field: "grn_number",
        value: "GRN-88410",
      },
    ],
    finding_facts: [
      "Invoice INV-2026-9041 requests payment of $24,500.00 for 350 units of Grade-A hydraulic fluid.",
      "Voucher VCH-2026-7811 settled the identical dollar sum ($24,500.00) and quantity (350 units) on 2026-10-28.",
      "Warehouse dock records show a single delivery receipt GRN-88410; no secondary shipment was logged.",
    ],
    finding_interpretation:
      "Deterministic cryptographic hashing confirms this submission duplicates previously remitted voucher VCH-2026-7811. Rejection is recommended to prevent inadvertent double payment.",
    finding:
      "VERIFIED FACTS:\n• Invoice INV-2026-9041 requests payment of $24,500.00 for 350 units.\n• Voucher VCH-2026-7811 settled the identical sum ($24,500.00) on 2026-10-28.\n• WMS records show a single delivery receipt GRN-88410; no secondary shipment exists.\n\nINTERPRETATION:\nDeterministic cryptographic matching indicates this submission duplicates previously remitted voucher VCH-2026-7811. Rejection is recommended to prevent duplicate disbursement.",
    confidence: "high",
    recommendation: "reject",
    requires_human_approval: true,
    suggested_action:
      "REJECTION NOTICE [TEMPLATED]:\nTo: accounts.receivable@apexindustrial.com\nSubject: Duplicate Submission Notice - INV-2026-9041 / PO-77210\n\nPlease note that invoice INV-2026-9041 ($24,500.00) matches previously disbursed voucher VCH-2026-7811 settled via ACH on 2026-10-28. This invoice is cancelled in our AP register.",
    status: "awaiting_review",
    flagged_at: "2026-11-06T08:42:19Z",
    resolved_at: null,
    resolved_by: null,
    resolution_reason: null,
    run_id: INITIAL_RUN_ID,
    severity: "high",
  },

  // 2. amount_mismatch (invoice 10,450 vs PO 10,000)
  {
    case_id: "case-102-amt",
    invoice_number: "INV-88204",
    vendor_name: "Midwest Paper & Packaging Corp",
    po_number: "PO-77194",
    invoice_amount: 10450.0,
    po_amount: 10000.0,
    quantity_billed: 250,
    quantity_received: 250,
    invoice_date: "2026-11-03",
    po_date: "2026-10-20",
    anomaly_type: "amount_mismatch",
    detection_method: "agent_investigation",
    investigation_provider: "vultr",
    investigation_model: "deepseek-v4.1-flash-1017",
    recommendation_rationale:
      "Contract MSA §4.2 prohibits unapproved ancillary fuel fees; reject the $450.00 surcharge while honoring the $10,000.00 PO baseline.",
    evidence: [
      {
        source: "invoice",
        field: "line_items",
        value: [
          { item: "Corrugated Cartons 24x18", amount: 10000.0 },
          { item: "Q4 Fuel & Energy Surcharge", amount: 450.0 },
        ],
      },
      {
        source: "purchase_order",
        field: "authorized_total",
        value: "$10,000.00 (Fixed price contract, no ancillary surcharge clause)",
      },
      {
        source: "goods_receipt",
        field: "quantity_accepted",
        value: "250 bundles received intact (GRN-90112)",
      },
    ],
    finding_facts: [
      "Invoice INV-88204 totals $10,450.00, comprising $10,000.00 base packaging and a $450.00 'Q4 Fuel & Energy Surcharge'.",
      "PO-77194 authorizes a fixed total of $10,000.00 with no ancillary surcharge line.",
      "Contract MSA §4.2 specifies firm fixed pricing inclusive of freight/fuel unless authorized via signed change order.",
    ],
    finding_interpretation:
      "The $450.00 variance (+4.50%) represents an uncontracted fuel surcharge added at billing. Rejecting the fee and requesting a corrected $10,000.00 invoice or $450.00 credit memo is recommended.",
    finding:
      "VERIFIED FACTS:\n• Invoice totals $10,450.00, including an uncontracted $450.00 fuel surcharge.\n• PO-77194 caps authorized expenditure at $10,000.00.\n• MSA §4.2 explicitly disallows ancillary shipping/fuel fees without written change order.\n\nINTERPRETATION:\nThe +$450.00 (+4.50%) variance appears to stem from supplier billing automation applying standard freight indexing. Rejection of the uncontracted fee is recommended.",
    confidence: "high",
    recommendation: "reject",
    requires_human_approval: true,
    suggested_action:
      "DRAFT CORRESPONDENCE:\nTo: billing@midwestpaperpack.com\nSubject: Invoice INV-88204 ($10,450.00) - Unapproved Surcharge Deduction\n\nPO-77194 specifies firm fixed pricing of $10,000.00. Please issue a revised invoice for $10,000.00 or a credit memo for $450.00 to enable release of payment.",
    status: "awaiting_review",
    flagged_at: "2026-11-06T08:42:25Z",
    resolved_at: null,
    resolved_by: null,
    resolution_reason: null,
    run_id: INITIAL_RUN_ID,
    severity: "medium",
  },

  // 3. vendor_name_mismatch ("Acme Wholesale Supply" vs PO vendor "Acme Wholesale Suppy")
  {
    case_id: "case-103-vnd",
    invoice_number: "INV-61208",
    vendor_name: "Acme Wholesale Supply",
    po_number: "PO-77340",
    invoice_amount: 14200.0,
    po_amount: 14200.0,
    quantity_billed: 100,
    quantity_received: 100,
    invoice_date: "2026-11-04",
    po_date: "2026-10-22",
    anomaly_type: "vendor_name_mismatch",
    detection_method: "agent_investigation",
    investigation_provider: "openrouter",
    investigation_model: "nvidia/nemotron-3.5-super-vl:free",
    recommendation_rationale:
      "Master vendor tax ID and bank routing match verified profile #V-4091; request procurement amend the single-letter typo on PO-77340.",
    evidence: [
      {
        source: "invoice",
        field: "legal_entity_name",
        value: "Acme Wholesale Supply",
      },
      {
        source: "invoice",
        field: "tax_id_ein",
        value: "XX-XXX4489 (Matches ERP Vendor #V-4091)",
      },
      {
        source: "purchase_order",
        field: "vendor_name_on_po",
        value: "Acme Wholesale Suppy",
      },
      {
        source: "purchase_order",
        field: "buyer_id",
        value: "Procurement Desk 3 (User: J. Thompson)",
      },
    ],
    finding_facts: [
      "Invoice header states vendor as 'Acme Wholesale Supply' with verified EIN matching master profile #V-4091.",
      "PO-77340 header lists vendor name as 'Acme Wholesale Suppy' (missing letter 'l').",
      "Remit-to address, bank lockbox routing, and phone records on the invoice perfectly match approved vendor profile #V-4091.",
    ],
    finding_interpretation:
      "The string mismatch appears to be a clerical keystroke typo on the internal purchase order header. The investigation explicitly does not allege fraudulent intent or phantom entity activity; an administrative PO amendment is recommended.",
    finding:
      "VERIFIED FACTS:\n• Invoice vendor string is 'Acme Wholesale Supply'; Tax ID matches master profile #V-4091.\n• PO-77340 lists vendor string as 'Acme Wholesale Suppy'.\n• Bank routing and delivery address match master record exactly.\n\nINTERPRETATION:\nThe mismatch appears to be an internal clerical typographical error on the purchase order header. The agent does not allege fraud; requesting procurement amend the header string is recommended.",
    confidence: "medium",
    recommendation: "request_vendor_clarification",
    requires_human_approval: true,
    suggested_action:
      "PROCUREMENT TICKET DRAFT:\nTo: procurement-ops@internal.net\nSubject: Typo Correction: PO-77340 Vendor String\n\nPlease execute an administrative header update on PO-77340 to correct 'Acme Wholesale Suppy' to 'Acme Wholesale Supply' to clear automated 3-way matching.",
    status: "awaiting_review",
    flagged_at: "2026-11-06T08:42:31Z",
    resolved_at: null,
    resolved_by: null,
    resolution_reason: null,
    run_id: INITIAL_RUN_ID,
    severity: "medium",
  },

  // 4. date_anomaly (invoice dated before PO)
  {
    case_id: "case-104-dat",
    invoice_number: "INV-43019",
    vendor_name: "Continental Fasteners & Steel LLC",
    po_number: "PO-77402",
    invoice_amount: 18750.0,
    po_amount: 18750.0,
    quantity_billed: 800,
    quantity_received: 800,
    invoice_date: "2026-10-18",
    po_date: "2026-10-24",
    anomaly_type: "date_anomaly",
    detection_method: "agent_investigation",
    investigation_provider: "vultr",
    investigation_model: "deepseek-v4.1-flash-1017",
    recommendation_rationale:
      "Invoice dated 6 days prior to purchase order creation violates after-the-fact procurement policy AP-POL-403.",
    evidence: [
      {
        source: "invoice",
        field: "invoice_issue_date",
        value: "2026-10-18 (Shipment commenced 2026-10-17)",
      },
      {
        source: "purchase_order",
        field: "po_creation_date",
        value: "2026-10-24 (Retroactive entry created 6 days post-invoice)",
      },
      {
        source: "goods_receipt",
        field: "dock_receipt_date",
        value: "2026-10-20 (GRN-91204)",
      },
    ],
    finding_facts: [
      "Invoice INV-43019 is dated 2026-10-18 for $18,750.00.",
      "PO-77402 was created on 2026-10-24, exactly 6 calendar days following the invoice date.",
      "Warehouse dock docket GRN-91204 recorded physical intake of all 800 units on 2026-10-20.",
    ],
    finding_interpretation:
      "Documentation indicates materials were ordered and received prior to formal purchase order issuance, constituting maverick spend. Escalation to category procurement management is recommended per Policy AP-POL-403.",
    finding:
      "VERIFIED FACTS:\n• Invoice date (2026-10-18) precedes PO creation date (2026-10-24) by 6 days.\n• Physical goods arrived on 2026-10-20 (GRN-91204).\n• Procurement rule AP-POL-403 requires retroactive spend signoff.\n\nINTERPRETATION:\nThe sequence demonstrates after-the-fact PO creation. Escalation to category leadership for formal policy compliance signoff is recommended.",
    confidence: "high",
    recommendation: "escalate",
    requires_human_approval: true,
    suggested_action:
      "ESCALATION MEMO:\nTo: ap-governance@firm.com\nSubject: Retroactive PO Spend: Continental Fasteners (PO-77402)\n\nGoods were delivered and invoiced prior to purchase order creation on 2026-10-24. Please provide Department VP authorization to release payment under Policy AP-POL-403.",
    status: "awaiting_review",
    flagged_at: "2026-11-06T08:42:38Z",
    resolved_at: null,
    resolved_by: null,
    resolution_reason: null,
    run_id: INITIAL_RUN_ID,
    severity: "high",
  },

  // 5. quantity_mismatch (billed 500, received 460)
  {
    case_id: "case-105-qty",
    invoice_number: "INV-72901",
    vendor_name: "Great Lakes Chemical Distribution",
    po_number: "PO-77488",
    invoice_amount: 38500.0,
    po_amount: 38500.0,
    quantity_billed: 500,
    quantity_received: 460,
    invoice_date: "2026-11-01",
    po_date: "2026-10-14",
    anomaly_type: "quantity_mismatch",
    detection_method: "agent_investigation",
    investigation_provider: "openrouter",
    investigation_model: "nvidia/nemotron-3.5-super-vl:free",
    recommendation_rationale:
      "Dock manifest GRN-10842 documents 40 damaged drums rejected at intake; request a credit memo of $3,080.00.",
    evidence: [
      {
        source: "invoice",
        field: "quantity_billed",
        value: "500 drums @ $77.00/drum = $38,500.00",
      },
      {
        source: "purchase_order",
        field: "quantity_ordered",
        value: "500 drums @ $77.00/drum = $38,500.00",
      },
      {
        source: "goods_receipt",
        field: "dock_inspection_log",
        value: "GRN-10842: 460 drums accepted, 40 drums rejected (puncture/leakage)",
      },
      {
        source: "goods_receipt",
        field: "quantity_net_received",
        value: "460 drums (Shortfall: 40 drums / $3,080.00)",
      },
    ],
    finding_facts: [
      "Invoice INV-72901 charges for 500 drums @ $77.00/drum, totaling $38,500.00.",
      "Warehouse receiving manifest GRN-10842 logs 460 drums accepted and 40 punctured drums rejected at unloading.",
      "Net shortfall equals 40 drums, representing an unearned billing balance of $3,080.00.",
    ],
    finding_interpretation:
      "The vendor billed the original order quantity without accounting for the 40 damaged drums refused at the dock. Requesting vendor clarification and a $3,080.00 credit memo is recommended.",
    finding:
      "VERIFIED FACTS:\n• Invoiced: 500 drums @ $77.00 ($38,500.00).\n• Received at dock: 460 drums accepted, 40 drums rejected (GRN-10842).\n• Variance: 40 drums ($3,080.00 unearned balance).\n\nINTERPRETATION:\nThe vendor invoiced the full contracted order without factoring in dock rejection notes. Requesting a credit memo of $3,080.00 prior to final disbursement is recommended.",
    confidence: "high",
    recommendation: "request_vendor_clarification",
    requires_human_approval: true,
    suggested_action:
      "CREDIT MEMO REQUEST:\nTo: ar-team@greatlakeschemical.com\nSubject: Receiving Shortfall - INV-72901 / PO-77488\n\nDock manifest GRN-10842 verified intake of 460 drums, with 40 damaged drums rejected. Please furnish a Credit Memo of $3,080.00 or revised invoice of $35,420.00.",
    status: "awaiting_review",
    flagged_at: "2026-11-06T08:42:44Z",
    resolved_at: null,
    resolved_by: null,
    resolution_reason: null,
    run_id: INITIAL_RUN_ID,
    severity: "high",
  },

  // 6. missing_evidence (no GRN, quantity_received null, agent escalates, confidence low)
  {
    case_id: "case-106-grn",
    invoice_number: "INV-33981",
    vendor_name: "Cascade Logistics & Drayage Inc",
    po_number: "PO-77519",
    invoice_amount: 6800.0,
    po_amount: 6800.0,
    quantity_billed: 4,
    quantity_received: null,
    invoice_date: "2026-11-04",
    po_date: "2026-10-25",
    anomaly_type: "missing_evidence",
    detection_method: "agent_investigation",
    investigation_provider: "vultr",
    investigation_model: "deepseek-v4.1-flash-1017",
    recommendation_rationale:
      "Zero proof-of-delivery or gate interchange records exist in WMS for the 4 billed drayage moves.",
    evidence: [
      {
        source: "invoice",
        field: "billed_service",
        value: "Dedicated intermodal drayage (4 container turns)",
      },
      {
        source: "purchase_order",
        field: "terms",
        value: "Net 30 upon terminal gate receipt and bill of lading confirmation",
      },
      {
        source: "goods_receipt",
        field: "status",
        value: "NO GOODS RECEIPT ON FILE",
      },
      {
        source: "goods_receipt",
        field: "wms_probe_result",
        value: "Zero delivery receipts logged across Northwest yards 1 through 4",
      },
    ],
    finding_facts: [
      "Invoice INV-33981 bills $6,800.00 for 4 dedicated intermodal container runs.",
      "PO-77519 stipulates payment terms Net 30 upon terminal gate receipt and bill of lading confirmation.",
      "WMS and dock log queries across Yards 1 through 4 returned 0 matching goods receipts or signed interchange dockets.",
    ],
    finding_interpretation:
      "Absence of physical receipt or carrier interchange documentation prevents evidentiary validation. Due to total lack of intake proof, confidence is low and escalation to dock operations is recommended.",
    finding:
      "VERIFIED FACTS:\n• Invoiced amount: $6,800.00 for 4 container movements.\n• Purchase order terms mandate terminal gate receipt confirmation.\n• WMS queries across all 4 terminal yards returned zero matching receiving records.\n\nINTERPRETATION:\nWithout terminal interchange receipts or signed bills of lading, receipt of service cannot be confirmed. Low evidentiary confidence warrants operational escalation.",
    confidence: "low",
    recommendation: "escalate",
    requires_human_approval: true,
    suggested_action:
      "VERIFICATION INQUIRY:\nTo: logistics-dock-ops@firm.com\nSubject: Proof of Delivery Check: Cascade Logistics (PO-77519)\n\nPlease confirm whether containers TGHU-882104 and TGHU-991204 were received at Yard 2, as no receiving dockets are currently registered in WMS.",
    status: "awaiting_review",
    flagged_at: "2026-11-06T08:42:50Z",
    resolved_at: null,
    resolved_by: null,
    resolution_reason: null,
    run_id: INITIAL_RUN_ID,
    severity: "high",
  },

  // 7. INV-55102: Over-receipt (+20 units), PO 100, Invoice 100, GRN 120, GRN-99411
  {
    case_id: "case-107-cnt",
    invoice_number: "INV-55102",
    vendor_name: "Summit Electronics Wholesale Ltd",
    po_number: "PO-77620",
    invoice_amount: 21600.0,
    po_amount: 20000.0,
    quantity_billed: 100,
    quantity_received: 120,
    invoice_date: "2026-11-05",
    po_date: "2026-10-28",
    anomaly_type: "amount_mismatch",
    detection_method: "agent_investigation",
    investigation_provider: "openrouter",
    investigation_model: "nvidia/nemotron-3.5-super-vl:free",
    recommendation_rationale:
      "Physical dock intake GRN-99411 shows an over-receipt of 20 units at an uncontracted bulk tier rate ($180/unit), conflicting with PO-77620 terms.",
    evidence: [
      {
        source: "invoice",
        field: "line_calculation",
        value: "100 industrial controllers @ $216.00/unit = $21,600.00",
      },
      {
        source: "purchase_order",
        field: "contracted_schedule",
        value: "100 industrial controllers @ $200.00/unit = $20,000.00",
      },
      {
        source: "goods_receipt",
        field: "grn_number",
        value: "GRN-99411",
      },
      {
        source: "goods_receipt",
        field: "manifest_count",
        value: "120 units received intact on docket GRN-99411 (+20 surplus units)",
      },
      {
        source: "goods_receipt",
        field: "packing_slip_memo",
        value: "120 units @ $180 special bulk tier = $21,600.00 (GRN-99411)",
      },
    ],
    finding_facts: [
      "Invoice INV-55102 bills for 100 units @ $216.00/unit, totaling $21,600.00.",
      "PO-77620 authorizes 100 units @ $200.00/unit, capping total spend at $20,000.00.",
      "Goods Receipt GRN-99411 documents receiving of 120 units (+20 unit surplus) with packing slip memo indicating a $180.00/unit bulk tier equaling $21,600.00.",
    ],
    finding_interpretation:
      "Physical receiving confirms an over-receipt of 20 units with a lower unit price matching total invoice dollars ($21,600.00); escalation is recommended to reconcile the unapproved tier rate and surplus inventory before disbursement.",
    finding:
      "VERIFIED FACTS:\n• Invoice: 100 units @ $216.00 = $21,600.00.\n• Purchase Order: 100 units @ $200.00 = $20,000.00.\n• Goods Receipt GRN-99411: 120 units received (+20 unit over-receipt) @ $180.00 = $21,600.00.\n\nINTERPRETATION:\nPhysical receiving logs an over-receipt of 20 units where total dollars match ($21,600.00) but unit pricing and inventory quantities diverge from the purchase order. Escalation to procurement is recommended to formalize terms prior to approval.",
    confidence: "low",
    recommendation: "escalate",
    requires_human_approval: true,
    suggested_action:
      "AUDIT ESCALATION BRIEF:\nTo: ap-audit-committee@firm.com, procurement-manager@firm.com\nSubject: Over-receipt & Pricing Discrepancy on Summit Electronics (PO-77620)\n\nDock manifest GRN-99411 logged 120 units (+20 units over PO-77620). Invoice bills $21,600.00 for 100 units. Please confirm whether procurement accepts the 20 surplus units under the $180 bulk tier rate.",
    status: "awaiting_review",
    flagged_at: "2026-11-06T08:42:55Z",
    resolved_at: null,
    resolved_by: null,
    resolution_reason: null,
    run_id: INITIAL_RUN_ID,
    severity: "high",
  },

  // 8. already "approved" case with resolved_by / resolution_reason
  {
    case_id: "case-108-app",
    invoice_number: "INV-19042",
    vendor_name: "Pinnacle Safety Equipment Co",
    po_number: "PO-77088",
    invoice_amount: 4280.0,
    po_amount: 4200.0,
    quantity_billed: 70,
    quantity_received: 70,
    invoice_date: "2026-10-30",
    po_date: "2026-10-12",
    anomaly_type: "amount_mismatch",
    detection_method: "agent_investigation",
    investigation_provider: "vultr",
    investigation_model: "deepseek-v4.1-flash-1017",
    recommendation_rationale:
      "Variance of $80.00 (1.9%) for certified HazMat PPE handling falls within the permissible 2.0% corporate tolerance threshold.",
    evidence: [
      {
        source: "invoice",
        field: "variance_item",
        value: "Certified HazMat packaging container fee: $80.00",
      },
      {
        source: "purchase_order",
        field: "tolerance_rule",
        value: "Corporate Tolerance Policy allows up to 2.0% for hazardous materials shipping",
      },
      {
        source: "goods_receipt",
        field: "compliance_certificate",
        value: "OSHA HazMat certificate logged on GRN-87612",
      },
    ],
    finding_facts: [
      "Invoice INV-19042 totals $4,280.00, comprising $4,200.00 PPE equipment and an $80.00 certified HazMat handling fee.",
      "PO-77088 specifies base amount of $4,200.00.",
      "Corporate AP Tolerance Policy §7.1 permits up to 2.0% ($84.00 max) for certified hazardous materials logistics with dock verification.",
    ],
    finding_interpretation:
      "The $80.00 variance (+1.90%) is supported by OSHA packaging certification on GRN-87612 and satisfies tolerance criteria. Approval is recommended.",
    finding:
      "VERIFIED FACTS:\n• Invoiced total: $4,280.00 ($4,200.00 base + $80.00 HazMat fee).\n• Authorized PO: $4,200.00.\n• Corporate policy §7.1 allows up to 2.0% tolerance for HazMat logistics.\n\nINTERPRETATION:\nThe +$80.00 variance complies with allowable policy tolerances and is substantiated by dock intake certificates. Approval is recommended.",
    confidence: "high",
    recommendation: "approve",
    requires_human_approval: true,
    suggested_action:
      "APPROVAL MEMO: Approve voucher for $4,280.00; $80 HazMat fee verified under Corporate AP Policy §7.1.",
    status: "approved",
    flagged_at: "2026-11-04T09:12:00Z",
    resolved_at: "2026-11-04T14:22:10Z",
    resolved_by: "Elena Rostova (Senior AP Lead)",
    resolution_reason:
      "Contract schedule B authorizes +$80 HAZMAT handling fee for certified PPE deliveries. Variance of $80.00 (1.9%) is within approved 2% tolerance threshold, and dock inspection verified OSHA compliant packaging.",
    run_id: INITIAL_RUN_ID,
    severity: "low",
  },

  // 9. already "dismissed" case
  {
    case_id: "case-109-dsm",
    invoice_number: "INV-80912",
    vendor_name: "Tri-State Uniform & Linen Supply",
    po_number: "PO-76901",
    invoice_amount: 1450.0,
    po_amount: 1450.0,
    quantity_billed: 50,
    quantity_received: 50,
    invoice_date: "2026-10-25",
    po_date: "2026-10-26",
    anomaly_type: "date_anomaly",
    detection_method: "agent_investigation",
    investigation_provider: "openrouter",
    investigation_model: "nvidia/nemotron-3.5-super-vl:free",
    recommendation_rationale:
      "Date variance is an administrative timezone artifact (UTC+12 vendor timestamp vs UTC-5 buyer ERP) with no maverick purchasing.",
    evidence: [
      {
        source: "invoice",
        field: "system_timestamp",
        value: "2026-10-25T23:45:00Z (Vendor system in UTC+12 New Zealand time)",
      },
      {
        source: "purchase_order",
        field: "system_timestamp",
        value: "2026-10-26T02:15:00Z (Buyer ERP in US Eastern UTC-5)",
      },
      {
        source: "goods_receipt",
        field: "delivery_timestamp",
        value: "2026-10-29T10:00:00Z (GRN-86510)",
      },
    ],
    finding_facts: [
      "Invoice displays date 2026-10-25 with UTC+12 New Zealand system billing stamp.",
      "PO-76901 displays date 2026-10-26 with US Eastern (UTC-5) ERP timestamp.",
      "Delivery dock docket GRN-86510 confirms fulfillment on 2026-10-29.",
    ],
    finding_interpretation:
      "Normalization of UTC timestamps confirms the transaction occurred during regular procurement business hours with no advance shipping violation. Dismissing the flag and releasing payment is recommended.",
    finding:
      "VERIFIED FACTS:\n• Invoiced timestamp is UTC+12 (2026-10-25 23:45Z).\n• PO authorization timestamp is UTC-5 (2026-10-26 02:15Z).\n• Real-world chronological order was maintained without pre-PO shipment.\n\nINTERPRETATION:\nThe 1-day variance reflects system timezone recording across international offices rather than unauthorized spend. Dismissal of the exception flag is recommended.",
    confidence: "high",
    recommendation: "approve",
    requires_human_approval: true,
    suggested_action:
      "RESOLUTION NOTE: Dismiss date precedence flag as timezone artifact. Release payment in next Net 30 batch.",
    status: "dismissed",
    flagged_at: "2026-11-03T08:30:00Z",
    resolved_at: "2026-11-03T11:05:44Z",
    resolved_by: "Marcus Vance (Staff Auditor)",
    resolution_reason:
      "Verified that vendor operates on UTC+12 billing stamp resulting in nominal 1-day date skew against EST purchase order timestamp. Service completion logs confirm delivery timing was compliant.",
    run_id: INITIAL_RUN_ID,
    severity: "low",
  },
];

export const MOCK_TIMELINES: Record<string, TimelineEvent[]> = {
  "case-101-dup": [
    {
      ts: "2026-11-06T08:42:15.102Z",
      actor: "rule_engine",
      type: "rule_check",
      summary: "Rule engine flagged duplicate hash fingerprint against prior settlements",
      detail: {
        raw_invoice_number: "INV-2026-9041",
        vendor_id: "V-10928",
        claimed_amount: 24500.0,
      },
    },
    {
      ts: "2026-11-06T08:42:16.050Z",
      actor: "rule_engine",
      type: "tool_call",
      summary: "Executed tool: get_invoice(invoice_number='INV-2026-9041')",
      detail: {
        tool: "get_invoice",
        parameters: { invoice_number: "INV-2026-9041", vendor_code: "V-10928" },
        result: {
          invoice_id: "INV-2026-9041",
          items: [{ sku: "HYD-FL-A", qty: 350, unit_price: 70.0 }],
          total: 24500.0,
        },
      },
    },
    {
      ts: "2026-11-06T08:42:17.210Z",
      actor: "rule_engine",
      type: "tool_call",
      summary: "Executed tool: check_policy(policy_id='AP-RULE-DUP-01')",
      detail: {
        tool: "check_policy",
        parameters: { hash_check: true, match_window_days: 90 },
        result: {
          duplicate_found: true,
          match_invoice: "INV-2026-8912",
          payment_voucher: "VCH-2026-7811",
          settlement_date: "2026-10-28",
        },
      },
    },
    {
      ts: "2026-11-06T08:42:19.004Z",
      actor: "rule_engine",
      type: "status_change",
      summary: "Set status to awaiting_review with rejection recommendation",
      detail: {
        anomaly_type: "duplicate_invoice",
        severity: "high",
        recommendation: "reject",
      },
    },
  ],

  "case-102-amt": [
    {
      ts: "2026-11-06T08:42:15.800Z",
      actor: "rule_engine",
      type: "rule_check",
      summary: "Rule engine flagged amount variance 4.5% > 0.5% contract tolerance",
      detail: {
        invoice_total: 10450.0,
        po_total: 10000.0,
        variance_pct: 4.5,
      },
    },
    {
      ts: "2026-11-06T08:42:16.200Z",
      actor: "agent",
      type: "status_change",
      summary: "Agent investigation triggered via vultr / deepseek-v4.1-flash-1017",
      detail: {
        provider: "vultr",
        model: "deepseek-v4.1-flash-1017",
      },
    },
    {
      ts: "2026-11-06T08:42:18.115Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: get_invoice(invoice_number='INV-88204')",
      detail: {
        tool: "get_invoice",
        parameters: { invoice_number: "INV-88204" },
        result: {
          vendor: "Midwest Paper & Packaging Corp",
          lines: [
            { desc: "Corrugated Cartons", subtotal: 10000.0 },
            { desc: "Q4 Fuel & Energy Surcharge", subtotal: 450.0 },
          ],
          total: 10450.0,
        },
      },
    },
    {
      ts: "2026-11-06T08:42:19.890Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: get_po(po_number='PO-77194')",
      detail: {
        tool: "get_po",
        parameters: { po_number: "PO-77194" },
        result: {
          po_number: "PO-77194",
          total_authorized: 10000.0,
          ancillary_clauses: [],
        },
      },
    },
    {
      ts: "2026-11-06T08:42:21.430Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: check_policy(clause='MSA-SECTION-4.2')",
      detail: {
        tool: "check_policy",
        parameters: { vendor: "Midwest Paper & Packaging Corp", clause: "4.2" },
        result: {
          contract_type: "Firm Fixed Price",
          fuel_surcharge_eligible: false,
        },
      },
    },
    {
      ts: "2026-11-06T08:42:25.100Z",
      actor: "agent",
      type: "status_change",
      summary: "Investigation complete. Recommended rejection of uncontracted surcharge.",
      detail: {
        confidence: "high",
        recommendation: "reject",
      },
    },
  ],

  "case-103-vnd": [
    {
      ts: "2026-11-06T08:42:19.400Z",
      actor: "rule_engine",
      type: "rule_check",
      summary: "Rule engine flagged vendor name character distance mismatch (Levenshtein = 1)",
      detail: {
        invoice_vendor: "Acme Wholesale Supply",
        po_vendor: "Acme Wholesale Suppy",
      },
    },
    {
      ts: "2026-11-06T08:42:20.100Z",
      actor: "agent",
      type: "status_change",
      summary: "Agent investigation triggered via openrouter / nvidia/nemotron-3.5-super-vl:free",
      detail: {
        provider: "openrouter",
        model: "nvidia/nemotron-3.5-super-vl:free",
      },
    },
    {
      ts: "2026-11-06T08:42:22.400Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: get_invoice(invoice_number='INV-61208')",
      detail: {
        tool: "get_invoice",
        parameters: { invoice_number: "INV-61208" },
        result: {
          vendor_string: "Acme Wholesale Supply",
          tax_id: "XX-XXX4489",
        },
      },
    },
    {
      ts: "2026-11-06T08:42:24.710Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: check_policy(rule='VENDOR_MASTER_VERIFICATION')",
      detail: {
        tool: "check_policy",
        parameters: { tax_id: "XX-XXX4489" },
        result: {
          master_vendor_id: "V-4091",
          lockbox_confirmed: true,
          shell_entity_risk: "low",
        },
      },
    },
    {
      ts: "2026-11-06T08:42:31.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Formulated finding: No fraud concluded; request administrative PO amendment.",
      detail: {
        recommendation: "request_vendor_clarification",
      },
    },
  ],

  "case-104-dat": [
    {
      ts: "2026-11-06T08:42:24.100Z",
      actor: "rule_engine",
      type: "rule_check",
      summary: "Rule engine flagged date anomaly: invoice precedes purchase order creation",
      detail: { invoice_date: "2026-10-18", po_date: "2026-10-24" },
    },
    {
      ts: "2026-11-06T08:42:25.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Agent investigation triggered via vultr / deepseek-v4.1-flash-1017",
      detail: { provider: "vultr", model: "deepseek-v4.1-flash-1017" },
    },
    {
      ts: "2026-11-06T08:42:28.100Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: get_invoice(invoice_number='INV-43019')",
      detail: {
        tool: "get_invoice",
        parameters: { invoice_number: "INV-43019" },
        result: { invoice_date: "2026-10-18", amount: 18750.0 },
      },
    },
    {
      ts: "2026-11-06T08:42:33.400Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: check_policy(policy_id='AP-POL-403')",
      detail: {
        tool: "check_policy",
        parameters: { policy: "AP-POL-403", days_preceding: 6 },
        result: {
          compliant: false,
          maverick_spend: true,
          requires_vp_signoff: true,
        },
      },
    },
    {
      ts: "2026-11-06T08:42:38.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Recommended escalation for retroactive spend governance",
      detail: { recommendation: "escalate", severity: "high" },
    },
  ],

  "case-105-qty": [
    {
      ts: "2026-11-06T08:42:29.500Z",
      actor: "rule_engine",
      type: "rule_check",
      summary: "Rule engine flagged quantity mismatch: 500 billed vs 460 accepted",
      detail: { billed: 500, accepted: 460, diff: -40 },
    },
    {
      ts: "2026-11-06T08:42:30.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Agent investigation triggered via openrouter / nvidia/nemotron-3.5-super-vl:free",
      detail: { provider: "openrouter", model: "nvidia/nemotron-3.5-super-vl:free" },
    },
    {
      ts: "2026-11-06T08:42:36.500Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: get_goods_receipt(po_number='PO-77488')",
      detail: {
        tool: "get_goods_receipt",
        parameters: { po_number: "PO-77488" },
        result: {
          grn_number: "GRN-10842",
          accepted_net: 460,
          rejected: 40,
        },
      },
    },
    {
      ts: "2026-11-06T08:42:39.100Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: check_policy(rule='CREDIT_MEMO_THRESHOLD')",
      detail: {
        tool: "check_policy",
        parameters: { shortfall_qty: 40, rate: 77.0 },
        result: { credit_due: 3080.0, hold_payment: true },
      },
    },
    {
      ts: "2026-11-06T08:42:44.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Formulated credit memo request for 40 short drums",
      detail: { recommendation: "request_vendor_clarification" },
    },
  ],

  "case-106-grn": [
    {
      ts: "2026-11-06T08:42:34.200Z",
      actor: "rule_engine",
      type: "rule_check",
      summary: "Rule engine flagged missing documentation: no goods receipt registered",
      detail: { po_number: "PO-77519", grn_found: false },
    },
    {
      ts: "2026-11-06T08:42:35.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Agent investigation triggered via vultr / deepseek-v4.1-flash-1017",
      detail: { provider: "vultr", model: "deepseek-v4.1-flash-1017" },
    },
    {
      ts: "2026-11-06T08:42:41.500Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: get_goods_receipt(po_number='PO-77519')",
      detail: {
        tool: "get_goods_receipt",
        parameters: { po_number: "PO-77519" },
        result: { status: "NOT_FOUND", records_found: 0 },
      },
    },
    {
      ts: "2026-11-06T08:42:45.000Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: check_policy(policy_id='AP-EVID-002')",
      detail: {
        tool: "check_policy",
        parameters: { requirement: "goods_receipt_mandatory" },
        result: { can_auto_resolve: false, requires_escalation: true },
      },
    },
    {
      ts: "2026-11-06T08:42:50.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Escalated due to complete absence of receiving evidence",
      detail: { recommendation: "escalate", confidence: "low" },
    },
  ],

  // 7. INV-55102: Must include Rule engine flagged amount variance 8.0% > 2.0% tolerance, check_policy, etc.
  "case-107-cnt": [
    {
      ts: "2026-11-06T08:42:39.100Z",
      actor: "rule_engine",
      type: "rule_check",
      summary: "Rule engine flagged amount variance 8.0% > 2.0% tolerance",
      detail: {
        invoice_total: 21600.0,
        po_total: 20000.0,
        variance_dollars: 1600.0,
        variance_percentage: 8.0,
        tolerance_cap: 2.0,
      },
    },
    {
      ts: "2026-11-06T08:42:40.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Agent investigation triggered via openrouter / nvidia/nemotron-3.5-super-vl:free",
      detail: {
        provider: "openrouter",
        model: "nvidia/nemotron-3.5-super-vl:free",
      },
    },
    {
      ts: "2026-11-06T08:42:43.100Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: get_invoice(invoice_number='INV-55102')",
      detail: {
        tool: "get_invoice",
        parameters: { invoice_number: "INV-55102" },
        result: { billed_qty: 100, billed_rate: 216.0, total: 21600.0 },
      },
    },
    {
      ts: "2026-11-06T08:42:46.300Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: get_po(po_number='PO-77620')",
      detail: {
        tool: "get_po",
        parameters: { po_number: "PO-77620" },
        result: { ordered_qty: 100, contracted_rate: 200.0, total: 20000.0 },
      },
    },
    {
      ts: "2026-11-06T08:42:49.200Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: get_goods_receipt(receipt_ref='GRN-99411')",
      detail: {
        tool: "get_goods_receipt",
        parameters: { receipt_ref: "GRN-99411", po_number: "PO-77620" },
        result: {
          docket: "GRN-99411",
          received_qty: 120,
          surplus_units: 20,
          packing_slip_note: "120 units @ $180 special bulk tier = $21,600.00",
        },
      },
    },
    {
      ts: "2026-11-06T08:42:52.400Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: check_policy(policy_id='AP-OVER-RECEIPT-TOLERANCE')",
      detail: {
        tool: "check_policy",
        parameters: {
          contracted_qty: 100,
          received_qty: 120,
          unit_price_delta: -20.0,
          total_spend_delta: 1600.0,
        },
        result: {
          over_receipt_authorized: false,
          exceeds_po_cap: true,
          action_required: "Escalation to procurement manager",
        },
      },
    },
    {
      ts: "2026-11-06T08:42:55.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Escalated case: physical over-receipt (+20 units) and unapproved tier rate exceed PO cap",
      detail: { recommendation: "escalate", confidence: "low" },
    },
  ],

  "case-108-app": [
    {
      ts: "2026-11-04T09:12:00.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Agent investigation triggered via vultr / deepseek-v4.1-flash-1017",
      detail: { provider: "vultr", model: "deepseek-v4.1-flash-1017" },
    },
    {
      ts: "2026-11-04T09:12:05.100Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: get_invoice(invoice_number='INV-19042')",
      detail: {
        tool: "get_invoice",
        parameters: { invoice_number: "INV-19042" },
        result: { base_amount: 4200.0, hazmat_fee: 80.0, total: 4280.0 },
      },
    },
    {
      ts: "2026-11-04T09:12:11.200Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: check_policy(policy_id='AP-TOLERANCE-7.1')",
      detail: {
        tool: "check_policy",
        parameters: { fee_type: "HazMat", fee_amount: 80.0, pct: 1.9 },
        result: { permitted: true, tolerance_max_pct: 2.0 },
      },
    },
    {
      ts: "2026-11-04T09:12:15.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Agent completed audit: Recommended approval within tolerance threshold",
      detail: { recommendation: "approve", confidence: "high" },
    },
    {
      ts: "2026-11-04T14:22:10.000Z",
      actor: "human",
      type: "decision",
      summary: "Human Auditor Approved Exception (Elena Rostova)",
      detail: {
        decision: "approved",
        actor: "Elena Rostova (Senior AP Lead)",
        reason:
          "Contract schedule B authorizes +$80 HAZMAT handling fee for certified PPE deliveries. Variance of $80.00 (1.9%) is within approved 2% tolerance threshold, and dock inspection verified OSHA compliant packaging.",
      },
    },
  ],

  "case-109-dsm": [
    {
      ts: "2026-11-03T08:30:00.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Agent investigation triggered via openrouter / nvidia/nemotron-3.5-super-vl:free",
      detail: { provider: "openrouter", model: "nvidia/nemotron-3.5-super-vl:free" },
    },
    {
      ts: "2026-11-03T08:30:04.200Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: get_invoice(invoice_number='INV-80912')",
      detail: {
        tool: "get_invoice",
        parameters: { invoice_number: "INV-80912" },
        result: { timezone: "UTC+12 (Auckland)" },
      },
    },
    {
      ts: "2026-11-03T08:30:12.800Z",
      actor: "agent",
      type: "tool_call",
      summary: "Executed tool: check_policy(policy_id='TIMEZONE_NORMALIZATION')",
      detail: {
        tool: "check_policy",
        parameters: { utc_diff_hours: 17 },
        result: { calendar_day_skew_explained: true, maverick: false },
      },
    },
    {
      ts: "2026-11-03T08:30:15.000Z",
      actor: "agent",
      type: "status_change",
      summary: "Agent recommended approval of legitimate date skew",
      detail: { recommendation: "approve", confidence: "high" },
    },
    {
      ts: "2026-11-03T11:05:44.000Z",
      actor: "human",
      type: "decision",
      summary: "Human Auditor Dismissed Flag (Marcus Vance)",
      detail: {
        decision: "dismissed",
        actor: "Marcus Vance (Staff Auditor)",
        reason:
          "Verified that vendor operates on UTC+12 billing stamp resulting in nominal 1-day date skew against EST purchase order timestamp. Service completion logs confirm delivery timing was compliant.",
      },
    },
  ],
};
