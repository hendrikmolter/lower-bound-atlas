import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { mathText } from '../website/math.mjs';

function readerFixture(t) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'atlas-public-reader-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  for (const entry of ['data','schemas','scripts','website','evidence','proofs','LICENSE','LICENSE.md']) {
    cpSync(join(root,entry),join(dir,entry),{recursive:true});
  }
  return dir;
}

test('a release build fails before publishing when the source revision cannot be verified', t => {
  const dir = readerFixture(t);
  assert.throws(() => execFileSync(process.execPath, ['website/build.mjs', '--release'], {
    cwd: dir, stdio: 'pipe'
  }), error => error.stderr.toString().includes('Release builds require a verified Git commit'));
  assert.equal(existsSync(join(dir, 'dist/site/manifest.json')), false);
});

test('renders qualitative hardness as a cited notice without a statement page', t => {
  const dir = readerFixture(t);
  const baselines = [
    ['grid-tiling-side', 'grid-tiling-side-w1', 'W[1]'],
    ['dominating-set-budget', 'ds-budget-w1', 'W[2]'],
    ['feature-set-budget', 'feature-set-budget-w1', 'W[2]']
  ];
  for (const [caseId, boundId, hardness] of baselines) {
    const path = join(dir, 'data/cases', caseId + '.json');
    const record = JSON.parse(readFileSync(path));
    record.bounds.find(bound => bound.id === boundId).hardnessBaseline = hardness;
    writeFileSync(path, JSON.stringify(record));
  }
  execFileSync(process.execPath, ['website/build.mjs'], { cwd: dir });
  const read = path => readFileSync(join(dir, 'dist/site', path, 'index.html'), 'utf8');
  const row = (html, id) => html.split('class="bound-row" id="' + id + '"')[1].split('</section>')[0];
  for (const [caseId, boundId, hardness] of baselines) {
    const card = row(read('cases/' + caseId), boundId);
    const notice = 'No lower bound recorded for this parameterization beyond ' + hardness + '-hardness.';
    const mixed = caseId === 'feature-set-budget';
    const sentence = mixed ? hardness + '-hardness.' : notice;
    assert.equal(card.split(sentence).length - 1, 1);
    const afterNotice = card.split('<p>' + sentence + '</p>')[1].trimStart();
    assert.ok(afterNotice.startsWith('<ul class="bound-citations"><li><a href='));
    assert.ok(!card.includes('excluded-time'));
    assert.ok(!card.includes('Full statement') && !card.includes('quivalent to'));
    assert.ok(!existsSync(join(dir, 'dist/site/bounds', caseId, boundId, 'index.html')));
    assert.ok(!existsSync(join(dir, 'dist/site/bounds', caseId, boundId, 'r1/index.html')));
    if (mixed) {
      assert.ok(!card.includes(notice));
      assert.ok(row(read('cases/' + caseId), 'feature-set-budget-w1-fixed').includes('excluded-time'));
    }
  }
  const applications = read('assumptions/w1');
  assert.ok(applications.includes('grid-tiling-side/index.html#grid-tiling-side-w1'));
  assert.ok(applications.includes('>W[2]-hardness</a>'));
});

test('renaming a problem and admitting another hypothesis require only data changes', t => {
  const dir = readerFixture(t);
  const path = join(dir,'data/atlas.json');
  const data = JSON.parse(readFileSync(path));
  data.problems.find(p => p.id === 'closest-string').name = 'Renamed string problem';
  const extra = {...data.assumptions.find(h => h.id === 'kxk'), id:'test-premise', name:'Test premise', aliases:[]};
  data.assumptions.push(extra);
  data.releaseHypotheses.push(extra.id);
  data.formulations.push({id:'test-form', revision:1, hypothesisId:extra.id, hypothesisRevision:1,
    name:'Test formulation', statement:'Synthetic statement.', reference:'https://example.org/formulation'});
  const caseFile = join(dir,'data/cases/lms-3color-order.json');
  const record = JSON.parse(readFileSync(caseFile));
  const sh = record.bounds.find(b => b.id === 'color-sh-fixed-power');
  sh.assessments['test-premise'] = structuredClone(sh.assessments.sh);
  writeFileSync(caseFile,JSON.stringify(record));
  writeFileSync(path,JSON.stringify(data));
  execFileSync(process.execPath,['website/build.mjs'],{cwd:dir});
  const html = path => readFileSync(join(dir,'dist/site',path,'index.html'),'utf8');
  assert.match(html('.'), /href="problems\/closest-string\/index.html">Renamed string problem<\/a>/);
  for (const id of ['lms-closest-string-radius','lms-closest-string-radius-alphabet']) {
    assert.ok(html('problems/closest-string').includes('cases/' + id + '/index.html'));
    assert.ok(html('cases/' + id).includes('<h1>Renamed string problem</h1>'));
  }
  assert.ok(html('bounds/lms-3color-order/color-sh-fixed-power').includes('aria-label="Test premise implies Statement"'));
  const catalogue = html('.');
  const names = [...catalogue.matchAll(/data-atlas-group><h3><a href="problems\/([^/]+)\/index.html"/g)]
    .map(match => data.problems.find(problem => problem.id === match[1]).name);
  assert.ok(names.length > 2);
  assert.deepEqual(names,[...names].sort(new Intl.Collator('en',{numeric:true,sensitivity:'base'}).compare));
  assert.ok(catalogue.includes('data-alphabetical'));
  const coloring = html('problems/chromatic-number');
  assert.ok(coloring.indexOf('>Treewidth</a>') < coloring.indexOf('>Vertex cover number</a>'));
  assert.ok(coloring.includes('3-coloring/index.html">3-Coloring</a>'));
  assert.ok(html('problems/3-coloring').includes('chromatic-number/index.html">Chromatic Number</a>'));
  assert.ok(html('assumptions/test-premise').includes('id="test-form"'));
  const qualification = mathText('For every fixed 0 < γ < 1.');
  for (const path of ['cases/distinct-vectors-budget','bounds/distinct-vectors-budget/dv-w1-fixed-coefficient',
    'bounds/distinct-vectors-budget/dv-w1-fixed-coefficient/r1','assumptions/w1']) {
    assert.ok(html(path).includes(qualification), path + ' lost the coefficient restriction');
  }
});

test('the launch history records one initial snapshot with the released totals', t => {
  const dir = readerFixture(t);
  execFileSync(process.execPath, ['website/build.mjs'], {cwd:dir});
  const read = path => readFileSync(join(dir, 'dist/site', path), 'utf8');
  const catalogue = JSON.parse(read('api/v1/atlas.json'));
  const history = read('about/index.html').split('<section id="version-history">')[1];
  assert.equal((history.match(/<section class="change-day">/g) ?? []).length, 1);
  assert.match(history, /<time datetime="2026-11-19">19 November 2026<\/time>/);
  assert.match(history, /<h4>Initial private launch candidate<\/h4>/);
  assert.ok(history.includes(`${catalogue.problems.length} problems and ${catalogue.cases.length} parameterizations.`));
  assert.match(history, /<p>Hendrik Molter<\/p>/);
  assert.doesNotMatch(history, /\/commit\/[a-f0-9]{40}|Read review|Read challenge|Problem added|Lower bounds changed/);
});

test('a later bound move links history to the new statement', t => {
  const dir = readerFixture(t);
  const read = path => readFileSync(join(dir,'dist/site',path),'utf8');
  const html = path => read(path + '/index.html');
  const parent = 'lms-3color-order';
  const child = 'planar-3-coloring-order';
  const bound = 'color-eth-planar';
  const oldPath = 'bounds/' + parent + '/' + bound;
  const currentPath = 'bounds/' + child + '/' + bound;
  const parentFile = join(dir, 'data/cases', parent + '.json');
  const childFile = join(dir, 'data/cases', child + '.json');
  const parentRecord = JSON.parse(readFileSync(parentFile));
  const childRecord = JSON.parse(readFileSync(childFile));
  const {history: olderCases = [], ...snapshot} = parentRecord;
  const {reader, ...childBound} = childRecord.bounds.find(item => item.id === bound);
  const oldBound = {...childBound, revision:1, reader:{...reader, revision:1}};
  const archive = {...snapshot, bounds:[...snapshot.bounds, oldBound]};
  parentRecord.revision++;
  parentRecord.history = [archive, ...olderCases.map(version => ({
    ...version, bounds:version.bounds.filter(item => item.id !== bound)
  }))];
  writeFileSync(parentFile, JSON.stringify(parentRecord));
  const registryFile = join(dir, 'data/atlas.json');
  const registry = JSON.parse(readFileSync(registryFile));
  registry.boundMoves = [{
    from:{type:'bound', caseId:parent, id:bound, revision:1},
    to:{type:'bound', caseId:child, id:bound, revision:childBound.revision}
  }];
  writeFileSync(registryFile, JSON.stringify(registry));
  const historyFile = join(dir, 'data/history.json');
  const [initial] = JSON.parse(readFileSync(historyFile));
  initial.cases = initial.cases.filter(entry => entry.id !== child);
  const move = {date:'2026-11-20', contributor:'Test contributor', problems:[childRecord.problemId],
    bounds:[{caseId:child, id:bound, revision:childBound.revision, change:'moved'}]};
  writeFileSync(historyFile, JSON.stringify([initial, move]));
  const obsoleteFiles = [oldPath + '/r1/index.html', oldPath + '/r1/citation.bib'];
  mkdirSync(join(dir,'dist/site',oldPath,'r1'),{recursive:true});
  for (const file of obsoleteFiles) writeFileSync(join(dir,'dist/site',file),'previous build');
  writeFileSync(join(dir,'dist/site/manifest.json'),JSON.stringify({
    generator:'lower-bound-atlas/website', files:obsoleteFiles
  }));
  execFileSync(process.execPath,['website/build.mjs'],{cwd:dir});
  const catalogue = JSON.parse(read('api/v1/atlas.json'));
  const parentCase = catalogue.cases.find(record => record.id === parent);
  const childCase = catalogue.cases.find(record => record.id === child);
  const archived = parentCase.history.find(record => record.revision === archive.revision);
  assert.ok(!parentCase.bounds.some(item => item.id === bound));
  assert.deepEqual(childCase.bounds.map(item => item.id),[bound]);
  assert.deepEqual(parentCase.recoveryAssessments,archived.recoveryAssessments);
  assert.ok(html('problems/3-coloring').includes('<h2>Restricted problems</h2>'));
  assert.ok(html('problems/3-coloring').includes('../planar-3-coloring/index.html">Planar 3-Coloring</a>'));
  assert.ok(html('problems/planar-3-coloring').includes('../3-coloring/index.html">3-Coloring</a>'));
  assert.ok(!html('cases/' + parent).includes(bound));
  assert.ok(!html('cases/' + parent).includes('<li>The graph is planar.</li>'));
  assert.ok(!existsSync(join(dir,'dist/site',oldPath,'index.html')));
  assert.deepEqual(JSON.parse(read('api/v1/' + oldPath + '/r1.json')),archived.bounds.find(item => item.id === bound));
  for (const path of [currentPath, currentPath + '/r2']) {
    assert.ok(html(path).includes('<li>The graph is planar.</li>'));
    assert.ok(html(path).includes('Theorem 14.9 and Exercise 14.3(d)'));
  }
  assert.ok(html(currentPath).includes('No deterministic algorithm decides Planar 3-Coloring'));
  assert.ok(!existsSync(join(dir,'dist/site',oldPath,'r1','index.html')));
  assert.ok(!existsSync(join(dir,'dist/site',oldPath,'r1','citation.bib')));
  assert.ok(!existsSync(join(dir,'dist/site',oldPath,'citation.bib')));
  const history = html('about');
  assert.ok(!history.includes(oldPath + '/r1/index.html'));
  assert.ok(history.includes('Moved · <a href="../' + currentPath + '/r2/index.html"'));
  assert.ok(history.includes('Test contributor'));
});

test('proof headings distinguish authorship from human verification', t => {
  const dir = readerFixture(t);
  const registry = join(dir,'data/atlas.json');
  const data = JSON.parse(readFileSync(registry));
  const manuscript = id => data.proofs.find(proof => proof.id === id).revisions[0];
  const external = {origin:'external', kind:'human', authors:['Test Author']};
  manuscript('closest-string-balanced').authorship = external;
  manuscript('three-coloring-sh-converse').authorship = external;
  const review = data.reviews.find(r => r.id === 'three-coloring-sh-converse-review');
  data.reviews.push({...review, id:'fixture-human-review', type:'human'});
  delete manuscript('distinct-vectors-fixed-coefficient').authorship.authors;
  writeFileSync(registry,JSON.stringify(data));
  execFileSync(process.execPath,['website/build.mjs'],{cwd:dir});
  const output = path => readFileSync(join(dir,'dist/site',path),'utf8');
  for (const [id, reviewType] of [[review.id, 'Agent'], ['fixture-human-review', 'Human']]) {
    const html = output('reviews/' + id + '/index.html');
    const title = 'Review of The 3-Coloring bound implies the Satisfiability Hypothesis · Theorem 1 · r1 · ' + reviewType + ' review';
    assert.ok(html.includes('<title>' + title));
    assert.ok(html.includes('<h1>' + mathText(title)));
    assert.ok(html.includes('<dt>Verdict</dt><dd><span class="status" data-status="' + review.verdict + '">'));
  }
  const heading = path => output('bounds/' + path + '/index.html').match(/<h3 id="proof">([^<]+)/)[1];
  assert.equal(heading('distinct-vectors-budget/dv-w1-fixed-coefficient'),'Proof by AI');
  assert.equal(heading('lms-closest-string-radius-alphabet/cs-w1-balanced'),'Proof manuscript');
  const sh = output('bounds/lms-3color-order/color-sh-fixed-power/index.html');
  const [forward, converse] = sh.split('aria-label="Statement implies SH"');
  assert.ok(forward.includes('ETH is Dead, Long Live SH') && !forward.includes('Test Author'));
  assert.ok(converse.includes('<h4 id="proof">Proof</h4>Test Author'));
  assert.ok(!converse.includes('<section id="proof"><h2>'));
  const literature = output('bounds/distinct-vectors-budget/dv-eth-column-budget/index.html');
  const [claim, support] = literature.split('aria-label="ETH implies Statement"');
  assert.ok(!claim.includes('source-edition') && support.includes('source-edition'));
  assert.ok(!sh.includes('Under SH, no deterministic algorithm'));
  const derived = output('bounds/distinct-vectors-budget/dv-w1-fixed-coefficient/index.html');
  assert.ok(derived.indexOf('Proof by AI') < derived.indexOf('<h2>Recovery of a historical ETH bound'));
  assert.match(output('proofs/closest-string-balanced/r1/cs-balanced/citation.txt'),/^Test Author\./);
  assert.match(output('proofs/distinct-vectors-fixed-coefficient/r1/dv-fixed-coefficient/citation.txt'),/^Atlas\./);
});

test('links the preferred publication and labels the exact edition inspected for a locator', t => {
  const dir = readerFixture(t);
  const registry = join(dir, 'data/atlas.json');
  const data = JSON.parse(readFileSync(registry));
  const paper = data.papers.find(p => p.id === 'chkx2005');
  const inspected = paper.editions.find(edition => edition.id === 'manuscript');
  inspected.title = 'Inspected manuscript title';
  inspected.primaryUrl = 'https://example.org/manuscript';
  paper.preferredEditionId = 'zz-test';
  paper.editions.push({
    id: 'zz-test', kind: 'journal', label: 'Fixture journal', title: 'Preferred publication title',
    doi: '10.1234/atlas-test', primaryUrl: 'https://example.org/journal'
  });
  writeFileSync(registry, JSON.stringify(data));
  const casePath = join(dir, 'data/cases/weighted-normalized-depth-t-circuit-weight.json');
  const record = JSON.parse(readFileSync(casePath));
  const sources = record.bounds.find(bound => bound.id === 'nc-eth-full').sources;
  const source = sources[0];
  source.editionId = 'manuscript';
  source.locator = 'Fixture manuscript theorem';
  sources.push({ ...source, editionId: 'zz-test', locator: 'Fixture journal theorem', placement: 'forward' });
  writeFileSync(casePath, JSON.stringify(record));
  execFileSync(process.execPath, ['website/build.mjs'], { cwd: dir });
  const read = path => readFileSync(join(dir, 'dist/site', path), 'utf8');
  const canonical = '<a href="https://doi.org/10.1234/atlas-test">Preferred publication title</a>';
  const summary = read('cases/weighted-normalized-depth-t-circuit-weight/index.html');
  const citations = [...summary.matchAll(/<ul class="bound-citations">([\s\S]*?)<\/ul>/g)]
    .map(match => match[1]).filter(list => list.includes(canonical));
  assert.ok(citations.length);
  for (const list of citations) assert.equal(list.split(canonical).length - 1, 1);
  const detail = read('bounds/weighted-normalized-depth-t-circuit-weight/nc-eth-full/index.html');
  const forward = [...detail.matchAll(/<div class="implication-evidence">([\s\S]*?)<\/div>/g)]
    .map(match => match[1]).find(group => group.includes('Fixture manuscript theorem'));
  assert.ok(forward);
  assert.equal(forward.split(canonical).length - 1, 1);
  assert.equal(forward.split('>Fixture journal<').length - 1, 1);
  assert.match(forward, /Fixture journal theorem/);
  assert.ok(read('papers/index.html').includes(canonical));
  const paperPage = read('papers/chkx2005/index.html');
  assert.ok(paperPage.indexOf('id="zz-test"') < paperPage.indexOf('id="manuscript"'));
  assert.match(read('papers/chkx2005/zz-test.bib'), /title = \{Preferred publication title\}/);
  assert.match(read('papers/chkx2005/zz-test.txt'), /Preferred publication title/);
  assert.match(read('papers/chkx2005/manuscript.bib'), /title = \{Inspected manuscript title\}/);
  assert.match(read('papers/chkx2005/manuscript.txt'), /Inspected manuscript title/);
});
