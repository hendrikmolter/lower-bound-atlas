import { mathText, runtimeMath } from './math.mjs';

export function runtimeDetails(record, bound) {
  const reader = bound.reader?.revision === bound.revision ? bound.reader : {};
  if (!Array.isArray(bound.qualifications)) {
    return {
      legacy: true,
      runtime: reader.runtime ?? bound.runtime,
      qualifications: reader.scope ? [reader.scope] : [],
      symbols: [],
      explanation: ''
    };
  }
  const definitions = [...(record.reader?.parameterSymbols ?? []), ...(record.reader?.symbols ?? [])];
  return {
    legacy: false,
    runtime: bound.runtime,
    qualifications: bound.qualifications,
    symbols: bound.runtimeSymbols.map(symbol => definitions.find(item => item.symbol === symbol)),
    explanation: reader.explanation ?? ''
  };
}

export function runtimeFormula(record, bound) {
  return runtimeMath(runtimeDetails(record, bound).runtime);
}

export function runtimeQualifications(record, bound) {
  return runtimeDetails(record, bound).qualifications.map(text =>
    '<p class="runtime-qualification">' + mathText(text) + '</p>').join('');
}

export function symbolList(symbols = []) {
  return symbols.length ? '<ul class="runtime-symbols">' + symbols.map(({symbol, meaning}) => {
    const label = /^[\p{L}]$/u.test(symbol) ? '<i>' + mathText(symbol) + '</i>' : mathText(symbol);
    return '<li>' + label + ' — ' + mathText(meaning) + '</li>';
  }).join('') + '</ul>' : '';
}

export function runtimeSymbols(record, bound) {
  return symbolList(runtimeDetails(record, bound).symbols);
}
