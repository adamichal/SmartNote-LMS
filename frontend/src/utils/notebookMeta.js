export function extractHeadings(markdown) {
  if (!markdown) return [];

  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,3}\s+/.test(line))
    .map((line, index) => {
      const level = line.match(/^#+/)[0].length;
      const text = line.replace(/^#+\s+/, "").replace(/\*\*/g, "");
      return {
        id: `heading-${index}`,
        level,
        text,
      };
    });
}

export function estimateReadingMinutes(markdown) {
  const words = markdown?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  return Math.max(1, Math.round(words / 180));
}
