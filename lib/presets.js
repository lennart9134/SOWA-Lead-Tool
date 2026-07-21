// ICP-Presets — Reps wählen eines aus, statt Filter zu tippen.
// Neue Presets hier ergänzen; sie erscheinen automatisch im Dropdown.

export const PRESETS = {
  "dach-security": {
    label: "DACH · Datenschutz & IT-Security-Entscheider",
    filters: {
      job_titles: [
        "Datenschutzbeauftragter", "Data Protection Officer", "DPO",
        "CISO", "Chief Information Security Officer",
        "Head of IT", "IT-Leiter", "Leiter IT-Sicherheit", "IT Security Manager",
      ],
      locations: ["Germany", "Austria", "Switzerland"],
      headcount_min: 50,
      headcount_max: 5000,
    },
  },
  "dach-legal": {
    label: "DACH · Recht & Compliance",
    filters: {
      job_titles: ["General Counsel", "Legal Counsel", "Justiziar", "Compliance Manager", "Head of Legal", "Datenschutzbeauftragter"],
      locations: ["Germany", "Austria", "Switzerland"],
      headcount_min: 50,
      headcount_max: 5000,
    },
  },
  "dach-finance": {
    label: "DACH · Finance & Risk",
    filters: {
      job_titles: ["CFO", "Head of Finance", "Risk Manager", "Head of Risk", "Compliance Officer"],
      locations: ["Germany", "Austria", "Switzerland"],
      headcount_min: 50,
      headcount_max: 5000,
    },
  },
};

// ICP-Spec → Lead-Finder-Filterform (verifiziert gegen core/pipeline/icp.py).
export function toFilters(spec) {
  const f = {
    company_headcount_min: spec.headcount_min ?? 1,
    company_headcount_max: spec.headcount_max ?? 10000,
  };
  if (spec.job_titles?.length) f.lead_job_title = { include: spec.job_titles, exact_match: false };
  if (spec.seniorities?.length) f.lead_seniority = { include: spec.seniorities };
  if (spec.industries?.length) f.lead_industry = { include: spec.industries };
  if (spec.locations?.length) f.lead_location = { include: spec.locations };
  return f;
}
