function exec(command, value = null) {
  document.execCommand(command, false, value);
}

export default function EditorToolbar({ editorRef }) {
  function focusEditor() {
    editorRef.current?.focus();
  }

  function run(command, value = null) {
    focusEditor();
    exec(command, value);
  }

  function setBlock(tag) {
    focusEditor();
    exec("formatBlock", tag);
  }

  return (
    <div className="editor-toolbar flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 p-2">
      <button type="button" onClick={() => run("undo")} className="toolbar-btn" title="Undo">
        ↶
      </button>
      <button type="button" onClick={() => run("redo")} className="toolbar-btn" title="Redo">
        ↷
      </button>
      <span className="mx-1 h-6 w-px bg-gray-300" />
      <button type="button" onClick={() => run("bold")} className="toolbar-btn font-bold" title="Bold">
        B
      </button>
      <button type="button" onClick={() => run("italic")} className="toolbar-btn italic" title="Italic">
        I
      </button>
      <button type="button" onClick={() => run("underline")} className="toolbar-btn underline" title="Underline">
        U
      </button>
      <span className="mx-1 h-6 w-px bg-gray-300" />
      <button type="button" onClick={() => setBlock("h1")} className="toolbar-btn" title="Heading 1">
        H1
      </button>
      <button type="button" onClick={() => setBlock("h2")} className="toolbar-btn" title="Heading 2">
        H2
      </button>
      <button type="button" onClick={() => setBlock("h3")} className="toolbar-btn" title="Heading 3">
        H3
      </button>
      <button type="button" onClick={() => setBlock("p")} className="toolbar-btn" title="Paragraph">
        P
      </button>
      <span className="mx-1 h-6 w-px bg-gray-300" />
      <button type="button" onClick={() => run("insertUnorderedList")} className="toolbar-btn" title="Bullet list">
        •
      </button>
      <button type="button" onClick={() => run("insertOrderedList")} className="toolbar-btn" title="Numbered list">
        1.
      </button>
    </div>
  );
}
