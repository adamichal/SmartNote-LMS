import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { prepareMarkdownForDisplay } from "../utils/markdownImages";

export default function MarkdownPreview({ content, lectureId }) {
  const displayContent = prepareMarkdownForDisplay(content, lectureId);

  return (
    <article dir="rtl" className="notebook-content h-full overflow-y-auto p-6">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt || ""}
              className="mx-auto my-4 max-w-full rounded-lg"
              loading="lazy"
            />
          ),
        }}
      >
        {displayContent}
      </ReactMarkdown>
    </article>
  );
}
