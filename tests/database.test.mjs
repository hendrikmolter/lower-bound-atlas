import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { exportAtlas, json, loadAtlas, sourceDigest, validateAtlas } from '../scripts/database.mjs';
import { problemDefinition, problemDefinitionHash } from '../scripts/problems.mjs';

const command = fileURLToPath(new URL('../scripts/atlas.mjs', import.meta.url));
const direction = (status = 'unassessed', evidence = []) => ({ status, evidence });
const cited = { paperId: 'test-piece', editionId: 'preprint', locator: 'Theorem 3', role: 'establishes' };
const link = (id, revision = 1, theorem = 'claim') => ({ proofId: id, revision, theorem });
const fixtureSource = 'A fixture of authoritative source.\n';
const review = (id, proofId, revision = 1, type = 'agent', theorem = 'claim') => ({
  id, type, date: '2026-11-18', reviewer: 'Test reviewer', scope: 'All quantifiers of the cited statement',
  verdict: 'verified', evidence: 'evidence/review.md',
  independent: true, sourceSha256: sourceDigest(Buffer.from(fixtureSource)),
  object: { type: 'proof', id: proofId, revision, theorem }
});
const premise = id => ({
  id, revision: 1, name: 'Premise ' + id, aliases: [], definition: 'Exact premise ' + id,
  model: 'deterministic', quantifiers: 'For every algorithm', conventions: 'Uniform',
  source: { ...cited, locator: 'Definition 2', role: 'definition' }
});
const bound = (id, options = {}) => ({
  id, revision: 1, statement: 'No deterministic solver has the stated runtime.', runtime: 'O(exp(o(k))N^c)',
  inputFactor: 'N^c for some constant c', restrictions: 'Explicit instances', model: 'deterministic',
  status: 'established', provenance: 'literature', assumptions: [{ id: 'eth', revision: 1 }],
  assumptionOperator: 'all', sources: [cited], proofs: [], inputConditions: [],
  assessments: {
    eth: { hypothesisRevision: 1, forward: direction(), converse: direction() },
    sh: { hypothesisRevision: 1, forward: direction(), converse: direction() }
  },
  ...options
});
const caseRecord = () => ({
  id: 'sample', revision: 1, title: 'Application sample', aliases: ['collection/R17'], kind: 'runtime',
  variant: 'Ordered example', task: 'decision', model: 'deterministic', encoding: 'explicit', parameter: 'order',
  restrictions: 'All explicit structures', inputConditions: [], bounds: [bound('benchmark')], resolutions: []
});
const proof = (id, revisions = [1]) => ({ id, title: 'Proof ' + id, revisions: revisions.map(revision => ({
  revision, source: 'evidence/source.tex', pdf: 'evidence/source.pdf',
  theorems: [{ label: 'claim', number: '1', destination: 'page=1', statement: 'No deterministic solver has the stated runtime.' }]
})) });
const fixture = () => ({
  schemaVersion: 1, edition: 'fixture', revision: 1, assumptions: ['eth', 'sh', 'w1', 'np_qp'].map(premise),
  papers: [{ id: 'test-piece', title: 'Test theorem', authors: ['A. Tester'], preferredEditionId: 'journal', editions: [
    { id: 'journal', label: 'Journal edition', kind: 'journal', doi: '10.1234/fixture', primaryUrl: 'https://example.org/journal' },
    { id: 'preprint', label: 'Inspected preprint', title: 'Earlier test title', kind: 'preprint',
      primaryUrl: 'https://example.org/preprint-v2', openUrl: 'https://example.org/pdf' }
  ] }],
  proofs: [], reviews: [], challenges: []
});
function harness(t, registry = fixture(), record = caseRecord()) {
  const root = mkdtempSync(join(tmpdir(), 'lba-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const casePath = join(root, 'data', 'cases', 'sample.json');
  const registryPath = join(root, 'data', 'atlas.json');
  const evidence = join(root, 'evidence');
  mkdirSync(join(root, 'data', 'cases'), { recursive: true });
  mkdirSync(evidence);
  writeFileSync(join(evidence, 'source.tex'), fixtureSource.replace(/\n/g, '\r\n'));
  writeFileSync(join(evidence, 'source.pdf'), '%PDF-1.5\nSynthetic test for identity header/trailer only.\n%%EOF\n');
  writeFileSync(join(evidence, 'review.md'), 'The fixture review covers the exact quantified statement.');
  const write = (nextRegistry = registry, nextCase = record) => {
    writeFileSync(casePath, json(nextCase));
    writeFileSync(registryPath, json(nextRegistry));
  };
  write();
  const call = (...args) => execFileSync(process.execPath, [command, ...args], { cwd: root, encoding: 'utf8' });
  const failed = (code, ...args) => {
    const result = spawnSync(process.execPath, [command, ...args], { cwd: root, encoding: 'utf8' });
    return { status: result.status, error: JSON.parse(result.stderr).error, code };
  };
  const exportData = () => exportAtlas(validateAtlas(loadAtlas(registryPath)));
  return { root, casePath, registryPath, evidence, call, failed, write, exportData };
}

test('release recovery decisions cover each current pair without crediting dispositions', t => {
  const registry = fixture();
  registry.releaseHypotheses = ['eth', 'sh', 'w1'];
  const record = caseRecord();
  const ref = (id, revision = 1) => ({ id, revision });
  const pair = (target, hypothesis, recovery) => ({
    target: ref(target), hypothesis: ref(hypothesis), recovery: ref(recovery)
  });
  const noCredit = (target, hypothesis, recovery) => ({
    ...pair(target, hypothesis, recovery),
    reason: 'The alternative bound excludes only a more restricted input model.'
  });
  const sh = bound('sh-bound', { assumptions: [ref('sh')] });
  record.bounds.push(bound('second-target'), sh, bound('w1-bound', { assumptions: [ref('w1')] }));
  record.recoveryAssessments = [{
    ...pair('benchmark', 'sh', 'sh-bound'), scale: 'degree', effective: false,
    targetScale: 'k', recoveredScale: 'k by fixed powers',
    comparison: 'The alternative excludes every fixed power saving.', evidence: [cited]
  }];
  record.recoveryDispositions = [
    noCredit('second-target', 'sh', 'sh-bound'),
    noCredit('benchmark', 'w1', 'w1-bound')
  ];
  const h = harness(t, registry, record);
  assert.equal(h.exportData().cases[0].recoveryDispositions.length, 2);
  const releaseErrors = () => h.failed('INVALID_ATLAS', 'validate', '--release').error.details.join();
  assert.match(releaseErrors(), /missing recovery decision for second-target@1 and w1-bound@1 under w1@1/);
  record.recoveryDispositions.push(noCredit('second-target', 'w1', 'w1-bound'));
  h.write();
  const output = JSON.parse(h.call('export', '--release')).cases[0];
  assert.equal(output.recoveryDispositions, undefined);
  assert.equal(output.recoveryComparisons.find(e => e.target.id === 'benchmark' && e.hypothesis.id === 'sh').status, 'degree');
  assert.equal(output.recoveryComparisons.find(e => e.target.id === 'second-target' && e.hypothesis.id === 'sh').status, 'unresolved');

  record.recoveryDispositions.push(noCredit('benchmark', 'sh', 'sh-bound'));
  h.write();
  assert.throws(h.exportData, err => err.details.some(message => /conflicts with recovery assessment/.test(message)));
  record.recoveryDispositions.pop();
  record.recoveryDispositions[0].hypothesis = ref('w1');
  h.write();
  assert.throws(h.exportData, err => err.details.some(message => /alternative premise mismatch/.test(message)));
  record.recoveryDispositions[0].hypothesis = ref('sh');

  record.history = [structuredClone(record)];
  record.revision++;
  sh.revision++;
  h.write();
  const stale = releaseErrors();
  assert.match(stale, /benchmark@1 and sh-bound@2 under sh@1/);
  assert.match(stale, /second-target@1 and sh-bound@2 under sh@1/);
  record.recoveryAssessments[0].recovery = ref('sh-bound', 2);
  record.recoveryDispositions[0].recovery = ref('sh-bound', 2);
  h.write();
  assert.equal(JSON.parse(h.call('validate', '--release')).status, 'valid');
});

test('release recovery decisions skip held, superseded and joint-premise pairs', t => {
  const registry = fixture();
  registry.releaseHypotheses = ['eth', 'sh', 'w1'];
  const record = caseRecord();
  const sh = { id: 'sh', revision: 1 };
  record.bounds.push(
    bound('older-target'),
    bound('older-alternative', { assumptions: [sh] }),
    bound('current-alternative', { assumptions: [sh] }),
    bound('held-alternative', { assumptions: [sh], includeInRelease: false }),
    bound('joint-alternative', { assumptions: [sh, { id: 'w1', revision: 1 }] })
  );
  record.supersessions = [['eth', 'older-target', 'benchmark'], ['sh', 'older-alternative', 'current-alternative']]
    .map(([hypothesis, weaker, stronger]) => ({
      problem: 'sample', hypothesis, weaker, stronger, weakerRevision: 1, strongerRevision: 1,
      reason: 'The newer bound excludes the earlier clock on the same input scope.'
    }));
  record.recoveryDispositions = [{
    target: { id: 'benchmark', revision: 1 }, hypothesis: sh,
    recovery: { id: 'current-alternative', revision: 1 },
    reason: 'The alternative does not reach the historical exponent scale.'
  }, {
    target: { id: 'benchmark', revision: 1 }, hypothesis: sh,
    recovery: { id: 'held-alternative', revision: 1 },
    reason: 'The alternative does not reach the historical exponent scale.'
  }];
  const h = harness(t, registry, record);
  assert.equal(JSON.parse(h.call('validate', '--release')).status, 'valid');
});

test('requires explicit scopes and allows only distinct additional input conditions on a bound', t => {
  const registry = fixture();
  const record = caseRecord();
  record.inputConditions = [
    { id: 'base', condition: 'Finite instance.', level: 'problem' },
    { id: 'small', condition: 'k=2', level: 'bound' }
  ];
  const h = harness(t, registry, record);
  const target = record.bounds[0];
  for (const selection of [[], ['small']]) {
    target.inputConditions = selection;
    h.write();
    assert.deepEqual(h.exportData().cases[0].bounds[0].inputConditions, selection);
  }
  for (const selection of [['base'], ['absent'], ['small', 'small'], undefined]) {
    target.inputConditions = selection;
    h.write();
    assert.throws(() => h.exportData());
  }
  target.inputConditions = [];
  delete record.inputConditions;
  h.write();
  assert.throws(() => h.exportData());
});

test('retains pinned problem definitions and invalidates unchanged theorems when their input changes', t => {
  const registry = fixture();
  const v1 = {id: 'decision', revision: 1, name: 'Decision', input: 'A graph.', question: 'Is it connected?'};
  registry.problems = [structuredClone(v1)];
  const record = caseRecord();
  Object.assign(record, {problemId: v1.id, problemRevision: 1, problemDefinitionHash: problemDefinitionHash(v1)});
  Object.assign(record.bounds[0], {qualifications: [], runtimeSymbols: []});
  for (const item of [record, record.bounds[0]]) {
    delete item.model;
    delete item.restrictions;
  }
  const h = harness(t, registry, record);
  const validate = () => { h.write(); return h.exportData(); };
  assert.doesNotThrow(validate);
  record.bounds[0].model = 'Deterministic worst-case running time.';
  assert.throws(validate, err => err.details.some(msg => msg.includes('modelException')));
  delete record.bounds[0].model;
  const current = registry.problems[0];
  current.name = 'Connectivity';
  assert.doesNotThrow(validate);
  current.question = 'Is it acyclic?';
  assert.throws(validate, err => err.details.some(msg => msg.includes('problemDefinitionHash')));
  current.revision = 2;
  current.history = [v1];
  assert.equal(problemDefinition(current, record.problemRevision).question, 'Is it connected?');
  assert.doesNotThrow(validate);
  record.history = [structuredClone(record)];
  record.revision = 2;
  record.reader = {additionalInput: 'A path decomposition is supplied.'};
  assert.throws(validate, err => err.details.some(msg => msg.includes('theorem statement changed')));
  delete record.reader;
  record.inputConditions.push({id: 'planar', level: 'problem', condition: 'The graph is planar.'});
  assert.throws(validate, err => err.details.some(msg => msg.includes('theorem statement changed')));
  record.inputConditions = [];
  record.problemRevision = 2;
  record.problemDefinitionHash = problemDefinitionHash(current);
  assert.throws(validate, err => err.details.some(msg => msg.includes('theorem statement changed')));
  record.bounds[0].revision = 2;
  record.bounds[0].history = [structuredClone(record.history[0].bounds[0])];
  assert.doesNotThrow(validate);
  record.history[0].problemRevision = 3;
  assert.throws(validate, err => err.details.some(msg => msg.includes('valid problem revision')));
});

test('requires a single qualified runtime and rejects undefined or repeated symbol references', t => {
  const record = caseRecord();
  record.reader = { symbols: [{symbol: 'N', meaning: 'input length'}] };
  const b = record.bounds[0];
  b.runtimeSymbols = ['N'];
  b.qualifications = ['For each fixed c ≥ 1.'];
  const h = harness(t, fixture(), record);
  assert.deepEqual(h.exportData().cases[0].bounds[0].qualifications, b.qualifications);
  for (const symbols of [['missing'], ['N','N']]) {
    b.runtimeSymbols = symbols;
    h.write();
    assert.throws(() => h.exportData());
  }
  b.runtimeSymbols = ['N'];
  for (const field of ['runtime', 'scope', 'statement']) {
    b.reader = {revision: 1, [field]: 'An alternate running-time statement'};
    h.write();
    assert.throws(() => h.exportData());
  }
});

test('shows scoped aliases, deterministic export, edition URLs, and reverse paper uses', t => {
  const h = harness(t);
  const exported = h.call('export');
  assert.equal(exported, h.call('export'));
  h.call('export', '--out', 'dist/api/v1/atlas.json');
  assert.equal(readFileSync(join(h.root, 'dist', 'api', 'v1', 'atlas.json'), 'utf8'), exported);
  assert.equal(JSON.parse(h.call('show', 'collection/R17')).id, 'sample');
  assert.equal(JSON.parse(h.call('show', 'benchmark', '--case', 'sample')).revision, 1);
  assert.equal(JSON.parse(h.call('search', 'Test theorem'))[0].id, 'sample');
  assert.equal(JSON.parse(h.call('search', 'Earlier test title'))[0].id, 'sample');
  const result = JSON.parse(exported);
  assert.equal(result.apiVersion, 'v1');
  assert.equal(result.papers[0].preferredEditionId, 'journal');
  assert.equal(result.papers[0].preferredUrl, 'https://doi.org/10.1234/fixture');
  assert.deepEqual(result.papers[0].editions.map(edition => edition.preferredUrl), [
    'https://doi.org/10.1234/fixture', 'https://example.org/preprint-v2'
  ]);
  assert.ok(result.reverse.papers['test-piece'].some(ref => ref.type === 'bound' && ref.editionId === 'preprint'));
});

test('independently exports ETH-equivalence and unknown SH and marks changes stale', t => {
  const data = fixture();
  const record = caseRecord();
  const item = record.bounds[0];
  data.reviews.push({
    ...review('both-directions', 'unused'),
    object: { type: 'bound', caseId: 'sample', id: 'benchmark', revision: 1 }
  });
  const evidence = [{ boundRevision: 1, reviewId: 'both-directions', source: cited }];
  item.assessments.eth.forward = direction('established', evidence);
  item.assessments.eth.converse = direction('established', evidence);
  item.assessments.sh.forward = direction('unknown');
  const h = harness(t, data, record);
  const first = JSON.parse(h.call('export'));
  assert.equal(first.cases[0].bounds[0].assessments.eth.verdict, 'established-equivalent');
  assert.equal(first.cases[0].bounds[0].assessments.sh.verdict, 'unknown');
  assert.equal(JSON.parse(h.call('bounds', 'search', '--eth', 'established-equivalent', '--sh', 'unknown')).length, 1);
  item.history = [structuredClone(item)];
  item.revision = 2;
  item.statement += ' Instances are connected.';
  h.write();
  const changed = h.exportData();
  assert.equal(changed.cases[0].bounds[0].assessments.eth.verdict, 'needs-reassessment');
  assert.equal(changed.reviews[0].stale, true);
  item.history = undefined;
  item.revision = 1;
  data.assumptions[0].history = [structuredClone(data.assumptions[0])];
  data.assumptions[0].revision = 2;
  data.assumptions[0].conventions = 'Explicit nonuniform model';
  h.write();
  assert.equal(h.exportData().cases[0].bounds[0].assessments.eth.verdict, 'needs-reassessment');
  item.assessments.eth.hypothesisRevision = 2;
  h.write();
  assert.equal(h.exportData().cases[0].bounds[0].assessments.eth.verdict, 'needs-reassessment');
});

test('selects release hypotheses from the edition; previews retain private targets', t => {
  const data = fixture(), record = caseRecord();
  data.assumptions.push(premise('new-hypothesis'));
  data.releaseHypotheses = ['new-hypothesis'];
  const item = record.bounds[0];
  item.assumptions = [{id:'new-hypothesis', revision:1}];
  delete item.assessments;
  const h = harness(t, data, record);
  const released = JSON.parse(h.call('export', '--release'));
  assert.deepEqual(released.assumptions.map(h => h.id), ['new-hypothesis']);
  assert.deepEqual(released.cases[0].bounds[0].assessments, {});
  assert.equal(h.exportData().assumptions.length, data.assumptions.length);
  data.releaseHypotheses = ['eth', 'typo'];
  h.write();
  assert.match(h.failed('INVALID_ATLAS', 'validate').error.details.join(), /distinct registered hypothesis IDs/);
});

test('bound search indexes inherited and selected conditions, qualifications and model exceptions', t => {
  const record = caseRecord();
  record.inputConditions = [
    {id:'matrix', level:'problem', condition:'The adjacency matrix is explicit.'},
    {id:'planar', level:'bound', condition:'The graph is planar.'}
  ];
  record.bounds.push(bound('restricted', {
    inputConditions:['planar'], qualifications:['For every computable prefactor.'], runtimeSymbols:[],
    modelException:{kind:'randomized',description:'A randomized bounded-error algorithm.'}
  }));
  delete record.bounds[1].model;
  const h = harness(t, fixture(), record);
  for (const word of ['planar', 'computable prefactor', 'bounded-error']) {
    assert.deepEqual(JSON.parse(h.call('bounds', 'search', word)).map(b => b.id), ['restricted']);
  }
  assert.equal(JSON.parse(h.call('bounds', 'search', 'adjacency matrix')).length, 2);
  record.bounds[1].model = 'Unspecified alternative.';
  h.write();
  assert.match(h.failed('INVALID_ATLAS', 'validate').error.details.join(), /only one algorithm model/);
});

test('validates and searches sparse directional assessments on formulations', t => {
  const data = fixture(), record = caseRecord();
  const form = {id:'alternate-form', name:'Alternate form', revision:1, hypothesisId:'w1',
    hypothesisRevision:1, statement:'Alternate statement', reference:'https://example.org/definition'};
  data.formulations = [form];
  const item = record.bounds[0];
  data.reviews.push({...review('verified-bound', 'unused'),
    object:{type:'bound', caseId:'sample', id:'benchmark', revision:1}});
  const evidence = [{boundRevision:1, reviewId:'verified-bound', source:cited}];
  item.assessments = {[form.id]:{hypothesisRevision:1, forward:direction('established', evidence), converse:direction()}};
  const h = harness(t, data, record);
  assert.equal(JSON.parse(h.call('bounds', 'search', '--assessment', form.id, '--verdict', 'hypothesis-implies-bound')).length, 1);
  assert.equal(JSON.parse(h.call('bounds', 'search', '--eth', 'unassessed')).length, 1);
  form.history = [structuredClone(form)]; form.revision++;
  h.write();
  assert.equal(h.exportData().cases[0].bounds[0].assessments[form.id].verdict, 'needs-reassessment');
  form.revision--; delete form.history;
  const base = data.assumptions.find(h => h.id === 'w1');
  base.history = [structuredClone(base)]; base.revision++;
  h.write();
  assert.equal(h.exportData().cases[0].bounds[0].assessments[form.id].verdict, 'needs-reassessment');
  item.assessments.typo = item.assessments[form.id];
  h.write();
  assert.match(h.failed('INVALID_ATLAS', 'validate').error.details.join(), /missing assessed typo/);
  delete item.assessments.typo;
  delete item.assessments[form.id].forward;
  h.write();
  assert.match(h.failed('INVALID_SCHEMA', 'validate').error.details.join(), /forward is required/);
});

test('confirmed proof gap leaves a reviewed independent support and preserves provisional reports', t => {
  const record = caseRecord();
  record.bounds.push(bound('project', {
    provenance: 'atlas', proofs: [link('proof-a'), link('proof-b')]
  }));
  const data = fixture();
  data.proofs.push(proof('proof-a', [1, 2]), proof('proof-b'));
  data.reviews.push(review('first', 'proof-a'), review('alternative', 'proof-b', 1, 'human'), review('updated', 'proof-a', 2));
  const object = data.reviews[0].object;
  data.challenges.push({
    id: 'a-gap', object, reporter: 'Test reporter', date: '2026-11-18', objection: 'Scope gap',
    evidence: 'evidence/review.md', disposition: 'open', decisions: []
  });
  const h = harness(t, data, record);
  const original = h.exportData();
  assert.equal(original.proofs[0].revisions[0].theorems[0].supports, true);
  assert.equal(original.reviews.find(item => item.id === 'first').stale, true);
  assert.equal(original.reviews.find(item => item.id === 'alternative').label, 'Human verified');
  data.challenges[0].disposition = 'proof-gap';
  data.challenges[0].decisions = [{ date: '2026-11-18', reviewer: 'Independent tester', reason: 'Gap confirmed', evidence: 'evidence/review.md' }];
  h.write();
  const challenged = h.exportData();
  assert.equal(challenged.proofs[0].revisions[0].theorems[0].supports, false);
  assert.equal(challenged.cases[0].bounds.find(item => item.id === 'project').supported, true);
  assert.equal(JSON.parse(h.call('dependents', 'proof-a', '--revision', '1', '--theorem', 'claim'))[0].id, 'project');
  assert.equal(JSON.parse(h.call('validate', '--release')).status, 'valid');
  record.bounds[1].proofs = [link('proof-a')];
  h.write();
  const invalid = h.failed('INVALID_ATLAS', 'validate', '--release');
  assert.equal(invalid.error.code, invalid.code);
  assert.match(invalid.error.details.join(), /unsupported dependency prevents release/);
});

test('records Lean and correspondence evidence for the exact theorem scope', t => {
  const data = fixture();
  const packet = proof('proof-packet');
  packet.revisions[0].theorems.push({ label: 'lemma', number: '2', destination: 'page=1', statement: 'A supporting lemma.' });
  data.proofs.push(packet);
  const checked = review('lean-review', 'proof-packet', 1, 'lean', 'lemma');
  checked.lean = {
    toolchain: 'leanprover/lean4:v4.26.0', dependencies: 'lake-manifest.json pinned with commit',
    commit: '1'.repeat(40), declaration: 'Example.lemma', axioms: ['propext'],
    buildEvidence: 'evidence/review.md', correspondenceReviewId: 'alignment'
  };
  data.reviews.push(checked, review('alignment', 'proof-packet', 1, 'human', 'lemma'));
  const h = harness(t, data);
  const view = h.exportData();
  assert.equal(view.reviews.find(item => item.id === 'lean-review').label, 'Machine verified (Lean)');
  assert.deepEqual(view.proofs[0].revisions[0].theorems.find(item => item.label === 'claim').reviewIds, []);
  checked.lean.axioms.push('sorryAx');
  h.write();
  assert.match(h.failed('INVALID_ATLAS', 'validate').error.details.join(), /sorryAx/);
});

test('rejects unresolved artifact references and invalid PDF headers', t => {
  const data = fixture();
  data.proofs.push(proof('packet'));
  const h = harness(t, data);
  writeFileSync(join(h.evidence, 'source.pdf'), 'Not a PDF.');
  assert.match(h.failed('INVALID_ATLAS', 'validate').error.details.join(), /invalid PDF artifact/);
  data.proofs[0].revisions[0].source = '../source.tex';
  h.write();
  assert.match(h.failed('INVALID_ATLAS', 'validate').error.details.join(), /unsafe evidence path/);
});

test('requires a preferred edition that belongs to its paper', t => {
  const data = fixture();
  const h = harness(t, data);
  delete data.papers[0].preferredEditionId;
  h.write();
  assert.match(h.failed('INVALID_ATLAS', 'validate').error.details.join(), /preferredEditionId/);
  data.papers[0].preferredEditionId = 'missing';
  h.write();
  assert.match(h.failed('INVALID_ATLAS', 'validate').error.details.join(), /unknown preferred edition missing/);
});

test('rejects duplicate edition DOI identities despite casing differences', t => {
  const data = fixture();
  data.papers.push({ id: 'duplicate', title: 'Duplicate', authors: ['A. Tester'], preferredEditionId: 'print',
    editions: [{ id: 'print', label: 'Duplicate print', kind: 'journal', doi: '10.1234/FIXTURE' }] });
  const h = harness(t, data);
  assert.match(h.failed('INVALID_ATLAS', 'validate').error.details.join(), /DOI identity collision/);
});

test('prefers registered publications and the latest registered book edition', t => {
  const data = fixture();
  const paper = data.papers[0];
  const h = harness(t, data);
  const edition = (id, kind) => ({ id, label: id, kind, primaryUrl: 'https://example.org/' + id });
  paper.editions.push(edition('conference', 'proceedings'));
  const rejectPreference = (id, message) => {
    paper.preferredEditionId = id;
    h.write();
    assert.match(h.failed('INVALID_ATLAS', 'validate').error.details.join(), message);
  };
  rejectPreference('preprint', /prefer a registered journal edition/);
  rejectPreference('conference', /prefer a registered journal edition/);
  paper.editions.shift();
  rejectPreference('preprint', /prefer a registered proceedings edition/);
  paper.editions.pop();
  paper.editions.push({ ...edition('first', 'book'), editionNumber: 1 }, { ...edition('second', 'book'), editionNumber: 2 });
  rejectPreference('preprint', /prefer the latest registered book edition/);
  rejectPreference('first', /prefer the latest registered book edition/);
  paper.preferredEditionId = 'second';
  h.write();
  assert.equal(JSON.parse(h.call('validate')).status, 'valid');
  delete paper.editions.at(-1).editionNumber;
  rejectPreference('second', /book edition requires an editionNumber/);
});

test('same-revision source edits invalidate proof labels and block release', t => {
  const data = fixture();
  const record = caseRecord();
  record.bounds.push(bound('project', { provenance: 'atlas', proofs: [link('packet')] }));
  data.proofs.push(proof('packet'));
  data.reviews.push(review('critical-review', 'packet'));
  const h = harness(t, data, record);
  assert.equal(JSON.parse(h.call('validate', '--release')).status, 'valid');
  writeFileSync(join(h.evidence, 'source.tex'), fixtureSource + 'Changed lemma.\n');
  const changed = h.exportData();
  assert.equal(changed.reviews[0].stale, true);
  assert.equal(changed.reviews[0].label, undefined);
  assert.match(h.failed('INVALID_ATLAS', 'validate', '--release').error.details.join(), /matching source digest/);
});

test('conditional proof evidence requires review and withdrawn support is distinct from refutation', t => {
  const data = fixture();
  const record = caseRecord();
  record.bounds.push(
    bound('conditional', { status: 'conditional', provenance: 'atlas', proofs: [link('packet')] }),
    bound('historical', { status: 'withdrawn', provenance: 'atlas', sources: [] })
  );
  data.proofs.push(proof('packet'));
  data.challenges.push({
    id: 'withdrawal', object: { type: 'bound', caseId: 'sample', id: 'historical', revision: 1 },
    reporter: 'Reviewer', date: '2026-11-18', objection: 'The former argument fails',
    evidence: 'evidence/review.md', disposition: 'withdrawn-support',
    decisions: [{ date: '2026-11-18', reviewer: 'Independent tester', reason: 'Derivation withdrawn', evidence: 'evidence/review.md' }]
  });
  const h = harness(t, data, record);
  assert.match(h.failed('INVALID_ATLAS', 'validate', '--release').error.details.join(), /matching source digest/);
  data.reviews.push(review('conditional-review', 'packet'));
  h.write();
  const released = JSON.parse(h.call('export', '--release'));
  assert.equal(released.challenges[0].disposition, 'withdrawn-support');
  assert.equal(released.cases[0].bounds.find(item => item.id === 'conditional').supported, false);
});

test('rejects extra premises and proposed results in the release edition', t => {
  const data = fixture();
  data.assumptions.push(premise('fixture-clique'));
  const record = caseRecord();
  record.bounds.push(bound('private-result', {
    status: 'proposed', assumptions: [{ id: 'eth', revision: 1 }, { id: 'fixture-clique', revision: 1 }]
  }));
  const h = harness(t, data, record);
  assert.equal(h.exportData().cases[0].bounds.length, 2);
  const release = h.failed('INVALID_ATLAS', 'export', '--release').error.details.join();
  assert.match(release, /outside this edition’s release hypotheses/);
  assert.match(release, /proposed bound cannot be included/);
});

test('applies novel registry and case-owned proposals, preserving tokens, checks and revisions', t => {
  const h = harness(t);
  const newPremise = premise('fixture-clique');
  newPremise.aliases = ['Fixture square clique'];
  writeFileSync(join(h.root, 'premise.json'), json(newPremise));
  const proposal = ['propose', 'add-assumption', '--file', 'premise.json', '--expected-revision', '1'];
  const original = readFileSync(h.registryPath, 'utf8');
  assert.equal(JSON.parse(h.call(...proposal)).outcome, 'valid');
  assert.equal(readFileSync(h.registryPath, 'utf8'), original);
  assert.equal(JSON.parse(h.call(...proposal, '--apply')).outcome, 'applied');
  assert.equal(JSON.parse(h.call(...proposal, '--apply')).outcome, 'already-applied');
  assert.equal(JSON.parse(h.call('assumptions', 'search', 'Fixture square clique'))[0].id, 'fixture-clique');
  const file = join(h.root, 'bound.json');
  writeFileSync(file, json({
    bound: bound('recovered', {
      assumptions: [{ id: 'fixture-clique', revision: 1 }], provenance: 'atlas', proofs: [link('new-proof')]
    }),
    proofs: [proof('new-proof')], reviews: [review('new-review', 'new-proof')]
  }));
  const add = ['propose', 'add-bound', '--case', 'sample', '--assumption', 'fixture-clique', '--file', 'bound.json', '--expected-revision'];
  const integrated = JSON.parse(h.call(...add, '1', '--apply'));
  assert.equal(integrated.outcome, 'applied');
  assert.equal(integrated.possibleDuplicates[0].id, 'benchmark');
  assert.ok(integrated.possibleDuplicates[0].differentFields.includes('assumptions'));
  assert.equal(JSON.parse(readFileSync(h.casePath, 'utf8')).history[0].revision, 1);
  assert.equal(JSON.parse(h.call('search', '--assumption', 'fixture-clique'))[0].id, 'sample');
  const view = h.exportData();
  assert.equal(view.reverse.assumptions['fixture-clique'][0].id, 'recovered');
  assert.equal(view.proofs[0].id, 'new-proof');
  assert.equal(view.proposalIds, undefined);
  writeFileSync(file, json(bound('recovered', { assumptions: [{ id: 'fixture-clique', revision: 1 }] })));
  assert.equal(h.failed('STALE_REVISION', ...add, '1', '--apply').status, 4);
  assert.equal(h.failed('IDENTITY_COLLISION', ...add, '2', '--apply').error.code, 'IDENTITY_COLLISION');
});

test('refuses a completed equivalence-barrier resolution without both target equivalences', t => {
  const record = caseRecord();
  record.resolutions.push({ assumptionId: 'np_qp', status: 'resolved', rule: 'equivalence-barrier',
    reason: 'Equivalence barrier asserted', benchmarks: [{ id: 'benchmark', revision: 1 }],
    recovered: [], evidence: [cited] });
  const h = harness(t, fixture(), record);
  assert.match(h.failed('INVALID_ATLAS', 'validate').error.details.join(), /established equivalence/);
});
