export const advertiserIndustryGroups = [
  {
    canonical: "Advertising & Marketing",
    variants: ["Advertising Services", "Marketing Services"],
  },
  {
    canonical: "Business",
    variants: ["Business", "Product/service", "Product/service, Business, Business", "afacere"],
  },
  {
    canonical: "Computer Company",
    variants: ["Computer Company", "Computers & Internet Website"],
  },
  {
    canonical: "Design Services",
    variants: ["Design Services", "Graphic Design"],
  },
  {
    canonical: "Financial Services",
    variants: ["Finance", "Financial Service", "Financial Services"],
  },
  {
    canonical: "Human Resources Services",
    variants: ["Professional Training and Coaching", "Human Resources Services"],
  },
  {
    canonical: "Information Technology & Services",
    variants: [
      "Information Technology & Services",
      "IT Services and IT Consulting",
      "IT System Custom Software Development",
      "IT System Data Services",
    ],
  },
  {
    canonical: "Media & Entertainment",
    variants: ["Entertainment Providers", "Media & Entertainment", "Media Production", "Music"],
  },
  {
    canonical: "Professional Services",
    variants: ["Business Consulting and Services", "Professional Services"],
  },
  {
    canonical: "Software Development",
    variants: ["Software", "Software Development"],
  },
  {
    canonical: "Technology",
    variants: ["Technology", "Science & Tech", "Technology, Information and Internet"],
  },
] as const;

function buildAdvertiserIndustryKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const advertiserIndustryCanonicalByKey = new Map<string, string>();

for (const group of advertiserIndustryGroups) {
  for (const variant of group.variants) {
    advertiserIndustryCanonicalByKey.set(buildAdvertiserIndustryKey(variant), group.canonical);
  }
}

export function normalizeAdvertiserIndustry(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return advertiserIndustryCanonicalByKey.get(buildAdvertiserIndustryKey(trimmedValue)) ?? trimmedValue;
}

export function normalizeAdvertiserIndustryOptions(values: Iterable<string | null | undefined>) {
  return [...new Set(
    Array.from(values)
      .map((value) => normalizeAdvertiserIndustry(value))
      .flatMap((value) => (value ? [value] : [])),
  )].sort((left, right) => left.localeCompare(right));
}
