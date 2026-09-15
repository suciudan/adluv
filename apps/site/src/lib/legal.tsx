import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";

export async function renderLegalMdx(source: string) {
  const { content } = await compileMDX({
    source,
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
      },
    },
    components: {
      h2: ({ children }) => <h2 className="text-2xl md:text-3xl">{children}</h2>,
      h3: ({ children }) => <h3 className="mt-8 mb-4 text-xl md:text-2xl">{children}</h3>,
      p: ({ children }) => <p className="my-4">{children}</p>,
      ul: ({ children }) => <ul className="my-5 list-disc pl-6">{children}</ul>,
      ol: ({ children }) => <ol className="my-5 list-decimal pl-6">{children}</ol>,
      li: ({ children }) => <li className="my-2 pl-1">{children}</li>,
    },
  });

  return content;
}
