import { mathText, runtimeMath } from './math.mjs';

export function runtimeDetails(record, bound) {
  const reader = bound.reader?.revision === bound.revision ? bound.reader : {};
  if (!Array.isArray(bound.qualifications)) {
    return {
      legacy: true,
      runtime: reader.runtime ?? bound.runtime,
      qualifications: reader.scope ? [reader.scope] : [],
      symbols: []
    };
  }
  const definitions = [...(record.reader?.parameterSymbols ?? []), ...(record.reader?.symbols ?? [])];
  return {
    legacy: false,
    runtime: bound.runtime,
    qualifications: bound.qualifications,
    symbols: bound.runtimeSymbols.map(symbol => definitions.find(item => item.symbol === symbol))
  };
}

export function runtimeFormula(record, bound) {
  return runtimeMath(runtimeDetails(record, bound).runtime);
}

export function runtimeQualifications(record, bound) {
  const domain = {
    'computable-integer': 'The exponent is a computable nonnegative integer-valued function.',
    'upper-bounded-integer': 'The exponent is a nonnegative integer-valued function with a computable upper bound.'
  }[bound.exponentDomain];
  return [...runtimeDetails(record, bound).qualifications, ...(domain ? [domain] : [])].map(text =>
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
