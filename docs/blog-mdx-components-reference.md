# Blog MDX Components Reference

This is the current MDX component set supported by the blog renderer.

Use this file as the source of truth when drafting articles in Claude.

## Rules

- Prefer plain Markdown for normal headings, paragraphs, lists, links, and tables unless a custom component adds real value.
- Prefer the `Blog*` component names below for new articles.
- Legacy aliases `Callout`, `Quote`, and `CtaLink` are still supported, but they are older names.
- All string props should be passed as JS string expressions, for example: `title={"Why this matters"}`.
- `className` is technically supported on most components, but do not use it in article drafts unless explicitly requested.

## Supported Components

### `BlogCallout`

Purpose: highlighted supporting note with arbitrary MDX content inside.

Props:
- `title?: string`
- `children: MDX content`

Example:

```mdx
<BlogCallout title={"Why this matters"}>
This section explains the strategic implication behind the data.
</BlogCallout>
```

Legacy alias:

```mdx
<Callout title={"Why this matters"}>
This section explains the strategic implication behind the data.
</Callout>
```

### `BlogQuote`

Purpose: styled quote or highlighted commentary block. Can contain paragraphs and lists.

Props:
- `children: MDX content`

Example:

```mdx
<BlogQuote>
**Reading the offer across platforms**

- **Meta:** "Get 30 days free"
- **Google:** "See pricing"
- **LinkedIn:** "Book a personalized demo"
</BlogQuote>
```

Legacy alias:

```mdx
<Quote>
Quoted text here.
</Quote>
```

### `BlogCtaLink`

Purpose: inline CTA button link inside article body.

Props:
- `href: string`
- `children: text`

Example:

```mdx
<BlogCtaLink href={"/contact-sales"}>
See AdLuv in action
</BlogCtaLink>
```

Legacy alias:

```mdx
<CtaLink href={"/contact-sales"}>
See AdLuv in action
</CtaLink>
```

### `BlogImage`

Purpose: inline image with optional alt text and caption.

Props:
- `src: string`
- `alt?: string`
- `caption?: string`

Example:

```mdx
<BlogImage
  src={"https://cdn.example.com/blog-media/example.webp"}
  alt={"Meta Ads Library homepage"}
  caption={"Meta Ads Library homepage"}
/>
```

### `BlogCta`

Purpose: full-width CTA block with optional background image.

Props:
- `heading: string`
- `body: string`
- `buttonLabel: string`
- `buttonHref: string`
- `backgroundImage?: string`

Example:

```mdx
<BlogCta
  heading={"Track competitor ads across Meta, Google, and LinkedIn"}
  body={"See every active ad, spot strategic shifts faster, and turn ad research into a repeatable workflow."}
  buttonLabel={"Book a demo"}
  buttonHref={"/contact-sales"}
/>
```

With background image:

```mdx
<BlogCta
  heading={"Track competitor ads across Meta, Google, and LinkedIn"}
  body={"See every active ad, spot strategic shifts faster, and turn ad research into a repeatable workflow."}
  buttonLabel={"Book a demo"}
  buttonHref={"/contact-sales"}
  backgroundImage={"https://cdn.example.com/blog-media/background.webp"}
/>
```

### `BlogHookComparison`

Purpose: compare a pain-led hook against a benefit-led hook.

Props:
- `title: string`
- `pain: string`
- `benefit: string`

Example:

```mdx
<BlogHookComparison
  title={"Example: two hook strategies for the same product"}
  pain={"Still wasting hours tracking competitor ads manually?"}
  benefit={"See every competitor ad, across every platform, in one place."}
/>
```

### `BlogNotePanel`

Purpose: compact note panel for side commentary, caveats, or practical warnings.

Props:
- `title: string`
- `body: string`
- `variant?: "warm" | "neutral"`

Example:

```mdx
<BlogNotePanel
  title={"Important context"}
  body={"The Ads Library shows active ads, not full historical performance data."}
/>
```

Neutral variant:

```mdx
<BlogNotePanel
  title={"Method note"}
  body={"This estimate is directional and should be used alongside live SERP checks."}
  variant={"neutral"}
/>
```

### `BlogTakeaways`

Purpose: key takeaways list with highlighted bullets.

Props:
- `items: string[]`
- `title?: string`

Example:

```mdx
<BlogTakeaways
  title={"Key takeaways"}
  items={[
    "Long-running ads are the best proxy for creative performance.",
    "Offer structure reveals funnel intent.",
    "Landing pages often matter more than the ad itself."
  ]}
/>
```

### `BlogSplitComparison`

Purpose: side-by-side comparison between a weaker approach and a stronger approach.

Props:
- `leftTitle: string`
- `leftItems: string[]`
- `leftFooter?: string`
- `rightTitle: string`
- `rightItems: string[]`
- `rightFooter?: string`

Example:

```mdx
<BlogSplitComparison
  leftTitle={"What weak ad research looks like"}
  leftItems={[
    "Checking one platform in isolation",
    "Saving screenshots manually",
    "Reviewing competitor ads only before launches"
  ]}
  leftFooter={"This creates fragmented, outdated competitive insight."}
  rightTitle={"What strong ad research looks like"}
  rightItems={[
    "Tracking across Meta, Google, and LinkedIn",
    "Saving creative patterns in a structured workflow",
    "Reviewing changes continuously"
  ]}
  rightFooter={"This creates a live view of competitor strategy."}
/>
```

### `BlogDataTable`

Purpose: structured data table for comparisons, frameworks, or summarized findings.

Props:
- `headers: string[]`
- `rows: string[][]`

Example:

```mdx
<BlogDataTable
  headers={["Signal", "What it looks like", "What it tells you"]}
  rows={[
    [
      "Ad run time",
      "The same ad has been live for 30+ days",
      "Long run time is a strong proxy for performance"
    ],
    [
      "Creative repetition",
      "The same angle appears across multiple ads",
      "The team likely trusts that message"
    ]
  ]}
/>
```

## Standard Markdown Still Supported

Use normal Markdown for:
- `##` and `###` headings
- paragraphs
- bullet lists
- numbered lists
- normal inline links like `[Meta Ads Library](https://www.facebook.com/ads/library/)`
- normal Markdown tables
- emphasis like `**bold**` and `*italic*`

Example:

```mdx
## What to analyze in competitor ads

Start with the hook, then move to the offer, creative format, and landing page.

- Hook
- Offer
- Landing page
```

## Recommended Pattern For Claude

When Claude writes a new article:
- default to Markdown first
- use `BlogCallout` for important side notes
- use `BlogQuote` for highlighted analysis or multi-platform examples
- use `BlogImage` for screenshots and charts
- use `BlogTakeaways` near the end of major sections
- use `BlogSplitComparison` when contrasting weak vs strong strategies
- use `BlogDataTable` for frameworks and structured comparisons
- use `BlogCta` only once near the end unless asked otherwise

## Short Prompt For Claude

You can paste this into Claude:

```text
Write the article in clean MDX for the AdLuv blog.
Use standard Markdown by default.
Only use these custom components when they improve the article:
BlogCallout, BlogQuote, BlogCtaLink, BlogImage, BlogCta, BlogHookComparison, BlogNotePanel, BlogTakeaways, BlogSplitComparison, BlogDataTable.
Pass string props like title={"..."} and array props like items={["...", "..."]}.
Do not invent unsupported MDX components.
```
