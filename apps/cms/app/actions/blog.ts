"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createBlogAuthor,
  createBlogCategory,
  createBlogPost,
  deleteBlogPost,
  getBlogPostByIdForCms,
  setBlogPostStatus,
  updateBlogAuthor,
  updateBlogCategory,
  updateBlogPost,
} from "@adluv/db";

import { requireCurrentAdmin } from "../../src/lib/session";
import { formatBlogMdxRenderError, renderBlogMdxSafely } from "../../src/lib/blog-mdx";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function computeReadTimeMinutes(source: string) {
  const words = source
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_>#-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(words / 220));
}

function normalizeBlogMdxForStorage(source: string) {
  return source.replace(/\r\n?/g, "\n").trim();
}

function toFieldLabel(field: string, labels?: Record<string, string>) {
  return labels?.[field] ?? field;
}

function formatIssueMessage(issue: z.ZodIssue, labels?: Record<string, string>) {
  const field = typeof issue.path[0] === "string" ? issue.path[0] : null;
  const label = field ? toFieldLabel(field, labels) : null;

  if (issue.code === "too_small" && issue.minimum !== undefined && issue.origin === "string") {
    return `${label ?? "Field"} is too short. Minimum ${issue.minimum} characters.`;
  }

  if (issue.code === "too_big" && issue.maximum !== undefined && issue.origin === "string") {
    return `${label ?? "Field"} is too long. Maximum ${issue.maximum} characters.`;
  }

  return label ? `${label}: ${issue.message}` : issue.message;
}

function formatActionError(
  error: unknown,
  fallbackMessage: string,
  labels?: Record<string, string>,
) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => formatIssueMessage(issue, labels)).join(" ");
  }

  return error instanceof Error ? error.message : fallbackMessage;
}

const blogPostFieldLabels = {
  slug: "Slug",
  title: "Title",
  excerpt: "Excerpt",
  bodyMdx: "Body",
  coverImageUrl: "Cover image",
  seoTitle: "SEO title",
  seoDescription: "SEO description",
  authorId: "Author",
  categoryId: "Category",
} satisfies Record<string, string>;

const authorFieldLabels = {
  slug: "Slug",
  name: "Name",
  role: "Public role",
  avatarLabel: "Avatar label",
  avatarImageUrl: "Author avatar",
  bio: "Bio",
} satisfies Record<string, string>;

const categoryFieldLabels = {
  slug: "Slug",
  name: "Name",
  description: "Description",
} satisfies Record<string, string>;

const mediaPathSchema = z
  .string()
  .trim()
  .refine(
    (value) => value.startsWith("/") || z.url().safeParse(value).success,
    "Media URL must be an absolute URL or CDN asset path.",
  );

const blogPostSchema = z.object({
  postId: z.string().trim().optional(),
  slug: z.string().trim().min(1).max(200),
  title: z.string().trim().min(8).max(255),
  excerpt: z.string().trim().min(20).max(500),
  bodyMdx: z.string().trim().min(40),
  coverImageUrl: mediaPathSchema.optional().or(z.literal("")),
  seoTitle: z.string().trim().max(255).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(320).optional().or(z.literal("")),
  authorId: z.string().trim().min(1),
  categoryId: z.string().trim().min(1),
  status: z.enum(["draft", "published"]).default("draft"),
});

const authorSchema = z.object({
  authorId: z.string().trim().optional(),
  slug: z.string().trim().min(1).max(160),
  name: z.string().trim().min(2).max(160),
  role: z.string().trim().min(2).max(160),
  avatarLabel: z.string().trim().min(1).max(128),
  avatarImageUrl: mediaPathSchema.optional().or(z.literal("")),
  bio: z.string().trim().min(16).max(1000),
});

const categorySchema = z.object({
  categoryId: z.string().trim().optional(),
  slug: z.string().trim().min(1).max(160),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(400).optional().or(z.literal("")),
});

function revalidateBlogSurfaces() {
  revalidatePath("/posts");
  revalidatePath("/authors");
  revalidatePath("/categories");
  revalidatePath("/blog", "layout");
}

async function assertPostBodyCanRenderForPublish(bodyMdx: string) {
  const renderResult = await renderBlogMdxSafely(bodyMdx);

  if (renderResult.status === "ok") {
    return;
  }

  throw new Error(
    `This post cannot be published because the blog renderer failed: ${formatBlogMdxRenderError(renderResult.error)}`,
  );
}

export async function saveBlogPostAction(input: z.infer<typeof blogPostSchema>) {
  await requireCurrentAdmin();

  try {
    const payload = blogPostSchema.parse({
      ...input,
      slug: slugify(input.slug || input.title),
    });
    const normalizedBodyMdx = normalizeBlogMdxForStorage(payload.bodyMdx);
    const values = {
      slug: payload.slug,
      status: payload.status,
      title: payload.title,
      excerpt: payload.excerpt,
      bodyMdx: normalizedBodyMdx,
      coverImageUrl: payload.coverImageUrl || null,
      seoTitle: payload.seoTitle || null,
      seoDescription: payload.seoDescription || null,
      readTimeMinutes: computeReadTimeMinutes(normalizedBodyMdx),
      authorId: payload.authorId,
      categoryId: payload.categoryId,
    };

    if (payload.status === "published") {
      await assertPostBodyCanRenderForPublish(normalizedBodyMdx);
    }

    const post = payload.postId
      ? await updateBlogPost(payload.postId, values)
      : await createBlogPost(values);

    revalidateBlogSurfaces();

    return {
      status: "ok" as const,
      postId: post?.id ?? payload.postId ?? null,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: formatActionError(error, "Unable to save the post.", blogPostFieldLabels),
    };
  }
}

export async function setBlogPostStatusAction(input: {
  postId: string;
  status: "draft" | "published";
}) {
  await requireCurrentAdmin();

  try {
    if (input.status === "published") {
      const post = await getBlogPostByIdForCms(input.postId);

      if (!post) {
        throw new Error("Post not found.");
      }

      await assertPostBodyCanRenderForPublish(post.bodyMdx);
    }

    await setBlogPostStatus(input.postId, input.status);
    revalidateBlogSurfaces();

    return {
      status: "ok" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: formatActionError(error, "Unable to update post status."),
    };
  }
}

export async function deleteBlogPostAction(input: { postId: string }) {
  await requireCurrentAdmin();

  try {
    await deleteBlogPost(input.postId);
    revalidateBlogSurfaces();

    return {
      status: "ok" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: formatActionError(error, "Unable to delete the post."),
    };
  }
}

export async function saveBlogAuthorAction(input: z.infer<typeof authorSchema>) {
  await requireCurrentAdmin();

  try {
    const payload = authorSchema.parse({
      ...input,
      slug: slugify(input.slug || input.name),
      avatarLabel: input.avatarLabel.trim().toUpperCase(),
    });

    if (payload.authorId) {
      await updateBlogAuthor(payload.authorId, {
        ...payload,
        avatarImageUrl: payload.avatarImageUrl || null,
      });
    } else {
      await createBlogAuthor({
        ...payload,
        avatarImageUrl: payload.avatarImageUrl || null,
      });
    }

    revalidateBlogSurfaces();

    return {
      status: "ok" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: formatActionError(error, "Unable to save the author.", authorFieldLabels),
    };
  }
}

export async function saveBlogCategoryAction(input: z.infer<typeof categorySchema>) {
  await requireCurrentAdmin();

  try {
    const payload = categorySchema.parse({
      ...input,
      slug: slugify(input.slug || input.name),
    });

    if (payload.categoryId) {
      await updateBlogCategory(payload.categoryId, payload);
    } else {
      await createBlogCategory(payload);
    }

    revalidateBlogSurfaces();

    return {
      status: "ok" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: formatActionError(error, "Unable to save the category.", categoryFieldLabels),
    };
  }
}
