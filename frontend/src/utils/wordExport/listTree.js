/** Build a tree from flat list items using their indent levels. */
export function buildListTree(items) {
  const root = [];
  const stack = [{ level: -1, children: root }];

  for (const item of items) {
    const level = Math.min(Math.max(item.indent || 0, 0), 3);
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    const node = { item, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push({ level, children: node.children });
  }

  return root;
}

export function listIndentLevel(line) {
  const match = line.match(/^(\s*)[-*+]\s/);
  if (!match) return 0;
  const spaces = match[1].length;
  if (spaces === 0) return 0;
  return Math.min(Math.ceil(spaces / 2), 3);
}

export function orderedListIndentLevel(line) {
  const match = line.match(/^(\s*)\d+\.\s/);
  if (!match) return 0;
  const spaces = match[1].length;
  if (spaces === 0) return 0;
  return Math.min(Math.ceil(spaces / 2), 3);
}

function classifyBoldColonItem(content) {
  const match = content.match(/^\*\*([^*]+):\*\*(.*)$/s);
  if (!match) return null;
  return { label: match[1].trim(), rest: match[2].trim() };
}

/**
 * Infer nesting for flat bullet lists where Gemini uses **label:** headers
 * without markdown indentation (common in Hebrew lecture notes).
 */
export function applySemanticListNesting(items) {
  if (items.some((item) => (item.indent || 0) > 0)) return items;

  let context = 0;
  return items.map((item) => {
    const classified = classifyBoldColonItem(item.content);
    let indent;

    if (!classified) {
      return { ...item, indent: Math.min(context, 3) };
    }

    const { label, rest } = classified;

    if (/^(מסקנה|סיכום|הערה|דוגמה)$/i.test(label)) {
      context = 0;
      indent = 0;
    } else if (rest.length > 20) {
      context = 0;
      indent = 0;
    } else if (/^עובד\b/i.test(label)) {
      indent = Math.max(context, 2);
    } else if (/^עלות\b/i.test(label) && rest.length < 3) {
      context = 1;
      indent = 1;
    } else if (rest.length < 3) {
      indent = Math.min(context + 1, 3);
      context = indent;
    } else {
      indent = context;
    }

    return { ...item, indent: Math.min(indent, 3) };
  });
}
