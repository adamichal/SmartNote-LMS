# מפרט תיקונים: ייצוא והעתקת מחברת ל-Word

מסמך זה מרכז את כל הבאגים, הדרישות וההקשר הטכני לתיקון מודול ה-Word Export בפרויקט SmartNote.  
מיועד להעברה לסוכן פיתוח (Claude / Cursor) לביצוע תיקונים.

---

## 1. הקשר כללי

### מה המערכת עושה
- אפליקציית LMS לעריכת מחברות לימוד בעברית (RTL).
- המחברת נכתבת ב-Markdown, מוצגת בעורך WYSIWYG (`VisualNotebookEditor`), ונשמרת חזרה כ-Markdown דרך Turndown.
- ייצוא ל-Word מתבצע בשני מסלולים:
  1. **העתק ל-Word** — HTML בפורמט MSO ללוח (Clipboard)
  2. **הורד Word** — קובץ `.docx` שנבנה ב-JSZip (ללא Pandoc)

### נקודות כניסה ב-UI
- `frontend/src/pages/NotebookEditor.jsx`
- כפתורים: "העתק ל-Word", "הורד Word"
- אפשרויות: בחירת פונט (Assistant / Playpen Sans Hebrew), תיבת סימון "כלול תמונות ב-Word"

### צינור העיבוד (Pipeline)
```
Markdown (מהעורך)
  → prepareMarkdownForDisplay()     [markdownImages.js — URLs לתמונות]
  → normalizeMarkdownForWordExport() [normalizeMarkdown.js]
  → parseNotebookMarkdown()         [parseMarkdown.js — בלוקים: h1, p, ul, image...]
  → resolveBlockImages()            [imageResolver.js — אם includeImages]
  → renderWordClipboardHtml()       [wordClipboard.js + msoHtml.js]  — להעתקה
  → buildDocxBlob()                 [docxBuilder.js]                  — להורדה
```

### קבצים רלוונטיים
| קובץ | תפקיד |
|------|--------|
| `frontend/src/utils/wordExport/index.js` | Orchestration |
| `frontend/src/utils/wordExport/parseMarkdown.js` | פענוח Markdown לבלוקים |
| `frontend/src/utils/wordExport/normalizeMarkdown.js` | ניקוי שורות לפני פענוח |
| `frontend/src/utils/wordExport/helpers.js` | Bidi, ריווח, escape |
| `frontend/src/utils/wordExport/inlineSegments.js` | Bold, italic, math, code |
| `frontend/src/utils/wordExport/wordClipboard.js` | רינדור HTML ל-Clipboard |
| `frontend/src/utils/wordExport/msoHtml.js` | עטיפת MSO, כותרות, רשימות, תיבות צבועות |
| `frontend/src/utils/wordExport/docxBuilder.js` | בניית DOCX |
| `frontend/src/utils/wordExport/imageResolver.js` | הורדת תמונות כ-base64/bytes |
| `frontend/src/utils/wordExport/config.js` | פונטים + localStorage |
| `frontend/src/utils/htmlToMarkdown.js` | המרה מ-HTML לשמירה (Turndown) |
| `frontend/src/utils/decorateNotebookDom.js` | הגדרות, callouts, תמונות ב-DOM |

---

## 2. מה כבר עובד (לא לשבור)

- **תמונות** — הטמעה ב-Clipboard (base64) וב-DOCX (קבצי media) — עובד טוב.
- **תיבות צבועות** — הגדרות (ורוד), callouts (סיכום מהיר, נקודות למבחן וכו'), blockquotes — עובד טוב.
- **בחירת פונט** — Assistant / Playpen Sans Hebrew (ב-HTML/CSS וב-styles.xml של DOCX).
- **תיקונים קודמים שבוצעו:**
  - הסרת תווי LRI/PDI (`U+2066`/`U+2069`) שגרמו לריבועים עם `?` ב-Word
  - `**bold**` מול `*italic*` (לא לבלבל ביניהם)
  - סינון שורות רשימה ריקות (`-`, `*`)
  - פורמט MSO לכותרות (`MsoHeading1`–`4`)
  - `renderMsoListReset()` אחרי תמונות ורשימות
  - ריווח בסיסי בין ספרות לעברית (`1חקלאות` → `1 חקלאות`)

---

## 3. באגים פתוחים — לתיקון

### 3.1 רשימות מקוננות — הזחות לא תקינות

**תיאור:**  
לפעמים יש רשימה בתוך רשימה (רמה 2, 3). כרגע הכל נראה ברמה הראשונה.

**דוגמת Markdown:**
```markdown
- פריט ראשון
  - תת-פריט (הזחה של 2 רווחים)
    - תת-תת-פריט (4 רווחים)
```

**מצב נוכחי בקוד:**
- `parseMarkdown.js` — `parseListItem()` מחשב `indent: Math.floor(indent / 2)` לפי מספר רווחים לפני `-`.
- `wordClipboard.js` — `renderMsoListItem()` **לא** מעביר `indent` ל-HTML; כל ה-`<li>` נראים אותו דבר.
- `docxBuilder.js` — `ilvl` מועבר ל-`numPr`, אבל `generateNumberingXml()` מגדיר **רק `ilvl=0`** לרשימות תבליטים — אין רמות 1, 2, 3.

**נדרש:**
1. ב-`msoHtml.js` / `wordClipboard.js`: הזחת `<li>` לפי `item.indent` (למשל `margin-right: 24px * (indent+1)` או רשימות מקוננות `<ul>` בתוך `<li>`).
2. ב-`docxBuilder.js` → `generateNumberingXml()`: הוספת `<w:lvl w:ilvl="1">`, `ilvl="2"`, `ilvl="3"` עם `w:ind w:right` גדל ו-`w:lvlText` שונה (למשל `◦`, `▪`).
3. ב-Clipboard: שקול שימוש ב-`mso-list` עם רמות, או HTML מקונן `<ul><li>פריט<ul><li>תת</li></ul></li></ul>` — Word מכבד מקוננות טוב יותר מ-margin בלבד.
4. רשימות ממוספרות מקוננות: כרגע `ol` תמיד `ilvl=0` — לתקן גם שם.

**בדיקה:**
- רשימה עם 3 רמות הזחה → ב-Word כל רמה מוזחת ימינה (RTL) עם סמן שונה.

---

### 3.2 סוגריים מעורבים עברית+אנגלית — הפוכים

**תיאור:**  
ביטויים כמו `(גבול אפשרויות הייצור - PPF)` או `(Production Possibilities - עברית)` מוצגים עם סדר תווים שגוי / סוגריים הפוכים.

**מצב נוכחי:**
- `helpers.js` → `tokenizeMixedText()` מזהה סוגריים **רק** אם יש בתוכם `[A-Za-z0-9]` — ואז כולם מסומנים כ-LTR שלם.
- סוגריים עם **גם עברית וגם אנגלית** עשויים לא להתאים ל-regex, ואז מתפצלים לריצות RTL/LTR נפרדות → בלגן ב-Word.

**נדרש:**
1. הרחבת זיהוי סוגריים: `/^\([^)\n]+\)/` — כל תוכן בסוגריים כיחידה אחת, עם `dir` נכון:
   - אם יש אנגלית בתוך הסוגריים → `<span dir="ltr" style="unicode-bidi:embed;">(תוכן)</span>` בתוך פסקת RTL
   - אם רק עברית → חלק מ-RTL
2. **אל** להשתמש שוב ב-`U+2066`/`U+2069` — Word מציג אותם כריבועים.
3. אותו טיפול לסוגריים מרובעים `[...]`.
4. בדיקה עם: `עקומת התמורה (גבול אפשרויות הייצור - PPF)` — הסוגריים והמקף והאנגלית בסדר קריאה טבעי.

---

### 3.3 חוסר רווח אחרי Bold או אחרי נקודתיים

**תיאור:**  
אחרי `**מילה**` או אחרי `:` אין רווח לפני המילה הבאה.  
דוגמה: `**משק א':**1 חקלאות` במקום `**משק א':** 1 חקלאות`.

**מצב נוכחי:**
- `inlineSegments.js` — מפרק `**...**` אבל לא מוסיף רווחים בין segments.
- `normalizeMixedScriptSpacing()` מוסיף רווח רק בין ספרה לעברית, לא אחרי bold/colon.

**נדרש:**
1. ב-`normalizeMixedScriptSpacing()` או שלב חדש `normalizeInlineSpacing()`:
   ```javascript
   .replace(/(\*\*[^*]+\*\*)([\u0590-\u05FF])/g, '$1 $2')
   .replace(/(\*\*[^*]+\*\*)(\d)/g, '$1 $2')
   .replace(/:([\u0590-\u05FF])/g, ': $1')
   .replace(/:([A-Za-z0-9])/g, ': $1')
   ```
2. ב-`renderInlineForWord()` — לוודא שבין segment שמסתיים ב-`**` לבין segment טקסט יש רווח ב-HTML אם חסר במקור.
3. ב-DOCX (`buildInlineRuns`) — אותו עיקרון ב-`w:t`.
4. זהירות: לא להוסיף רווח לפני `:` בזמן (`12:30`) או ב-URL.

---

### 3.4 נקודות רשימה אקראיות (תבליטים רפאים)

**תיאור:**  
בין פסקאות, אחרי תמונות, או בשורות ריקות — מופיעה נקודת תבליט `•` בלי תוכן.

**מקורות אפשריים:**
1. שורות `-` / `*` ריקות ב-Markdown (מ-Turndown / עורך contentEditable)
2. Word ממשיך "רשימה פעילה" אחרי `</ul>` או `<img>` — `renderMsoListReset()` לא מספיק
3. `<ul></ul>` ריק שנוצר כשכל הפריטים מסוננים
4. `figcaption` או שאריות DOM שהופכות לשורות מוזרות

**מצב נוכחי:**
- `normalizeMarkdown.js` — מסנן `^\s*[-*+•]\s*$` ופריטי רשימה ריקים
- `htmlToMarkdown.js` — מסנן שורות דומות; `figcaption` → ריק
- `parseMarkdown.js` — מסנן רשימות ריקות ב-grouping
- `renderMsoListReset()` — אחרי תמונה ומעבר רשימה→לא-רשימה

**נדרש:**
1. לחזק את `renderMsoListReset()` — אולי שני פסקאות איפוס, או:
   ```html
   <p class=MsoNormal style='mso-list:none;mso-margin-top-alt:auto;
   mso-margin-bottom-alt:auto'><span style='mso-list:Ignore'>&nbsp;</span></p>
   ```
2. אחרי **כל** `</ul>` / `</ol>` — הוסף איפוס רשימה לפני הבלוק הבא.
3. בדוק שאין פלט של `<ul>` / `<ol>` ללא `<li>` עם תוכן.
4. ב-`htmlToMarkdown`: סנן גם `^\s*-\s+\*\s*$` ושורות שמכילות רק תו bullet.
5. לשקול: אחרי `![תמונה](...)` ב-markdown, לסנן שורות `-` בודדות שאחריהן.

**בדיקה:**  
הדבקה ב-Word — אין `•` בודדים בין פסקאות, לפני/אחרי תמונות.

---

### 3.5 כותרות — אין הבדל ויזואלי מספיק מפסקה רגילה

**תיאור:**  
ב-Word, H1/H2/H3 נראים כמעט כמו טקסט רגיל — אין הבדל ברור בגודל, מרווח, או בהיררכיה.

**מצב נוכחי:**
- `msoHtml.js` — גדלים: h1=16pt, h2=14pt, h3=13pt, h4=12pt, body=12pt — **הפער קטן מדי** (4pt בין h1 ל-body).
- `renderMsoHeading()` — יש `font-weight:bold` ב-CSS, אבל ה-span הפנימי עלול לדרוס.
- ב-DOCX: Heading1=16pt (32 half-points), Heading2=14pt — גם כאן הפער קטן.

**נדרש:**
1. הגדלים המוצעים (בהשראת העורך ב-`index.css`):
   | רמה | גודל | משקל | צבע / הערות |
   |-----|------|------|-------------|
   | H1 | 22–24pt | bold | `#0f172a` |
   | H2 | 18pt | bold | `#2E4057` |
   | H3 | 15pt | bold | `#334155` |
   | H4 | 13pt | semibold | `#475569` |
   | Body | 12pt | normal | שחור |
2. מרווחים: `margin-top` גדול יותר לפני כותרות (למשל 18pt לפני H2).
3. ב-MSO Clipboard — לוודא ש-`mso-style-name:"Heading N"` ו-`mso-outline-level:N` מופיעים **גם ב-inline style** של ה-`<p>`.
4. ב-DOCX — לעדכן `generateStylesXml()` עם גדלים בולטים יותר (`w:sz w:val="44"` ל-H1 = 22pt).
5. אופציונלי: קו תחתון עדין ל-H2, או `page-break-after:avoid`.

**בדיקה:**  
מסמך עם `#`, `##`, `###` — ב-Word ברור מי כותרת ראשית, משנית ומשנה.

---

### 3.6 בעיות RTL / עברית-אנגלית (מסכמים מהשיחה)

| בעיה | דוגמה | סטטוס |
|------|--------|--------|
| ריבועים עם `?` | ליד סוגריים / אנגלית | תוקן (הסרת LRI/PDI) — לוודא שלא חזר |
| ריווח מספר–מילה | `1חקלאות` | חלקי — לוודא שלא שובר `1X`, `5Y` |
| נקודה בסוף משפט | `5Y .` או `.הרווח` | חלקי — להרחיב בדיקות |
| Bold במקומות שגויים | `*` כבולד | תוקן — רק `**` |
| נקודה אחרי תמונה | תבליט רפא | חלקי — ראה 3.4 |

---

## 4. דרישות פונקציונליות (מהשיחה המלאה)

### 4.1 העתקה ל-Word (Clipboard)
- [ ] HTML בפורמט MSO ש-Word מזהה
- [ ] כותרות כ-Heading 1–4 (ניווט + סגנונות)
- [ ] רשימות ממוספרות ותבליטים, **כולל מקוננות**
- [ ] הגדרות ו-callouts בתיבות צבועות
- [ ] נוסחאות MathML (KaTeX → MathML) — קיים
- [ ] תמונות (אופציונלי, base64) — **עובד**
- [ ] RTL תקין לעברית + קטעי LTR מבודדים לאנגלית/נוסחאות

### 4.2 הורדת DOCX
- [ ] אותן יכולות כמו Clipboard (ככל האפשר)
- [ ] תמונות מוטמעות ב-`word/media/` — **עובד**
- [ ] פונט נבחר (Assistant / Playpen Sans Hebrew) — שים לב: הפונט לא מוטמע בקובץ; המשתמש צריך להתקין

### 4.3 אפשרויות UI (קיימות — לשמור)
- בורר פונט Word
- תיבת סימון "כלול תמונות ב-Word"

---

## 5. מבנה Markdown של המחברת

### כותרות
```markdown
# נושא ראשי
## תת-נושא
### דוגמה
#### פרט
```

### הגדרה (blockquote)
```markdown
> **הגדרה — מונח:** הסבר קצר
```
ב-DOM מקבל class `notebook-definition` (רקע ורוד).

### Callouts (זיהוי לפי כותרת H2)
- `## סיכום מהיר`
- `## מיקום בקורס` / `🔗 מיקום בקורס`
- `## נקודות למבחן` / `💡 נקודות למבחן`
- `## נושאים מהמצגת שלא נדונו`

### תמונות
```markdown
![שקף 8 — תיאור](./extracted_images/page_008.png)
```
אחרי `prepareMarkdownForDisplay` ה-URL הופך ל-`/api/courses/.../images/page_008.png`.

### רשימות מקוננות
```markdown
- רמה 1
  - רמה 2
    - רמה 3
```

---

## 6. הנחיות יישום

### עקרונות
1. **שינוי מינימלי** — לגעת רק ב-`frontend/src/utils/wordExport/` ו-`htmlToMarkdown.js` לפי הצורך.
2. **אל תשבור** תמונות ותיבות צבועות שכבר עובדות.
3. **בלי LRI/PDI** בפלט ל-Word.
4. **בדיקה ידנית** — העתקה ל-Word Desktop (Windows), הדבקה עם Ctrl+V.
5. **אין commit** אלא אם המשתמש מבקש.

### סדר עבודה מומלץ
1. רשימות מקוננות (parse + msoHtml + numbering.xml)
2. סוגריים מעורבים (helpers.js bidi)
3. רווחים אחרי bold / נקודתיים (normalize + inline)
4. תבליטים רפאים (list reset + סינון)
5. כותרות — הגדלת פער ויזואלי (msoHtml + docxBuilder styles)

### בדיקות ידניות (Checklist)
```
[ ] H1 גדול ובולט משמעותית מ-H2 ומפסקה
[ ] H2 נראה ככותרת משנה (לא כמו bold רגיל)
[ ] רשימה עם 3 רמות הזחה — כל רמה מוזחת
[ ] (עברית - PPF) — סוגריים ותוכן בכיוון נכון
[ ] **משק א':** 1 חקלאות — רווח אחרי נקודתיים
[ ] אין • בודד בין פסקאות / אחרי תמונה
[ ] הגדרה — רקע ורוד ב-Word
[ ] תמונה מוצגת (עם "כלול תמונות")
[ ] 1X = 5Y — ללא רווח מיותר בין ספרה לאות לטינית
```

---

## 7. קטעי קוד רלוונטיים (נקודות כניסה)

### חישוב indent ברשימה (קיים אך לא מיושם ב-HTML)
```javascript
// parseMarkdown.js
indent: indent > 0 ? Math.floor(indent / 2) : 0,
```

### רשימת תבליטים ב-DOCX — רק רמה 0 ב-numbering
```xml
<!-- docxBuilder.js generateNumberingXml -->
<w:lvl w:ilvl="0">...</w:lvl>
<!-- חסר: ilvl 1, 2, 3 -->
```

### זיהוי סוגריים LTR (צריך הרחבה)
```javascript
// helpers.js — רק אם יש אנגלית בתוך הסוגריים
const parenMatch = slice.match(/^\([^)\n]*[A-Za-z0-9][^)\n]*\)/);
```

### כותרת MSO (להגדיל גדלים)
```javascript
// msoHtml.js
const HEADING_SIZES = { h1: "16.0pt", h2: "14.0pt", h3: "13.0pt", h4: "12.0pt" };
```

---

## 8. מה לא לעשות

- לא להשתמש ב-Pandoc לייצוא הזה (המסלול הוא client-side).
- לא להטמיע פונט ב-DOCX (מורכב מדי; מספיק שם הפונט).
- לא לשנות את עורך המחברת / pipeline של Gemini.
- לא להסיר את אפשרות התמונות והתיבות שעובדות.

---

## 9. סיכום עדיפויות

| עדיפות | נושא | חומרה |
|--------|------|--------|
| P0 | רשימות מקוננות | גבוהה |
| P0 | סוגריים עברית+אנגלית | גבוהה |
| P1 | רווח אחרי bold / `:` | בינונית |
| P1 | תבליטים אקראיים | בינונית |
| P1 | הבחנה ויזואלית בין כותרות | בינונית |
| P2 | ליטוש RTL כללי (נקודות בסוף משפט) | נמוכה |

---

*נוצר מתוך שיחת פיתוח SmartNote — יולי 2026*
