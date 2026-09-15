import { loadWorkspaceEnv } from "./load-env";

export type StartupSeverity = "error" | "warning";

export type StartupIssue = {
  label: string;
  message: string;
  missing: string[];
  severity: StartupSeverity;
};

export type StartupValidationReport = {
  target: StartupTarget;
  errors: StartupIssue[];
  warnings: StartupIssue[];
};

type StartupRule = {
  keys: string[];
  oneOf?: string[];
  label: string;
  message: string;
  severity: StartupSeverity;
};

export type StartupTarget = "app" | "site" | "worker";

const loggedTargets = new Set<StartupTarget>();

function getBaseRules(target: StartupTarget): StartupRule[] {
  const rules: StartupRule[] = [
    {
      keys: [],
      oneOf: ["NEXT_PUBLIC_CDN_URL", "CDN_URL"],
      label: "CDN asset host",
      message: "Recommended so stored creative assets resolve to the CDN origin instead of the app origin on both server render and client navigation.",
      severity: "warning",
    },
  ];

  if (target !== "site") {
    rules.unshift({
      keys: ["DATABASE_URL"],
      label: "Database",
      message: "Required for the local MySQL connection used by Drizzle, Better Auth, and the job queue.",
      severity: "error",
    });

    rules.push({
      keys: ["WEBSCRAPINGAPI_API_KEY"],
      label: "WebScrapingAPI",
      message: "Required for public advertiser and ad archive fetching because live source adapters use WebScrapingAPI for page retrieval.",
      severity: "warning",
    });
  }

  return rules;
}

function getTargetRules(target: StartupTarget): StartupRule[] {
  if (target === "worker") {
    return [
      {
        keys: ["B2_ENDPOINT", "B2_BUCKET_NAME", "B2_APPLICATION_KEY_ID", "B2_APPLICATION_KEY"],
        label: "Ad asset object storage",
        message: "Recommended so ad creatives and advertiser logos upload to Backblaze B2 instead of only the local filesystem.",
        severity: "warning",
      },
      {
        keys: ["RESEND_API_KEY", "RESEND_FROM"],
        label: "Email delivery",
        message: "Required for alert email delivery from the worker.",
        severity: "warning",
      },
      {
        keys: ["DISCORD_ERROR_WEBHOOK_URL"],
        label: "Discord error webhook",
        message: "Recommended so ad scraper and advertiser discovery failures are mirrored to Discord.",
        severity: "warning",
      },
    ];
  }

  if (target === "site") {
    return [
      {
        keys: ["BREVO_API_KEY", "BREVO_WAITLIST_LIST_ID"],
        label: "Waitlist signup",
        message: "Required for the public waitlist form to add contacts to Brevo.",
        severity: "error",
      },
      {
        keys: ["DISCORD_WAITLIST_WEBHOOK_URL"],
        label: "Waitlist Discord mirror",
        message: "Optional operational mirror for new waitlist signups after Brevo accepts them.",
        severity: "warning",
      },
    ];
  }

  return [
    {
      keys: ["BETTER_AUTH_URL", "BETTER_AUTH_SECRET"],
      label: "Better Auth",
      message: "Required for local session-backed sign-in, sign-out, and password management.",
      severity: "warning",
    },
    {
      keys: ["CRISP_IDENTITY_VERIFICATION_SECRET"],
      label: "Crisp identity verification",
      message: "Recommended so authenticated support chat users are cryptographically verified in Crisp.",
      severity: "warning",
    },
    {
      keys: ["RESEND_API_KEY", "RESEND_FROM"],
      label: "Email delivery",
      message: "Required for alert email delivery and local end-to-end validation.",
      severity: "warning",
    },
    {
      keys: ["DISCORD_ERROR_WEBHOOK_URL"],
      label: "Discord error webhook",
      message: "Recommended so add advertiser and advertiser discovery failures are mirrored to Discord.",
      severity: "warning",
    },
  ];
}

function findMissingKeys(keys: string[]) {
  return keys.filter((key) => {
    const value = process.env[key];

    return !value || value.trim().length === 0;
  });
}

export function getStartupValidationReport(target: StartupTarget): StartupValidationReport {
  loadWorkspaceEnv();

  const rules = [...getBaseRules(target), ...getTargetRules(target)];
  const errors: StartupIssue[] = [];
  const warnings: StartupIssue[] = [];

  for (const rule of rules) {
    const missing = findMissingKeys(rule.keys);

    if (rule.oneOf) {
      const hasAny = rule.oneOf.some((key) => {
        const value = process.env[key];

        return Boolean(value && value.trim().length > 0);
      });

      if (!hasAny) {
        missing.push(rule.oneOf.join(" or "));
      }
    }

    if (missing.length === 0) {
      continue;
    }

    const issue: StartupIssue = {
      label: rule.label,
      message: rule.message,
      missing,
      severity: rule.severity,
    };

    if (rule.severity === "error") {
      errors.push(issue);
    } else {
      warnings.push(issue);
    }
  }

  return {
    target,
    errors,
    warnings,
  };
}

export function formatStartupValidationReport(report: StartupValidationReport) {
  const lines = [`[startup] ${report.target} environment validation`];

  if (report.errors.length === 0 && report.warnings.length === 0) {
    lines.push("All required and recommended configuration is present.");
    return lines.join("\n");
  }

  for (const issue of [...report.errors, ...report.warnings]) {
    lines.push(
      `- ${issue.severity.toUpperCase()} ${issue.label}: missing ${issue.missing.join(", ")}. ${issue.message}`,
    );
  }

  lines.push(
    "See README.md for local bootstrap steps and MySQL/Better Auth environment requirements.",
  );

  return lines.join("\n");
}

export function validateStartupEnvironment(target: StartupTarget) {
  const report = getStartupValidationReport(target);

  if (!loggedTargets.has(target)) {
    loggedTargets.add(target);

    if (report.warnings.length > 0) {
      console.warn(formatStartupValidationReport({ ...report, errors: [] }));
    }
  }

  if (report.errors.length > 0) {
    throw new Error(formatStartupValidationReport({ ...report, warnings: [] }));
  }

  return report;
}
