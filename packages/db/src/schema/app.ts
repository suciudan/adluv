import { relations } from "drizzle-orm";
import {
  boolean,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const sourceEnum = mysqlEnum("source", ["linkedin", "facebook", "google", "tiktok"]);
const sourceValues = ["linkedin", "facebook", "google", "tiktok"] as const;
const trackerStatusValues = [
  "pending_initial_index",
  "active",
  "retryable_error",
  "paused",
] as const;
const alertChannelValues = ["email", "in_app"] as const;
const jobStatusValues = ["queued", "running", "completed", "failed"] as const;
const trackerNotificationKindValues = [
  "initial_index_completed",
  "initial_index_failed",
] as const;
const digestFrequencyValues = ["instant", "daily", "weekly", "monthly"] as const;
const userRoleValues = ["member", "admin", "owner"] as const;
const blogPostStatusValues = ["draft", "published"] as const;

const createdAt = () => datetime("created_at", { mode: "date", fsp: 3 }).notNull();
const updatedAt = () => datetime("updated_at", { mode: "date", fsp: 3 }).notNull();
const nullableDatetime = (name: string) => datetime(name, { mode: "date", fsp: 3 });

export const authUsersTable = mysqlTable(
  "user",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    image: varchar("image", { length: 1024 }),
    username: varchar("username", { length: 64 }),
    displayUsername: varchar("displayUsername", { length: 80 }),
    role: mysqlEnum("role", userRoleValues).notNull().default("member"),
    lastSeenAt: datetime("lastSeenAt", { mode: "date", fsp: 3 }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 }).notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => ({
    emailUnique: uniqueIndex("auth_user_email_unique").on(table.email),
    usernameUnique: uniqueIndex("auth_user_username_unique").on(table.username),
  }),
);

export const authSessionsTable = mysqlTable(
  "session",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    userId: varchar("userId", { length: 191 })
      .notNull()
      .references(() => authUsersTable.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: datetime("expiresAt", { mode: "date", fsp: 3 }).notNull(),
    ipAddress: varchar("ipAddress", { length: 255 }),
    userAgent: varchar("userAgent", { length: 1024 }),
    activeOrganizationId: varchar("activeOrganizationId", { length: 191 }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 }).notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("auth_session_token_unique").on(table.token),
  }),
);

export const authOrganizationsTable = mysqlTable(
  "organization",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 191 }).notNull(),
    logo: varchar("logo", { length: 1024 }),
    metadata: text("metadata"),
    ownerUserId: varchar("owner_user_id", { length: 191 })
      .notNull()
      .references(() => authUsersTable.id, { onDelete: "cascade" }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 }).notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }),
  },
  (table) => ({
    slugUnique: uniqueIndex("auth_organization_slug_unique").on(table.slug),
    ownerUserIdIndex: index("auth_organization_owner_user_id_idx").on(table.ownerUserId),
  }),
);

export const authMembersTable = mysqlTable(
  "member",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    organizationId: varchar("organizationId", { length: 191 })
      .notNull()
      .references(() => authOrganizationsTable.id, { onDelete: "cascade" }),
    userId: varchar("userId", { length: 191 })
      .notNull()
      .references(() => authUsersTable.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 64 }).notNull().default("member"),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => ({
    organizationUserUnique: uniqueIndex("auth_member_organization_user_unique").on(
      table.organizationId,
      table.userId,
    ),
    userIdIndex: index("auth_member_user_id_idx").on(table.userId),
  }),
);

export const authInvitationsTable = mysqlTable(
  "invitation",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    organizationId: varchar("organizationId", { length: 191 })
      .notNull()
      .references(() => authOrganizationsTable.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 64 }).notNull(),
    status: varchar("status", { length: 64 }).notNull().default("pending"),
    expiresAt: datetime("expiresAt", { mode: "date", fsp: 3 }),
    inviterId: varchar("inviterId", { length: 191 })
      .notNull()
      .references(() => authUsersTable.id, { onDelete: "cascade" }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => ({
    organizationEmailIndex: index("auth_invitation_organization_email_idx").on(
      table.organizationId,
      table.email,
    ),
    inviterIdIndex: index("auth_invitation_inviter_id_idx").on(table.inviterId),
  }),
);

export const authAccountsTable = mysqlTable(
  "account",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    userId: varchar("userId", { length: 191 })
      .notNull()
      .references(() => authUsersTable.id, { onDelete: "cascade" }),
    accountId: varchar("accountId", { length: 255 }).notNull(),
    providerId: varchar("providerId", { length: 128 }).notNull(),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    accessTokenExpiresAt: datetime("accessTokenExpiresAt", { mode: "date", fsp: 3 }),
    refreshTokenExpiresAt: datetime("refreshTokenExpiresAt", { mode: "date", fsp: 3 }),
    scope: varchar("scope", { length: 512 }),
    idToken: text("idToken"),
    password: text("password"),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 }).notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex("auth_account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
  }),
);

export const authVerificationsTable = mysqlTable("verification", {
  id: varchar("id", { length: 191 }).primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: text("value").notNull(),
  expiresAt: datetime("expiresAt", { mode: "date", fsp: 3 }).notNull(),
  createdAt: datetime("createdAt", { mode: "date", fsp: 3 }).notNull(),
  updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
});

export const authOauthApplicationsTable = mysqlTable(
  "oauthApplication",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    icon: varchar("icon", { length: 1024 }),
    metadata: text("metadata"),
    clientId: varchar("clientId", { length: 191 }).notNull(),
    clientSecret: varchar("clientSecret", { length: 255 }),
    redirectUrls: text("redirectUrls").notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    authenticationScheme: varchar("authenticationScheme", { length: 64 }).notNull().default("none"),
    disabled: boolean("disabled").notNull().default(false),
    userId: varchar("userId", { length: 191 }).references(() => authUsersTable.id, {
      onDelete: "cascade",
    }),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 }).notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => ({
    clientIdUnique: uniqueIndex("auth_oauth_application_client_id_unique").on(table.clientId),
    userIdIndex: index("auth_oauth_application_user_id_idx").on(table.userId),
  }),
);

export const authOauthAccessTokensTable = mysqlTable(
  "oauthAccessToken",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    accessToken: varchar("accessToken", { length: 191 }).notNull(),
    refreshToken: varchar("refreshToken", { length: 191 }).notNull(),
    accessTokenExpiresAt: datetime("accessTokenExpiresAt", { mode: "date", fsp: 3 }).notNull(),
    refreshTokenExpiresAt: datetime("refreshTokenExpiresAt", { mode: "date", fsp: 3 }).notNull(),
    clientId: varchar("clientId", { length: 191 })
      .notNull()
      .references(() => authOauthApplicationsTable.clientId, { onDelete: "cascade" }),
    userId: varchar("userId", { length: 191 }).references(() => authUsersTable.id, {
      onDelete: "cascade",
    }),
    scopes: varchar("scopes", { length: 1024 }).notNull(),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 }).notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => ({
    accessTokenUnique: uniqueIndex("auth_oauth_access_token_access_token_unique").on(table.accessToken),
    refreshTokenUnique: uniqueIndex("auth_oauth_access_token_refresh_token_unique").on(table.refreshToken),
    clientIdIndex: index("auth_oauth_access_token_client_id_idx").on(table.clientId),
    userIdIndex: index("auth_oauth_access_token_user_id_idx").on(table.userId),
  }),
);

export const authOauthConsentsTable = mysqlTable(
  "oauthConsent",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    clientId: varchar("clientId", { length: 191 })
      .notNull()
      .references(() => authOauthApplicationsTable.clientId, { onDelete: "cascade" }),
    userId: varchar("userId", { length: 191 })
      .notNull()
      .references(() => authUsersTable.id, { onDelete: "cascade" }),
    scopes: varchar("scopes", { length: 1024 }).notNull(),
    consentGiven: boolean("consentGiven").notNull().default(true),
    createdAt: datetime("createdAt", { mode: "date", fsp: 3 }).notNull(),
    updatedAt: datetime("updatedAt", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => ({
    clientIdIndex: index("auth_oauth_consent_client_id_idx").on(table.clientId),
    userIdIndex: index("auth_oauth_consent_user_id_idx").on(table.userId),
  }),
);

export const authUsersRelations = relations(authUsersTable, ({ many }) => ({
  accounts: many(authAccountsTable),
  sessions: many(authSessionsTable),
  memberships: many(authMembersTable),
}));

export const authAccountsRelations = relations(authAccountsTable, ({ one }) => ({
  user: one(authUsersTable, {
    fields: [authAccountsTable.userId],
    references: [authUsersTable.id],
  }),
}));

export const authSessionsRelations = relations(authSessionsTable, ({ one }) => ({
  user: one(authUsersTable, {
    fields: [authSessionsTable.userId],
    references: [authUsersTable.id],
  }),
}));

export const authOrganizationsRelations = relations(authOrganizationsTable, ({ many, one }) => ({
  owner: one(authUsersTable, {
    fields: [authOrganizationsTable.ownerUserId],
    references: [authUsersTable.id],
  }),
  members: many(authMembersTable),
}));

export const authMembersRelations = relations(authMembersTable, ({ one }) => ({
  organization: one(authOrganizationsTable, {
    fields: [authMembersTable.organizationId],
    references: [authOrganizationsTable.id],
  }),
  user: one(authUsersTable, {
    fields: [authMembersTable.userId],
    references: [authUsersTable.id],
  }),
}));

export const blogAuthorsTable = mysqlTable(
  "blog_authors",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    slug: varchar("slug", { length: 160 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    role: varchar("role", { length: 160 }).notNull(),
    avatarLabel: varchar("avatar_label", { length: 128 }).notNull(),
    avatarImageUrl: varchar("avatar_image_url", { length: 1024 }),
    bio: text("bio").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    slugUnique: uniqueIndex("blog_authors_slug_unique").on(table.slug),
  }),
);

export const blogCategoriesTable = mysqlTable(
  "blog_categories",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    slug: varchar("slug", { length: 160 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    slugUnique: uniqueIndex("blog_categories_slug_unique").on(table.slug),
  }),
);

export const blogPostsTable = mysqlTable(
  "blog_posts",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    slug: varchar("slug", { length: 200 }).notNull(),
    status: mysqlEnum("status", blogPostStatusValues).notNull().default("draft"),
    title: varchar("title", { length: 255 }).notNull(),
    excerpt: text("excerpt").notNull(),
    bodyMdx: text("body_mdx").notNull(),
    coverImageUrl: varchar("cover_image_url", { length: 1024 }),
    seoTitle: varchar("seo_title", { length: 255 }),
    seoDescription: varchar("seo_description", { length: 320 }),
    readTimeMinutes: int("read_time_minutes").notNull().default(1),
    authorId: varchar("author_id", { length: 191 })
      .notNull()
      .references(() => blogAuthorsTable.id, { onDelete: "restrict" }),
    categoryId: varchar("category_id", { length: 191 })
      .notNull()
      .references(() => blogCategoriesTable.id, { onDelete: "restrict" }),
    publishedAt: nullableDatetime("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    slugUnique: uniqueIndex("blog_posts_slug_unique").on(table.slug),
  }),
);

export const blogAuthorsRelations = relations(blogAuthorsTable, ({ many }) => ({
  posts: many(blogPostsTable),
}));

export const blogCategoriesRelations = relations(blogCategoriesTable, ({ many }) => ({
  posts: many(blogPostsTable),
}));

export const blogPostsRelations = relations(blogPostsTable, ({ one }) => ({
  author: one(blogAuthorsTable, {
    fields: [blogPostsTable.authorId],
    references: [blogAuthorsTable.id],
  }),
  category: one(blogCategoriesTable, {
    fields: [blogPostsTable.categoryId],
    references: [blogCategoriesTable.id],
  }),
}));

export const subscriptionsTable = mysqlTable("subscriptions", {
  id: varchar("id", { length: 191 }).primaryKey(),
  userId: varchar("user_id", { length: 191 }).notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 191 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 191 }),
  plan: varchar("plan", { length: 64 }).notNull(),
  status: varchar("status", { length: 64 }).notNull(),
  currentPeriodEnd: nullableDatetime("current_period_end"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const entitlementsTable = mysqlTable("entitlements", {
  id: varchar("id", { length: 191 }).primaryKey(),
  userId: varchar("user_id", { length: 191 }).notNull(),
  trackedCompanyLimit: int("tracked_company_limit").notNull(),
  alertsEnabled: boolean("alerts_enabled").notNull().default(true),
  syncEnabled: boolean("sync_enabled").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const notificationSettingsTable = mysqlTable(
  "notification_settings",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    userId: varchar("user_id", { length: 191 }).notNull(),
    alertsEnabled: boolean("alerts_enabled").notNull().default(true),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    digestFrequency: mysqlEnum("digest_frequency", digestFrequencyValues)
      .notNull()
      .default("daily"),
    lastDigestSentAt: nullableDatetime("last_digest_sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    userUnique: uniqueIndex("notification_settings_user_unique").on(table.userId),
  }),
);

export const advertiserCompaniesTable = mysqlTable(
  "advertiser_companies",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    normalizedDomain: varchar("normalized_domain", { length: 255 }).notNull(),
    websiteUrl: varchar("website_url", { length: 1024 }),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    logoUrl: varchar("logo_url", { length: 1024 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    normalizedDomainUnique: uniqueIndex("advertiser_companies_normalized_domain_unique").on(
      table.normalizedDomain,
    ),
  }),
);

export const advertisersTable = mysqlTable(
  "advertisers",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    source: mysqlEnum("source", sourceValues).notNull(),
    sourceAdvertiserId: varchar("source_advertiser_id", { length: 191 }).notNull(),
    canonicalName: varchar("canonical_name", { length: 255 }).notNull(),
    profileUrl: varchar("profile_url", { length: 512 }),
    websiteUrl: varchar("website_url", { length: 1024 }),
    normalizedDomain: varchar("normalized_domain", { length: 255 }),
    companyId: varchar("company_id", { length: 191 }).references(() => advertiserCompaniesTable.id, {
      onDelete: "set null",
    }),
    logoUrl: varchar("logo_url", { length: 1024 }),
    industry: varchar("industry", { length: 128 }),
    companySize: varchar("company_size", { length: 128 }),
    country: varchar("country", { length: 128 }),
    summary: text("summary"),
    lastIndexedAt: nullableDatetime("last_indexed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    sourceAdvertiserUnique: uniqueIndex("advertisers_source_external_unique").on(
      table.source,
      table.sourceAdvertiserId,
    ),
    normalizedDomainIndex: index("advertisers_normalized_domain_idx").on(table.normalizedDomain),
    companyIndex: index("advertisers_company_id_idx").on(table.companyId),
  }),
);

export const advertiserSearchAliasesTable = mysqlTable(
  "advertiser_search_aliases",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    advertiserId: varchar("advertiser_id", { length: 191 }).notNull(),
    query: varchar("query", { length: 255 }).notNull(),
    normalizedQuery: varchar("normalized_query", { length: 255 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    aliasUnique: uniqueIndex("advertiser_search_aliases_query_advertiser_unique").on(
      table.normalizedQuery,
      table.advertiserId,
    ),
  }),
);

export const advertiserSearchQueriesTable = mysqlTable(
  "advertiser_search_queries",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    normalizedQuery: varchar("normalized_query", { length: 255 }).notNull(),
    displayQuery: varchar("display_query", { length: 255 }).notNull(),
    lastRequestedAt: nullableDatetime("last_requested_at"),
    refreshedAt: nullableDatetime("refreshed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    normalizedQueryUnique: uniqueIndex("advertiser_search_queries_normalized_query_unique").on(
      table.normalizedQuery,
    ),
  }),
);

export const advertiserSearchQuerySourcesTable = mysqlTable(
  "advertiser_search_query_sources",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    queryId: varchar("query_id", { length: 191 }).notNull(),
    source: mysqlEnum("source", sourceValues).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    errorMessage: text("error_message"),
    startedAt: nullableDatetime("started_at"),
    finishedAt: nullableDatetime("finished_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    querySourceUnique: uniqueIndex("advertiser_search_query_sources_query_source_unique").on(
      table.queryId,
      table.source,
    ),
  }),
);

export const advertiserSearchQueryResultsTable = mysqlTable(
  "advertiser_search_query_results",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    queryId: varchar("query_id", { length: 191 }).notNull(),
    advertiserId: varchar("advertiser_id", { length: 191 }).notNull(),
    source: mysqlEnum("source", sourceValues).notNull(),
    sourceAdvertiserId: varchar("source_advertiser_id", { length: 191 }).notNull(),
    companyKey: varchar("company_key", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    rankScore: int("rank_score").notNull().default(0),
    canonicalName: varchar("canonical_name", { length: 255 }).notNull(),
    profileUrl: varchar("profile_url", { length: 512 }),
    logoUrl: varchar("logo_url", { length: 1024 }),
    industry: varchar("industry", { length: 128 }),
    companySize: varchar("company_size", { length: 128 }),
    country: varchar("country", { length: 128 }),
    summary: text("summary"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    querySourceAdvertiserUnique: uniqueIndex("advertiser_search_query_results_query_source_advertiser_unique").on(
      table.queryId,
      table.source,
      table.sourceAdvertiserId,
    ),
    queryCompanyIndex: index("advertiser_search_query_results_query_company_idx").on(
      table.queryId,
      table.companyKey,
    ),
  }),
);

export const advertiserSearchQueryCompaniesTable = mysqlTable(
  "advertiser_search_query_companies",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    queryId: varchar("query_id", { length: 191 }).notNull(),
    companyKey: varchar("company_key", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    websiteUrl: varchar("website_url", { length: 1024 }),
    domain: varchar("domain", { length: 255 }),
    logoUrl: varchar("logo_url", { length: 1024 }),
    description: text("description"),
    rankScore: int("rank_score").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    queryCompanyUnique: uniqueIndex("advertiser_search_query_companies_query_company_unique").on(
      table.queryId,
      table.companyKey,
    ),
    queryRankIndex: index("advertiser_search_query_companies_query_rank_idx").on(
      table.queryId,
      table.rankScore,
    ),
  }),
);

export const advertiserSearchAutoAddsTable = mysqlTable(
  "advertiser_search_auto_adds",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 191 }).references(() => authOrganizationsTable.id, {
      onDelete: "cascade",
    }),
    userId: varchar("user_id", { length: 191 }).notNull(),
    queryId: varchar("query_id", { length: 191 }).notNull(),
    companyKey: varchar("company_key", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: nullableDatetime("completed_at"),
  },
  (table) => ({
    workspaceQueryCompanyUnique: uniqueIndex("advertiser_search_auto_adds_workspace_query_company_unique").on(
      table.workspaceId,
      table.queryId,
      table.companyKey,
    ),
    workspaceIndex: index("advertiser_search_auto_adds_workspace_idx").on(table.workspaceId),
  }),
);

export const trackedCompaniesTable = mysqlTable(
  "tracked_companies",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 191 }).references(() => authOrganizationsTable.id, {
      onDelete: "cascade",
    }),
    userId: varchar("user_id", { length: 191 }).notNull(),
    advertiserId: varchar("advertiser_id", { length: 191 }).notNull(),
    status: mysqlEnum("tracker_status", trackerStatusValues)
      .notNull()
      .default("pending_initial_index"),
    lastSyncedAt: nullableDatetime("last_synced_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    workspaceAdvertiserUnique: uniqueIndex("tracked_companies_workspace_advertiser_unique").on(
      table.workspaceId,
      table.advertiserId,
    ),
    workspaceIndex: index("tracked_companies_workspace_idx").on(table.workspaceId),
  }),
);

export const adsTable = mysqlTable(
  "ads",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    advertiserId: varchar("advertiser_id", { length: 191 }).notNull(),
    source: mysqlEnum("source", sourceValues).notNull(),
    sourceAdId: varchar("source_ad_id", { length: 191 }),
    fingerprint: varchar("fingerprint", { length: 191 }).notNull(),
    title: varchar("title", { length: 255 }),
    body: text("body"),
    callToAction: varchar("call_to_action", { length: 128 }),
    destinationUrl: varchar("destination_url", { length: 1024 }),
    mediaUrl: varchar("media_url", { length: 1024 }),
    format: varchar("format", { length: 64 }),
    payer: varchar("payer", { length: 255 }),
    status: varchar("status", { length: 64 }),
    reactionCount: int("reaction_count").notNull().default(0),
    commentCount: int("comment_count").notNull().default(0),
    firstSeenAt: datetime("first_seen_at", { mode: "date", fsp: 3 }).notNull(),
    lastSeenAt: datetime("last_seen_at", { mode: "date", fsp: 3 }).notNull(),
    metadata: json("metadata"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    adIdentityUnique: uniqueIndex("ads_source_identity_unique").on(
      table.source,
      table.sourceAdId,
      table.fingerprint,
    ),
  }),
);

export const adObservationsTable = mysqlTable("ad_observations", {
  id: varchar("id", { length: 191 }).primaryKey(),
  adId: varchar("ad_id", { length: 191 }).notNull(),
  observedAt: datetime("observed_at", { mode: "date", fsp: 3 }).notNull(),
  countries: json("countries"),
  impressionWindow: varchar("impression_window", { length: 128 }),
  rawPayload: json("raw_payload"),
});

export const landingPageSnapshotsTable = mysqlTable("landing_page_snapshots", {
  id: varchar("id", { length: 191 }).primaryKey(),
  adId: varchar("ad_id", { length: 191 }).notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  title: varchar("title", { length: 255 }),
  html: text("html"),
  screenshotUrl: varchar("screenshot_url", { length: 1024 }),
  capturedAt: datetime("captured_at", { mode: "date", fsp: 3 }).notNull(),
});

export const alertsTable = mysqlTable(
  "alerts",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 191 }).references(() => authOrganizationsTable.id, {
      onDelete: "cascade",
    }),
    userId: varchar("user_id", { length: 191 }).notNull(),
    trackedCompanyId: varchar("tracked_company_id", { length: 191 }).notNull(),
    adId: varchar("ad_id", { length: 191 }).notNull(),
    headline: varchar("headline", { length: 255 }).notNull(),
    body: text("body"),
    createdAt: createdAt(),
  },
  (table) => ({
    workspaceIndex: index("alerts_workspace_idx").on(table.workspaceId),
  }),
);

export const alertDeliveriesTable = mysqlTable("alert_deliveries", {
  id: varchar("id", { length: 191 }).primaryKey(),
  alertId: varchar("alert_id", { length: 191 }).notNull(),
  channel: mysqlEnum("alert_channel", alertChannelValues).notNull(),
  deliveredAt: nullableDatetime("delivered_at"),
  readAt: nullableDatetime("read_at"),
  failedAt: nullableDatetime("failed_at"),
  errorMessage: text("error_message"),
});

export const jobsTable = mysqlTable("jobs", {
  id: varchar("id", { length: 191 }).primaryKey(),
  queueName: varchar("queue_name", { length: 128 }).notNull(),
  payload: json("payload"),
  status: mysqlEnum("job_status", jobStatusValues).notNull().default("queued"),
  attempts: int("attempts").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  startedAt: nullableDatetime("started_at"),
  finishedAt: nullableDatetime("finished_at"),
});

export const trackerNotificationsTable = mysqlTable(
  "tracker_notifications",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    jobId: varchar("job_id", { length: 191 }).notNull(),
    workspaceId: varchar("workspace_id", { length: 191 }).references(() => authOrganizationsTable.id, {
      onDelete: "cascade",
    }),
    userId: varchar("user_id", { length: 191 }).notNull(),
    trackedCompanyId: varchar("tracked_company_id", { length: 191 }).notNull(),
    advertiserId: varchar("advertiser_id", { length: 191 }).notNull(),
    kind: mysqlEnum("tracker_notification_kind", trackerNotificationKindValues).notNull(),
    headline: varchar("headline", { length: 255 }).notNull(),
    body: text("body"),
    targetUrl: varchar("target_url", { length: 1024 }).notNull(),
    metadata: json("metadata"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    readAt: nullableDatetime("read_at"),
  },
  (table) => ({
    jobUnique: uniqueIndex("tracker_notifications_job_unique").on(table.jobId),
    workspaceIndex: index("tracker_notifications_workspace_idx").on(table.workspaceId),
  }),
);

export const savedAdsTable = mysqlTable(
  "saved_ads",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 191 }).references(() => authOrganizationsTable.id, {
      onDelete: "cascade",
    }),
    userId: varchar("user_id", { length: 191 }).notNull(),
    adId: varchar("ad_id", { length: 191 }).notNull(),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    workspaceAdUnique: uniqueIndex("saved_ads_workspace_ad_unique").on(table.workspaceId, table.adId),
    workspaceIndex: index("saved_ads_workspace_idx").on(table.workspaceId),
  }),
);

export const swipeFileCollectionsTable = mysqlTable(
  "swipe_file_collections",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 191 }).references(() => authOrganizationsTable.id, {
      onDelete: "cascade",
    }),
    userId: varchar("user_id", { length: 191 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex("swipe_file_collections_workspace_name_unique").on(
      table.workspaceId,
      table.name,
    ),
    workspaceIndex: index("swipe_file_collections_workspace_idx").on(table.workspaceId),
  }),
);

export const swipeFileCollectionItemsTable = mysqlTable(
  "swipe_file_collection_items",
  {
    id: varchar("id", { length: 191 }).primaryKey(),
    collectionId: varchar("collection_id", { length: 191 }).notNull(),
    savedAdId: varchar("saved_ad_id", { length: 191 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => ({
    savedAdUnique: uniqueIndex("swipe_file_collection_items_collection_saved_ad_unique").on(
      table.collectionId,
      table.savedAdId,
    ),
  }),
);
