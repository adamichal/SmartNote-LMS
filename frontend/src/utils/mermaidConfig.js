let mermaidApi = null;
let initialized = false;

export async function getMermaid() {
  if (!mermaidApi) {
    const module = await import("mermaid");
    mermaidApi = module.default ?? module;
  }
  if (!initialized) {
    mermaidApi.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "base",
      fontFamily: "Assistant, Segoe UI, Arial, sans-serif",
      flowchart: {
        htmlLabels: true,
        curve: "basis",
        padding: 28,
        nodeSpacing: 55,
        rankSpacing: 55,
        wrappingWidth: 420,
        useMaxWidth: false,
      },
      mindmap: {
        padding: 20,
        useMaxWidth: true,
      },
      themeVariables: {
        fontFamily: "Assistant, Segoe UI, Arial, sans-serif",
        fontSize: "20px",
        primaryColor: "#f0f9ff",
        primaryTextColor: "#1e293b",
        primaryBorderColor: "#7dd3fc",
        secondaryColor: "#f7f3ed",
        secondaryTextColor: "#1e293b",
        secondaryBorderColor: "#dcc9b6",
        tertiaryColor: "#fff7ed",
        tertiaryTextColor: "#1e293b",
        tertiaryBorderColor: "#fdba74",
        lineColor: "#64748b",
        textColor: "#1e293b",
        mainBkg: "#f7f3ed",
        nodeBorder: "#c9b8a5",
        clusterBkg: "#f8fafc",
        clusterBorder: "#cbd5e1",
        titleColor: "#0f172a",
        edgeLabelBackground: "#ffffff",
      },
    });
    initialized = true;
  }
  return mermaidApi;
}

/** @deprecated use getMermaid() */
export function initMermaid() {
  void getMermaid();
}
