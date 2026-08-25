import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { prepareMarkdownForDisplay } from "../utils/markdownImages";

export default function MarkdownPreview({ content, courseName, lectureId }) {
  const displayContent = prepareMarkdownForDisplay(content, courseName, lectureId);

  return (
    <article dir="rtl" className="notebook-content h-full overflow-y-auto p-6">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          img: ({ src, alt }) => (
            <figure className="notebook-figure">
              <img
                src={src}
                alt={alt || ""}
                className="notebook-image"
                loading="lazy"
              />
              {alt && <figcaption className="notebook-figure__caption">{alt}</figcaption>}
            </figure>
          ),
        }}
      >
        {displayContent}
      </ReactMarkdown>
    </article>
  );
}
