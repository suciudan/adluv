export const dashboardMetrics = [
  { label: "Tracked companies", value: "3", detail: "10 available in the beta workspace" },
  { label: "New ads this week", value: "12", detail: "Placeholder data until ingestion is live" },
  { label: "Sync cadence", value: "2x / day", detail: "Twice-daily scheduled syncs" },
];

export const trackedCompanies = [
  {
    id: "tracker-acme",
    name: "Acme",
    status: "active",
    lastSyncedAt: "14 minutes ago",
    newestCreative: "Summer team banner ad",
  },
  {
    id: "tracker-northstar",
    name: "Northstar",
    status: "pending_initial_index",
    lastSyncedAt: "Waiting for first index",
    newestCreative: "Pending",
  },
  {
    id: "tracker-orbit",
    name: "Orbit Cloud",
    status: "active",
    lastSyncedAt: "4 hours ago",
    newestCreative: "Lead-gen campaign",
  },
];
