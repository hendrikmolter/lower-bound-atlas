import test from 'node:test';
import assert from 'node:assert/strict';
import { mathText, runtimeMath } from '../website/math.mjs';

test('typesets nested powers and preserves the exact source expression', () => {
  const source = '2^(O(N^a)) B^(O(1))';
  const output = mathText(source);
  assert.equal(output.match(/<msup>/g).length, 3);
  assert.ok(output.includes('>' + source + '</annotation>'));
  assert.match(mathText('2^h(d,q)'), /<msup><mn>2<\/mn><mrow><mi>h<\/mi>/);
  assert.match(mathText('Π_t'), /<msub><mi>Π<\/mi><mi>t<\/mi><\/msub>/);
});

test('separates prose, comparison signs, and record metadata from markup', () => {
  assert.equal(mathText('3-Coloring on 2026-11-18'), '3-Coloring on 2026-11-18');
  assert.equal(mathText('<script>'), '&lt;script&gt;');
  assert.match(mathText('each fixed 0<a<1.'), /^each fixed <math.*<mo>&lt;<\/mo>.*<\/math>\.$/);
});

test('renders a complete running time including nested functions or rejects it', () => {
  const source = '2^(o_eff(t log₂(max(t,2)))) N^(O(1))';
  const output = runtimeMath(source);
  assert.ok(output.includes('<msup><mn>2</mn><mrow><mrow><msub><mi>o</mi>'));
  assert.ok(output.includes('<mi>max</mi>'));
  assert.ok(output.includes('<msup><mi>N</mi>'));
  assert.ok(output.includes('>' + source + '</annotation>'));
  assert.throws(() => runtimeMath('2^(o(unknown(t))) N^(O(1))'), /complete running time/);
  assert.throws(() => runtimeMath('2^t trailing prose'), /complete running time/);
});

test('adds a small space before logarithms in products, including in exponents', () => {
  const space = '<mspace width="0.14em"/>';
  for (const expression of ['k log k', '2^(o(k log₂ k))']) {
    assert.ok(mathText(expression).includes(space));
  }
  for (const expression of ['log₂(k)', 'k + log₂(k)', '2^(k t)']) {
    assert.ok(!mathText(expression).includes(space));
  }
});
