export const DIAGRAM_TEMPLATES = [
  {
    id: "architecture",
    label: "ארכיטקטורה",
    description: "שכבות לקוח, שרת ונתונים",
    source: `flowchart TB
    subgraph client["שכבת לקוח"]
        UI["ממשק משתמש"]
    end
    subgraph server["שכבת שרת"]
        API["API"]
        BL["לוגיקה עסקית"]
    end
    subgraph data["שכבת נתונים"]
        DB[("מסד נתונים")]
    end
    UI --> API
    API --> BL
    BL --> DB`,
  },
  {
    id: "algorithm",
    label: "זרימת אלגוריתם",
    description: "תנאים, ענפים וסיום",
    source: `flowchart TD
    start(["התחלה"]) --> input["קלט"]
    input --> check{"תנאי?"}
    check -->|"כן"| yes["פעולה א"]
    check -->|"לא"| no["פעולה ב"]
    yes --> endNode(["סיום"])
    no --> endNode`,
  },
  {
    id: "data-model",
    label: "מודל נתונים",
    description: "ישויות וקשרים (ER)",
    source: `erDiagram
    ENTITY_A ||--o{ ENTITY_B : "קשר"
    ENTITY_A {
        int id
        string name
    }
    ENTITY_B {
        int id
        string title
    }`,
  },
  {
    id: "mindmap",
    label: "מפת מוח / עץ",
    description: "היררכיה עם ענפים",
    source: `mindmap
  root((נושא מרכזי))
    ענף א
      נקודה 1
      נקודה 2
    ענף ב
      נקודה 3`,
  },
];

export function getDiagramTemplate(id) {
  return DIAGRAM_TEMPLATES.find((template) => template.id === id);
}
