"""The three decisions the enrichment lane would hand to a decision model.

Shared by run_laya.py and run_haiku.py so both models answer EXACTLY the same
question over EXACTLY the same state; otherwise the comparison measures the
prompt, not the model.

Industry criteria are NACE sections because the provider feed labels rows
with NACE codes, which gives the industry question real ground truth on
that sample (label_industry in provider-sample.jsonl). gt_industries is the
canonical taxonomy in the product (migration 194); mapping NACE sections onto
it is a seed decision, not this trial's.
"""

INDUSTRY = {
    "agriculture": "farming, fishing, forestry, agri inputs, seeds, crop advisory",
    "mining": "mining, quarrying, minerals",
    "manufacturing": "makes physical goods: pharma, chemicals, machinery, textiles, food processing, electronics",
    "energy": "electricity, gas, solar, power generation and supply",
    "water_waste": "water supply, sewerage, waste management, recycling",
    "construction": "builders, civil works, infrastructure contractors, real-estate development",
    "wholesale_retail": "trading, distribution, dealers, importers, exporters, shops, e-commerce sellers",
    "transport_storage": "logistics, freight, courier, warehousing, shipping, travel operators",
    "accommodation_food": "hotels, restaurants, catering, cafes",
    "information_communication": "software, IT services, SaaS, telecom, media, publishing, web and app development",
    "finance_insurance": "banks, NBFCs, lending, payments, fintech, insurance, investment",
    "real_estate": "property sales, leasing, brokerage, property management",
    "professional_scientific": "consultants, chartered accountants, law firms, architects, engineering design, R&D, advertising, market research",
    "administrative_support": "staffing, recruitment, BPO, call centres, facility management, security services, travel agencies",
    "public_administration": "government bodies and departments",
    "education": "schools, colleges, coaching, training, edtech, e-learning",
    "health_social": "hospitals, clinics, diagnostics, telemedicine, care services",
    "arts_recreation": "sports, entertainment, events, gaming, arts",
    "other_services": "associations, chambers, NGOs, repair services, personal services, or nothing above fits",
}

def state_for(row: dict) -> str:
    """The text both models see. Only what a delivery carries; no crawl."""
    parts = [f"Company name: {row.get('name') or ''}"]
    if row.get("domain"):
        parts.append(f"Website domain: {row['domain']}")
    if row.get("email"):
        parts.append(f"Email: {row['email']}")
    if row.get("industry_raw"):
        parts.append(f"Business (as written in the directory): {row['industry_raw']}")
    if row.get("description"):
        parts.append(f"Description (from the data provider): {row['description']}")
    if row.get("city"):
        parts.append(f"City: {row['city']}")
    return "\n".join(parts)

def laya_questions(row: dict) -> dict:
    q = {
        "industry": {
            "type": "choice",
            "instructions": "Which industry section best describes what this company does?",
            "criteria": INDUSTRY,
        },
        "is_company": {
            "type": "noul",
            "instructions": "Is the company name an actual organisation, rather than a person's name, a category label, or a search phrase?",
            "criteria": {
                "false": "a person's name, a generic category like 'Software companies in Pune', a placeholder, or gibberish",
                "true": "a real organisation's name",
            },
        },
    }
    if row.get("domain"):
        q["domain_match"] = {
            "type": "noul",
            "instructions": "Does the website domain plausibly belong to this company, judging from the name and the domain alone?",
            "criteria": {
                "false": "the domain is a mailbox provider, an unrelated brand, or does not fit the company name",
                "true": "the domain is this company's own or a plausible abbreviation of its name",
            },
        }
    return q

# The same three questions, phrased for a generating model. Answer keys and
# option names are identical so score.py can compare them cell for cell.
HAIKU_SCHEMA = {
    "type": "object",
    "properties": {
        "industry": {"type": "string", "enum": list(INDUSTRY.keys())},
        "is_company": {"type": "boolean"},
        "domain_match": {"type": ["boolean", "null"]},
    },
    "required": ["industry", "is_company", "domain_match"],
    "additionalProperties": False,
}

def haiku_prompt(row: dict) -> str:
    opts = "\n".join(f"- {k}: {v}" for k, v in INDUSTRY.items())
    dm = ("domain_match: does the website domain plausibly belong to this company, judging from the name and the domain alone? "
          "true / false." if row.get("domain") else "domain_match: null (no domain given).")
    return (
        "You classify one company record from a business directory. Answer the three questions as JSON.\n\n"
        f"RECORD\n{state_for(row)}\n\n"
        "QUESTIONS\n"
        f"industry: which industry section best describes what this company does? One of:\n{opts}\n"
        "is_company: is the company name an actual organisation, rather than a person's name, a category label or a search phrase? true / false.\n"
        f"{dm}\n"
    )
