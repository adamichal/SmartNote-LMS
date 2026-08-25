export const WORD_FONTS = {
  assistant: {
    id: "assistant",
    label: "Assistant",
    css: "Assistant, 'Segoe UI', Arial, sans-serif",
    docx: "Assistant",
  },
  playpen: {
    id: "playpen",
    label: "Playpen Sans Hebrew",
    css: "'Playpen Sans Hebrew', Assistant, 'Segoe UI', sans-serif",
    docx: "Playpen Sans Hebrew",
  },
};

const STORAGE_KEY = "smartnote.wordExportFont";

export function getWordExportFont() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return WORD_FONTS[stored] ? stored : "playpen";
  } catch {
    return "playpen";
  }
}

export function setWordExportFont(fontId) {
  try {
    if (WORD_FONTS[fontId]) {
      localStorage.setItem(STORAGE_KEY, fontId);
    }
  } catch {
    // ignore storage errors
  }
}

export function resolveWordFont(fontId) {
  return WORD_FONTS[fontId] || WORD_FONTS.assistant;
}
