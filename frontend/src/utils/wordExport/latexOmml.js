import { escapeXml } from "./helpers";

function tokenizeLatex(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    if (source[index] === "\\") {
      let command = "\\";
      index += 1;
      while (index < source.length && /[a-zA-Z]/.test(source[index])) {
        command += source[index];
        index += 1;
      }
      if (command === "\\" && index < source.length) {
        command += source[index];
        index += 1;
      }
      tokens.push({ type: "cmd", value: command });
    } else if (source[index] === "{") {
      tokens.push({ type: "{" });
      index += 1;
    } else if (source[index] === "}") {
      tokens.push({ type: "}" });
      index += 1;
    } else if (source[index] === "_") {
      tokens.push({ type: "_" });
      index += 1;
    } else if (source[index] === "^") {
      tokens.push({ type: "^" });
      index += 1;
    } else if (source[index] === " ") {
      index += 1;
    } else {
      tokens.push({ type: "char", value: source[index] });
      index += 1;
    }
  }
  return tokens;
}

function parseGroup(tokens, position) {
  if (position < tokens.length && tokens[position].type === "{") {
    position += 1;
    return parseLatexTokens(tokens, position);
  }
  if (position < tokens.length) {
    if (tokens[position].type === "char") {
      return {
        xml: `<m:r><m:t>${escapeXml(tokens[position].value)}</m:t></m:r>`,
        pos: position,
      };
    }
    if (tokens[position].type === "cmd") {
      const result = parseLatexTokens(tokens, position);
      return { xml: result.xml, pos: result.pos - 1 };
    }
  }
  return { xml: "", pos: position - 1 };
}

const SYMBOL_MAP = {
  "\\alpha": "α",
  "\\beta": "β",
  "\\gamma": "γ",
  "\\delta": "δ",
  "\\epsilon": "ε",
  "\\theta": "θ",
  "\\lambda": "λ",
  "\\mu": "μ",
  "\\pi": "π",
  "\\sigma": "σ",
  "\\phi": "φ",
  "\\psi": "ψ",
  "\\omega": "ω",
  "\\Gamma": "Γ",
  "\\Delta": "Δ",
  "\\Theta": "Θ",
  "\\Lambda": "Λ",
  "\\Pi": "Π",
  "\\Sigma": "Σ",
  "\\Phi": "Φ",
  "\\Psi": "Ψ",
  "\\Omega": "Ω",
  "\\infty": "∞",
  "\\partial": "∂",
  "\\nabla": "∇",
  "\\forall": "∀",
  "\\exists": "∃",
  "\\in": "∈",
  "\\notin": "∉",
  "\\subset": "⊂",
  "\\supset": "⊃",
  "\\cup": "∪",
  "\\cap": "∩",
  "\\emptyset": "∅",
  "\\leq": "≤",
  "\\geq": "≥",
  "\\neq": "≠",
  "\\approx": "≈",
  "\\equiv": "≡",
  "\\times": "×",
  "\\div": "÷",
  "\\pm": "±",
  "\\mp": "∓",
  "\\cdot": "·",
  "\\circ": "∘",
  "\\rightarrow": "→",
  "\\leftarrow": "←",
  "\\Rightarrow": "⇒",
  "\\Leftarrow": "⇐",
};

function parseLatexTokens(tokens, position) {
  let xml = "";
  while (position < tokens.length) {
    const token = tokens[position];
    if (token.type === "}") return { xml, pos: position };

    if (token.type === "cmd") {
      if (token.value === "\\frac") {
        position += 1;
        const numerator = parseGroup(tokens, position);
        position = numerator.pos + 1;
        const denominator = parseGroup(tokens, position);
        position = denominator.pos + 1;
        xml += `<m:f><m:fPr><m:ctrlPr/></m:fPr><m:num>${numerator.xml}</m:num><m:den>${denominator.xml}</m:den></m:f>`;
        continue;
      }
      if (token.value === "\\sum" || token.value === "\\prod") {
        const character = token.value === "\\sum" ? "∑" : "∏";
        position += 1;
        let subXml = "";
        let supXml = "";
        while (
          position < tokens.length &&
          (tokens[position].type === "_" || tokens[position].type === "^")
        ) {
          if (tokens[position].type === "_") {
            position += 1;
            const sub = parseGroup(tokens, position);
            subXml = sub.xml;
            position = sub.pos + 1;
          } else {
            position += 1;
            const sup = parseGroup(tokens, position);
            supXml = sup.xml;
            position = sup.pos + 1;
          }
        }
        xml += `<m:nary><m:naryPr><m:chr m:val="${character}"/><m:limLoc m:val="undOvr"/><m:ctrlPr/></m:naryPr><m:sub>${subXml}</m:sub><m:sup>${supXml}</m:sup><m:e><m:r><m:t> </m:t></m:r></m:e></m:nary>`;
        continue;
      }
      if (token.value === "\\dots" || token.value === "\\ldots" || token.value === "\\cdots") {
        xml += "<m:r><m:t>…</m:t></m:r>";
        position += 1;
        continue;
      }
      if (token.value === "\\text") {
        position += 1;
        const group = parseGroup(tokens, position);
        const plain = group.xml.replace(/<[^>]+>/g, "");
        xml += `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>${escapeXml(plain)}</m:t></m:r>`;
        position = group.pos + 1;
        continue;
      }
      if (token.value === "\\left" || token.value === "\\right") {
        position += 1;
        if (position < tokens.length && tokens[position].type === "char") position += 1;
        continue;
      }
      if (SYMBOL_MAP[token.value]) {
        xml += `<m:r><m:t>${SYMBOL_MAP[token.value]}</m:t></m:r>`;
        position += 1;
        continue;
      }
      xml += `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>${escapeXml(token.value.slice(1))}</m:t></m:r>`;
      position += 1;
      continue;
    }

    if (token.type === "char") {
      let charXml = `<m:r><m:t>${escapeXml(token.value)}</m:t></m:r>`;
      position += 1;
      while (
        position < tokens.length &&
        (tokens[position].type === "_" || tokens[position].type === "^")
      ) {
        if (tokens[position].type === "_") {
          position += 1;
          const sub = parseGroup(tokens, position);
          charXml = `<m:sSub><m:sSubPr><m:ctrlPr/></m:sSubPr><m:e>${charXml}</m:e><m:sub>${sub.xml}</m:sub></m:sSub>`;
          position = sub.pos + 1;
        } else {
          position += 1;
          const sup = parseGroup(tokens, position);
          charXml = `<m:sSup><m:sSupPr><m:ctrlPr/></m:sSupPr><m:e>${charXml}</m:e><m:sup>${sup.xml}</m:sup></m:sSup>`;
          position = sup.pos + 1;
        }
      }
      xml += charXml;
      continue;
    }

    if (token.type === "{") {
      position += 1;
      const group = parseLatexTokens(tokens, position);
      xml += group.xml;
      position = group.pos + 1;
      continue;
    }

    if (token.type === "_" || token.type === "^") {
      position += 1;
      const argument = parseGroup(tokens, position);
      if (token.type === "_") {
        xml += `<m:sSub><m:sSubPr><m:ctrlPr/></m:sSubPr><m:e><m:r><m:t> </m:t></m:r></m:e><m:sub>${argument.xml}</m:sub></m:sSub>`;
      } else {
        xml += `<m:sSup><m:sSupPr><m:ctrlPr/></m:sSupPr><m:e><m:r><m:t> </m:t></m:r></m:e><m:sup>${argument.xml}</m:sup></m:sSup>`;
      }
      position = argument.pos + 1;
      continue;
    }

    position += 1;
  }

  return { xml, pos: position };
}

export function latexToOMML(latex) {
  try {
    const tokens = tokenizeLatex(latex);
    const parsed = parseLatexTokens(tokens, 0);
    return `<m:oMath>${parsed.xml}</m:oMath>`;
  } catch {
    return `<m:oMath><m:r><m:t>${escapeXml(latex)}</m:t></m:r></m:oMath>`;
  }
}
