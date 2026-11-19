export function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

// Recognize mathematical islands in the atlas's plain-text notation. A word
// outside this vocabulary ends the expression and remains ordinary reader text.
const token = /o_eff|DTIME|poly|max|log₂?|[0-9]+|[A-Za-zα-ωΑ-Ω]|[()^_=<>≤≥≠+·×/,−-]/uy;
const word = /[\p{L}\p{N}_]/u;
const operators = new Set(['=', '<', '>', '≤', '≥', '≠', '+', '·', '×', '/', '−', '-']);

function formula(text, start, standalone = false) {
  let pos = start;
  let mathematical = false;
  function peek() {
    token.lastIndex = pos;
    return token.exec(text)?.[0];
  }
  function spaces() { while (text[pos] === ' ') pos++; }
  function group(showParens) {
    pos++;
    const body = sequence(true);
    if (!body || text[pos] !== ')') throw new SyntaxError();
    pos++;
    return '<mrow>' + (showParens ? '<mo>(</mo>' + body + '<mo>)</mo>' : body) + '</mrow>';
  }
  function atom() {
    const value = peek();
    if (value === '(') return group(true);
    if (!value || !/^[\p{L}\p{N}]/u.test(value)) return '';
    pos += value.length;
    // Do not split prose (or an identifier) into single-letter variables.
    if (/[A-Za-z]/.test(value.at(-1)) && /[A-Za-z]/.test(text[pos] ?? ' ')) {
      pos -= value.length;
      return '';
    }
    let base = value === 'o_eff' ? '<msub><mi>o</mi><mtext>eff</mtext></msub>'
      : value === 'log₂' ? '<msub><mi>log</mi><mn>2</mn></msub>'
      : /^\d/.test(value) ? '<mn>' + value + '</mn>' : '<mi>' + value + '</mi>';
    if (text[pos] === '(') {
      if (value === 'O') base = '<mi>𝒪</mi>';
      base = '<mrow>' + base + group(true) + '</mrow>';
      mathematical = true;
    }
    return base;
  }
  function power() {
    let base = atom();
    if (base && (text[pos] === '^' || text[pos] === '_')) {
      const tag = text[pos++] === '^' ? 'msup' : 'msub';
      const script = text[pos] === '(' ? group(false) : power();
      if (!script) throw new SyntaxError();
      base = '<' + tag + '>' + base + script + '</' + tag + '>';
      mathematical = true;
    }
    return base;
  }
  function sequence(nested) {
    let result = power();
    if (!result) return '';
    for (;;) {
      const end = pos;
      spaces();
      const op = peek();
      const explicit = operators.has(op) || (nested && op === ',');
      if (explicit) { pos++; spaces(); }
      const next = power();
      if (!next) { pos = end; break; }
      const beforeLog = op === 'log' || op === 'log₂';
      if (explicit || beforeLog) mathematical = true;
      result += (explicit ? '<mo>' + escape(op === '-' ? '−' : op) + '</mo>' : '<mo>&#x2062;</mo>') +
        (beforeLog ? '<mspace width="0.14em"/>' : '') + next;
    }
    return result;
  }
  try {
    const body = sequence(false);
    if (body && (mathematical || standalone) && !word.test(text[pos] ?? ' ')) return { body, end: pos };
  } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  return null;
}

function mathMarkup(body, source) {
  return '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow>' +
      body + '</mrow><annotation encoding="text/plain">' + escape(source) + '</annotation></semantics></math>';
}

export function runtimeMath(source) {
  const match = formula(source, 0, true);
  if (!match || match.end !== source.length) {
    throw new Error("Cannot typeset the complete running time: " + source);
  }
  return mathMarkup(match.body, source);
}

export function mathText(value) {
  const text = String(value);
  let result = '', plain = 0;
  for (let pos = 0; pos < text.length; pos++) {
    if (!/[\p{L}\p{N}]/u.test(text[pos]) || (pos && word.test(text[pos - 1]))) continue;
    const match = formula(text, pos);
    if (!match) continue;
    const source = text.slice(pos, match.end);
    // Numeric metadata, including ISO dates, stays searchable as plain text.
    if (!/[\p{L}^_]/u.test(source)) { pos = match.end - 1; continue; }
    result += escape(text.slice(plain, pos)) + mathMarkup(match.body, source);
    plain = match.end;
    pos = match.end - 1;
  }
  return result + escape(text.slice(plain));
}
