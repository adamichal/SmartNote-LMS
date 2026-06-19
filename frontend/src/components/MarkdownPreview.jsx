import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

export function rewriteImageSrc(src, lectureId) {
  if (!src) return src;
  if (src.startsWith("./extracted_images/")) {
    const filename = src.replace("./extracted_images/", "");
    return `/api/lectures/${encodeURIComponent(lectureId)}/images/${encodeURIComponent(filename)}`;
  }
  return src;
}

export default function MarkdownPreview({ content, lectureId }) {
  return (
    <article dir="rtl" className="notebook-content h-full overflow-y-auto p-6">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          img: ({ src, alt }) => (
            <img
              src={rewriteImageSrc(src, lectureId)}
              alt={alt || ""}
              className="mx-auto my-4 max-w-full rounded-lg"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
