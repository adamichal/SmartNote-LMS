import {
  MDXEditor,
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertImage,
  ListsToggle,
  UndoRedo,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { prepareMarkdownForDisplay, prepareMarkdownForSave } from "../utils/markdownImages";

export default function WysiwygNotebookEditor({ content, lectureId, onChange }) {
  const displayContent = prepareMarkdownForDisplay(content, lectureId);

  return (
    <div dir="rtl" className="wysiwyg-editor min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <MDXEditor
        key={lectureId}
        markdown={displayContent}
        onChange={(value) => onChange(prepareMarkdownForSave(value, lectureId))}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          imagePlugin({
            imageAutocompleteSuggestions: [],
          }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <BlockTypeSelect />
                <ListsToggle />
                <CreateLink />
                <InsertImage />
              </>
            ),
          }),
        ]}
        contentEditableClassName="notebook-content notebook-wysiwyg min-h-[60vh] p-6"
      />
    </div>
  );
}
