import { randomUUID } from "node:crypto";

import { and, asc, desc, eq } from "drizzle-orm";
import { resolveCdnAssetUrl } from "@adluv/config";

import { getDb } from "./client";
import {
  blogAuthorsTable,
  blogCategoriesTable,
  blogPostsTable,
} from "./schema/app";

export type BlogAuthor = {
  id: string;
  slug: string;
  name: string;
  role: string;
  avatarLabel: string;
  avatarImageUrl: string | null;
  bio: string;
  createdAt: Date;
  updatedAt: Date;
};

export type BlogCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BlogPostStatus = "draft" | "published";

export type BlogPostRecord = {
  id: string;
  slug: string;
  status: BlogPostStatus;
  title: string;
  excerpt: string;
  bodyMdx: string;
  coverImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  readTimeMinutes: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: BlogAuthor;
  category: BlogCategory;
};

type BlogPostRow = {
  id: string;
  slug: string;
  status: BlogPostStatus;
  title: string;
  excerpt: string;
  bodyMdx: string;
  coverImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  readTimeMinutes: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  authorSlug: string;
  authorName: string;
  authorRole: string;
  authorAvatarLabel: string;
  authorAvatarImageUrl: string | null;
  authorBio: string;
  authorCreatedAt: Date;
  authorUpdatedAt: Date;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  categoryDescription: string | null;
  categoryCreatedAt: Date;
  categoryUpdatedAt: Date;
};

type SaveBlogPostInput = {
  slug: string;
  status: BlogPostStatus;
  title: string;
  excerpt: string;
  bodyMdx: string;
  coverImageUrl?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  readTimeMinutes: number;
  authorId: string;
  categoryId: string;
  publishedAt?: Date | null;
};

async function getBlogPostPublishedAt(postId: string) {
  const db = getDb();
  const [row] = await db
    .select({ publishedAt: blogPostsTable.publishedAt })
    .from(blogPostsTable)
    .where(eq(blogPostsTable.id, postId))
    .limit(1);

  return row?.publishedAt ?? null;
}

function mapAuthor(row: BlogPostRow): BlogAuthor {
  return {
    id: row.authorId,
    slug: row.authorSlug,
    name: row.authorName,
    role: row.authorRole,
    avatarLabel: row.authorAvatarLabel,
    avatarImageUrl: resolveCdnAssetUrl(row.authorAvatarImageUrl),
    bio: row.authorBio,
    createdAt: row.authorCreatedAt,
    updatedAt: row.authorUpdatedAt,
  };
}

function mapCategory(row: BlogPostRow): BlogCategory {
  return {
    id: row.categoryId,
    slug: row.categorySlug,
    name: row.categoryName,
    description: row.categoryDescription,
    createdAt: row.categoryCreatedAt,
    updatedAt: row.categoryUpdatedAt,
  };
}

function mapPost(row: BlogPostRow): BlogPostRecord {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    title: row.title,
    excerpt: row.excerpt,
    bodyMdx: row.bodyMdx,
    coverImageUrl: resolveCdnAssetUrl(row.coverImageUrl),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    readTimeMinutes: row.readTimeMinutes,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: mapAuthor(row),
    category: mapCategory(row),
  };
}

function getJoinedBlogPostSelect() {
  return {
    id: blogPostsTable.id,
    slug: blogPostsTable.slug,
    status: blogPostsTable.status,
    title: blogPostsTable.title,
    excerpt: blogPostsTable.excerpt,
    bodyMdx: blogPostsTable.bodyMdx,
    coverImageUrl: blogPostsTable.coverImageUrl,
    seoTitle: blogPostsTable.seoTitle,
    seoDescription: blogPostsTable.seoDescription,
    readTimeMinutes: blogPostsTable.readTimeMinutes,
    publishedAt: blogPostsTable.publishedAt,
    createdAt: blogPostsTable.createdAt,
    updatedAt: blogPostsTable.updatedAt,
    authorId: blogAuthorsTable.id,
    authorSlug: blogAuthorsTable.slug,
    authorName: blogAuthorsTable.name,
    authorRole: blogAuthorsTable.role,
    authorAvatarLabel: blogAuthorsTable.avatarLabel,
    authorAvatarImageUrl: blogAuthorsTable.avatarImageUrl,
    authorBio: blogAuthorsTable.bio,
    authorCreatedAt: blogAuthorsTable.createdAt,
    authorUpdatedAt: blogAuthorsTable.updatedAt,
    categoryId: blogCategoriesTable.id,
    categorySlug: blogCategoriesTable.slug,
    categoryName: blogCategoriesTable.name,
    categoryDescription: blogCategoriesTable.description,
    categoryCreatedAt: blogCategoriesTable.createdAt,
    categoryUpdatedAt: blogCategoriesTable.updatedAt,
  };
}

export async function listBlogAuthors() {
  const db = getDb();

  return db
    .select()
    .from(blogAuthorsTable)
    .orderBy(blogAuthorsTable.name)
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        role: row.role,
        avatarLabel: row.avatarLabel,
        avatarImageUrl: resolveCdnAssetUrl(row.avatarImageUrl),
        bio: row.bio,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    );
}

export async function getBlogAuthorById(authorId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(blogAuthorsTable)
    .where(eq(blogAuthorsTable.id, authorId))
    .limit(1);

  return row
    ? {
        id: row.id,
        slug: row.slug,
        name: row.name,
        role: row.role,
        avatarLabel: row.avatarLabel,
        avatarImageUrl: resolveCdnAssetUrl(row.avatarImageUrl),
        bio: row.bio,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    : null;
}

export async function getBlogAuthorBySlug(slug: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(blogAuthorsTable)
    .where(eq(blogAuthorsTable.slug, slug))
    .limit(1);

  return row
    ? {
        id: row.id,
        slug: row.slug,
        name: row.name,
        role: row.role,
        avatarLabel: row.avatarLabel,
        avatarImageUrl: resolveCdnAssetUrl(row.avatarImageUrl),
        bio: row.bio,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    : null;
}

export async function createBlogAuthor(input: {
  slug: string;
  name: string;
  role: string;
  avatarLabel: string;
  avatarImageUrl?: string | null;
  bio: string;
}) {
  const db = getDb();
  const now = new Date();
  const id = randomUUID();

  await db.insert(blogAuthorsTable).values({
    id,
    slug: input.slug,
    name: input.name,
    role: input.role,
    avatarLabel: input.avatarLabel,
    avatarImageUrl: input.avatarImageUrl?.trim() || null,
    bio: input.bio,
    createdAt: now,
    updatedAt: now,
  });

  return getBlogAuthorById(id);
}

export async function updateBlogAuthor(
  authorId: string,
  input: {
    slug: string;
    name: string;
    role: string;
    avatarLabel: string;
    avatarImageUrl?: string | null;
    bio: string;
  },
) {
  const db = getDb();

  await db
    .update(blogAuthorsTable)
    .set({
      slug: input.slug,
      name: input.name,
      role: input.role,
      avatarLabel: input.avatarLabel,
      avatarImageUrl: input.avatarImageUrl?.trim() || null,
      bio: input.bio,
      updatedAt: new Date(),
    })
    .where(eq(blogAuthorsTable.id, authorId));

  return getBlogAuthorById(authorId);
}

export async function listBlogCategories() {
  const db = getDb();

  return db
    .select()
    .from(blogCategoriesTable)
    .orderBy(asc(blogCategoriesTable.name))
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    );
}

export async function getBlogCategoryById(categoryId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(blogCategoriesTable)
    .where(eq(blogCategoriesTable.id, categoryId))
    .limit(1);

  return row
    ? {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    : null;
}

export async function getBlogCategoryBySlug(slug: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(blogCategoriesTable)
    .where(eq(blogCategoriesTable.slug, slug))
    .limit(1);

  return row
    ? {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    : null;
}

export async function createBlogCategory(input: {
  slug: string;
  name: string;
  description?: string | null;
}) {
  const db = getDb();
  const now = new Date();
  const id = randomUUID();

  await db.insert(blogCategoriesTable).values({
    id,
    slug: input.slug,
    name: input.name,
    description: input.description?.trim() || null,
    createdAt: now,
    updatedAt: now,
  });

  return getBlogCategoryById(id);
}

export async function updateBlogCategory(
  categoryId: string,
  input: {
    slug: string;
    name: string;
    description?: string | null;
  },
) {
  const db = getDb();

  await db
    .update(blogCategoriesTable)
    .set({
      slug: input.slug,
      name: input.name,
      description: input.description?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(blogCategoriesTable.id, categoryId));

  return getBlogCategoryById(categoryId);
}

async function saveBlogPost(
  postId: string,
  input: SaveBlogPostInput,
  mode: "create" | "update",
) {
  const db = getDb();
  const now = new Date();
  const existingPublishedAt =
    mode === "update" ? await getBlogPostPublishedAt(postId) : null;
  const publishedAt =
    existingPublishedAt ??
    input.publishedAt ??
    (input.status === "published" ? now : null);
  const values = {
    slug: input.slug,
    status: input.status,
    title: input.title,
    excerpt: input.excerpt,
    bodyMdx: input.bodyMdx,
    coverImageUrl: input.coverImageUrl?.trim() || null,
    seoTitle: input.seoTitle?.trim() || null,
    seoDescription: input.seoDescription?.trim() || null,
    readTimeMinutes: input.readTimeMinutes,
    authorId: input.authorId,
    categoryId: input.categoryId,
    publishedAt,
    updatedAt: now,
  };

  if (mode === "create") {
    await db.insert(blogPostsTable).values({
      id: postId,
      ...values,
      createdAt: now,
    });
  } else {
    await db
      .update(blogPostsTable)
      .set(values)
      .where(eq(blogPostsTable.id, postId));
  }

  return getBlogPostByIdForCms(postId);
}

export async function createBlogPost(input: SaveBlogPostInput) {
  return saveBlogPost(randomUUID(), input, "create");
}

export async function updateBlogPost(postId: string, input: SaveBlogPostInput) {
  return saveBlogPost(postId, input, "update");
}

export async function setBlogPostStatus(postId: string, status: BlogPostStatus) {
  const db = getDb();
  const now = new Date();
  const publishedAt = (await getBlogPostPublishedAt(postId)) ?? (status === "published" ? now : null);

  await db
    .update(blogPostsTable)
    .set({
      status,
      publishedAt,
      updatedAt: now,
    })
    .where(eq(blogPostsTable.id, postId));

  return getBlogPostByIdForCms(postId);
}

export async function deleteBlogPost(postId: string) {
  const db = getDb();
  await db.delete(blogPostsTable).where(eq(blogPostsTable.id, postId));
}

export async function listBlogPostsForCms() {
  const db = getDb();
  const rows = await db
    .select(getJoinedBlogPostSelect())
    .from(blogPostsTable)
    .innerJoin(blogAuthorsTable, eq(blogPostsTable.authorId, blogAuthorsTable.id))
    .innerJoin(blogCategoriesTable, eq(blogPostsTable.categoryId, blogCategoriesTable.id))
    .orderBy(desc(blogPostsTable.updatedAt), desc(blogPostsTable.createdAt));

  return rows.map(mapPost);
}

export async function getBlogPostByIdForCms(postId: string) {
  const db = getDb();
  const [row] = await db
    .select(getJoinedBlogPostSelect())
    .from(blogPostsTable)
    .innerJoin(blogAuthorsTable, eq(blogPostsTable.authorId, blogAuthorsTable.id))
    .innerJoin(blogCategoriesTable, eq(blogPostsTable.categoryId, blogCategoriesTable.id))
    .where(eq(blogPostsTable.id, postId))
    .limit(1);

  return row ? mapPost(row) : null;
}

export async function getPublishedBlogPostBySlug(slug: string) {
  const db = getDb();
  const [row] = await db
    .select(getJoinedBlogPostSelect())
    .from(blogPostsTable)
    .innerJoin(blogAuthorsTable, eq(blogPostsTable.authorId, blogAuthorsTable.id))
    .innerJoin(blogCategoriesTable, eq(blogPostsTable.categoryId, blogCategoriesTable.id))
    .where(and(eq(blogPostsTable.slug, slug), eq(blogPostsTable.status, "published")))
    .limit(1);

  return row ? mapPost(row) : null;
}

export async function listPublishedBlogPosts(filters?: {
  authorSlug?: string;
  categorySlug?: string;
}) {
  const db = getDb();
  const conditions = [eq(blogPostsTable.status, "published")];

  if (filters?.authorSlug) {
    conditions.push(eq(blogAuthorsTable.slug, filters.authorSlug));
  }

  if (filters?.categorySlug) {
    conditions.push(eq(blogCategoriesTable.slug, filters.categorySlug));
  }

  const rows = await db
    .select(getJoinedBlogPostSelect())
    .from(blogPostsTable)
    .innerJoin(blogAuthorsTable, eq(blogPostsTable.authorId, blogAuthorsTable.id))
    .innerJoin(blogCategoriesTable, eq(blogPostsTable.categoryId, blogCategoriesTable.id))
    .where(and(...conditions))
    .orderBy(desc(blogPostsTable.publishedAt), desc(blogPostsTable.createdAt));

  return rows.map(mapPost);
}
