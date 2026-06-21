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
    <div className="editor-toolbar flex flex-wrap items-center gap-1 p-2">
      <button type="button" onClick={() => run("undo")} className="toolbar-btn" title="בטל">
        ↶
      </button>
      <button type="button" onClick={() => run("redo")} className="toolbar-btn" title="חזור">
        ↷
      </button>
      <span className="mx-1 h-6 w-px bg-slate-300" />
      <button type="button" onClick={() => run("bold")} className="toolbar-btn font-bold" title="מודגש">
        B
      </button>
      <button type="button" onClick={() => run("italic")} className="toolbar-btn italic" title="נטוי">
        I
      </button>
      <button type="button" onClick={() => run("underline")} className="toolbar-btn underline" title="קו תחתון">
        U
      </button>
      <span className="mx-1 h-6 w-px bg-slate-300" />
      <button type="button" onClick={() => setBlock("h1")} className="toolbar-btn" title="כותרת ראשית">
        H1
      </button>
      <button type="button" onClick={() => setBlock("h2")} className="toolbar-btn" title="כותרת משנה">
        H2
      </button>
      <button type="button" onClick={() => setBlock("h3")} className="toolbar-btn" title="כותרת קטנה">
        H3
      </button>
      <button type="button" onClick={() => setBlock("p")} className="toolbar-btn" title="פסקה">
        ¶
      </button>
      <span className="mx-1 h-6 w-px bg-slate-300" />
      <button type="button" onClick={() => run("insertUnorderedList")} className="toolbar-btn" title="רשימה">
        •
      </button>
      <button type="button" onClick={() => run("insertOrderedList")} className="toolbar-btn" title="רשימה ממוספרת">
        1.
      </button>
      <button type="button" onClick={() => run("formatBlock", "blockquote")} className="toolbar-btn" title="הדגשה / הגדרה">
        ❝
      </button>
    </div>
  );
}
