import { hypothesisText } from './hypotheses.mjs';
import { defaultModel } from '../scripts/models.mjs';
import { problemDefinition, boundScopeCase } from '../scripts/problems.mjs';
import { runtimeDetails, runtimeFormula, runtimeQualifications, runtimeSymbols, symbolList } from './bound-text.mjs';
import { supersessions } from '../scripts/supersessions.mjs';
import { recoveryStatuses } from '../scripts/recovery.mjs';
import { copyFileSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { posix, resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { exportAtlas, json, loadAtlas, validateAtlas } from '../scripts/database.mjs';
import { escape, mathText } from './math.mjs';
import { resolveRevision } from './revision.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values: options } = parseArgs({
  options: { commit: { type: 'string' }, release: { type: 'boolean' }, out: { type: 'string' } }
});
const output = resolve(root, options.out ?? 'dist/site');
const commit = resolveRevision(options.commit ?? process.env.GITHUB_SHA);
if (options.release && !commit) {
  throw new Error('Release builds require a verified Git commit matching data, proofs, and evidence. Check Git access and commit any changes to those files, or run npm run site:preview for a local preview.');
}

const repository = 'https://github.com/hendrikmolter/lower-bound-atlas';
const atlas = loadAtlas(resolve(root, 'data/atlas.json'));
const db = exportAtlas(validateAtlas(atlas, { release: options.release, website: true }));
const api = 'api/' + db.apiVersion;
const hypothesisOrder = [...new Set([...(db.releaseHypotheses ?? []), ...db.assumptions.map(h => h.id)])];
const problems = new Map((db.problems ?? []).map(problem => [problem.id, problem]));
const uniformETH = db.formulations?.find(f => f.id === 'uniform-eth');
function formulationComparisons(record, bound) {
  if (!bound.supported || bound.status !== 'established') return [];
  return (db.formulations ?? []).filter(f => bound.assessments?.[f.id]?.verdict !== 'established-equivalent').flatMap(f => f.equivalences
    .filter(e => e.caseId === record.id && e.boundId === bound.id && e.boundRevision === bound.revision)
    .map(e => ({ formulation: f, evidence: e })));
}
function boundCopy(bound) {
  return bound.reader?.revision === bound.revision ? bound.reader : {};
}
function boundTitle(bound) {
  const copy = boundCopy(bound);
  const premises = bound.assumptions.map(h => assumptionLabel(h.id)).join(bound.assumptionOperator === 'any' ? ' or ' : ' and ');
  return copy.title ?? (copy.label ?? 'Lower bound') + ' under ' + premises;
}
function problemLabels(record) {
  return [problems.get(record.problemId)?.name ?? record.reader?.name ?? record.title, record.reader?.parameterLabel ?? record.parameter];
}
function problemKey(record) {
  return record.problemId ?? record.reader?.name ?? record.id;
}
const byName = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare;
function compareCases(a, b) {
  const [problemA, parameterA] = problemLabels(a);
  const [problemB, parameterB] = problemLabels(b);
  return byName(problemA, problemB) || byName(parameterA, parameterB) || byName(a.id, b.id);
}
const alphabeticalCases = [...db.cases].sort(compareCases);
const emitted = new Set();
let previousFiles = [];
try {
  const previous = JSON.parse(readFileSync(resolve(output, 'manifest.json'), 'utf8'));
  if (previous.generator === 'lower-bound-atlas/website' && Array.isArray(previous.files)) previousFiles = previous.files;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const sourceUrl = path => commit && repository + '/blob/' + commit + '/' + urlPath(path);
const routes = {
  problem: id => 'problems/' + fileSegment(id) + '/index.html',
  case: id => 'cases/' + id + '/index.html',
  assumption: (id, revision) => 'assumptions/' + id + '/' + (revision ? 'r' + revision + '/' : '') + 'index.html',
  paper: id => 'papers/' + id + '/index.html',
  bound: ({ caseId, id, revision }) => 'bounds/' + caseId + '/' + id + '/' + (revision ? 'r' + revision + '/' : '') + 'index.html',
  proof: ({ id, revision, theorem }) => 'proofs/' + id + '/' + (revision ? 'r' + revision + '/' + fileSegment(theorem) + '/' : '') + 'index.html',
  review: id => 'reviews/' + id + '/index.html',
  challenge: id => 'challenges/' + id + '/index.html'
};
const registries = Object.fromEntries(['cases', 'assumptions', 'papers', 'proofs', 'reviews'].map(kind =>
  [kind, new Map(db[kind].map(record => [record.id, record]))]));
const boundVersions = new Map();
const boundKey = ref => [ref.caseId, ref.id, ref.revision].join('/');
const movedBounds = new Map((db.boundMoves ?? []).map(({from, to}) => [boundKey(from), to]));
for (const entry of db.cases) {
  const owners = [entry, ...(entry.history ?? [])];
  for (const record of [...(entry.history ?? []), entry]) {
    for (const bound of record.bounds) {
      for (const version of [...(bound.history ?? []), bound]) {
        const key = boundKey({ ...version, caseId: record.id });
        if (version !== bound && boundVersions.has(key)) continue;
        boundVersions.set(key, {record:boundScopeCase(owners, record, bound, version), version});
      }
    }
  }
}
const proofRef = ref => ({ type: 'proof', id: ref.proofId, revision: ref.revision, theorem: ref.theorem });
const boundRef = (caseId, bound) => ({ type: 'bound', caseId, id: bound.id, revision: bound.revision });
const sameObject = (a, b) => a.type === b.type && a.id === b.id && a.revision === b.revision &&
  (a.type === 'proof' ? a.theorem === b.theorem : a.caseId === b.caseId);
const formulationsById = new Map((db.formulations ?? []).map(f => [f.id, f]));
const assumptionName = id => (registries.assumptions.get(id) ?? formulationsById.get(id)).name;
const assumptionLabel = id => ({ eth: 'ETH', sh: 'SH' })[id] ?? assumptionName(id);
const ruleName = name => name.replaceAll('-', ' ');
const humanize = value => value[0].toUpperCase() + value.slice(1).replaceAll('-', ' ');

function urlPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function fileSegment(value) {
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(value) && !value.endsWith('.') &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
    ? value : '~' + Buffer.from(value).toString('hex');
}

function relativeUrl(page, target) {
  return urlPath(posix.relative(posix.dirname(page), target));
}

function link(page, target, label, hash) {
  return anchor(relativeUrl(page, target) + (hash ? '#' + encodeURIComponent(hash) : ''), label);
}

function anchor(url, label, attributes = '') {
  return `<a href="${escape(url)}"${attributes}>${mathText(label)}</a>`;
}

function write(path, content) {
  const file = resolve(output, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  emitted.add(path);
}

const copies = new Set();
function copy(source, target) {
  const file = resolve(output, target);
  mkdirSync(dirname(file), { recursive: true });
  copyFileSync(resolve(root, source), file);
  copies.add(target);
  emitted.add(target);
}

function removeObsoleteFiles() {
  const root = realpathSync(output);
  for (const file of previousFiles) {
    if (typeof file !== 'string' || emitted.has(file) || file === 'manifest.json' ||
        !file.split('/').every(part => /^[~A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(part))) continue;
    const path = resolve(output, file);
    try {
      const local = relative(root, realpathSync(path));
      if (local && local !== '..' && !local.startsWith('..' + sep) && !isAbsolute(local)) unlinkSync(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function asset(path) {
  const target = 'assets/' + path;
  if (!copies.has(target)) {
    // Only artifacts named by records, in directories curated for this edition.
    if (!/^(proofs|evidence)\//.test(path) || !/\.(md|tex|pdf|txt|lean|log)$/i.test(path) ||
        path.split('/').some(part => part !== fileSegment(part))) {
      throw new Error('Unsupported preview artifact ' + path);
    }
    copy(path, target);
  }
  return target;
}

function evidenceLink(page, path, label = 'Read evidence') {
  return path.startsWith('https://') ? anchor(path, label) : link(page, asset(path), label);
}

function heading(text, id) {
  return `<h2${id ? ` id="${escape(id)}"` : ''}>${escape(text)}</h2>`;
}

function paragraphs(text, className = '') {
  return text ? text.split(/\n\n+/).map(part =>
    `<p${className ? ` class="${className}"` : ''}>${mathText(part)}</p>`).join('') : '';
}

function detail(label, content) {
  return `<div><dt>${escape(label)}</dt><dd>${content}</dd></div>`;
}

function facts(entries) {
  return `<dl class="details-grid">${entries.filter(([, value]) => value).map(([label, value]) => detail(label, mathText(value))).join('')}</dl>`;
}

function items(elements, className = '') {
  return elements.length ? `<ul${className ? ` class="${className}"` : ''}>${elements.map(item => `<li>${item}</li>`).join('')}</ul>` : '';
}

function status(name, rule) {
  return `<span class="status" data-status="${escape(name)}">${escape(humanize(name) + (rule ? ' · ' + ruleName(rule) : ''))}</span>`;
}

function catalogPage(page, title, lead, body, { active, browse = false, crumbs = [] } = {}) {
  const nav = [
    ['index.html', 'Problems'], ['assumptions/index.html', 'Hypotheses'],
    ['papers/index.html', 'Papers'], ['notation/index.html', 'Notation'], ['about/index.html', 'About & guide']
  ];
  const navLink = ([target, label]) => anchor(relativeUrl(page, target), label, active === label ? ' aria-current="page"' : '');
  const breadcrumb = crumbs.length
    ? `<nav class="breadcrumb" aria-label="Breadcrumb">${crumbs.map(([target, name]) => link(page, target, name)).join('<span aria-hidden="true"> / </span>')}</nav>` : '';
  write(page, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escape(title)} | Lower Bound Atlas</title>
  <link rel="stylesheet" href="${relativeUrl(page, 'assets/style.css')}${commit ? '?v=' + commit : ''}">
  ${browse ? `<script src="${relativeUrl(page, 'assets/browse.js')}" defer></script>` : ''}
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header"><nav class="site-nav" aria-label="Main">
    ${anchor(relativeUrl(page, 'index.html'), 'Lower Bound Atlas', ' class="site-brand"')}
    <div class="nav-links">${nav.map(navLink).join('')}</div>
  </nav></header>
  <main id="main-content" tabindex="-1">
    ${breadcrumb}
    <header class="hero">
      <h1>${mathText(title)}</h1>
      ${paragraphs(lead, 'lead')}
    </header>
    ${body}
  </main>
  <footer class="site-footer">
    <span>${options.release ? 'Release' : 'Local preview'} · ${escape(db.edition)}</span>
    ${link(page, api + '/atlas.json', 'JSON export')}
    ${link(page, 'manifest.json', 'Build manifest')}
    ${link(page, 'legal/index.html', 'Impressum', 'impressum')}
    ${link(page, 'legal/index.html', 'Privacy', 'privacy')}
  </footer>
</body>
</html>
`);
}

function objectPage(ref) {
  if (ref.type === 'bound') return routes.bound(movedBounds.get(boundKey(ref)) ?? ref);
  return routes[ref.type](ref);
}

function proofData(ref) {
  const proof = registries.proofs.get(ref.id);
  const version = proof.revisions.find(item => item.revision === ref.revision);
  const theorem = version.theorems.find(item => item.label === ref.theorem);
  return { proof, version, theorem };
}

function objectLink(page, ref, label) {
  if (!label && ref.type === 'proof') {
    const { proof, theorem } = proofData(ref);
    label = proof.title + ' · Theorem ' + theorem.number + ' · r' + ref.revision;
  }
  if (ref.type === 'bound') {
    const target = movedBounds.get(boundKey(ref)) ?? ref;
    const { version } = boundVersions.get(boundKey(target));
    const current = registries.cases.get(target.caseId).bounds.some(bound => bound.id === target.id);
    const url = version.hardnessBaseline
      ? relativeUrl(page, routes.case(target.caseId)) + (current ? '#' + encodeURIComponent(target.id) : '')
      : relativeUrl(page, routes.bound(target));
    return anchor(url, label ?? ref.id + ' · r' + ref.revision, label ? ' aria-label="' + escape(label) + '"' : '');
  }
  return link(page, objectPage(ref), label ?? ref.id + ' · r' + ref.revision);
}

function premiseLink(page, ref, { exact = false } = {}) {
  const formulation = formulationsById.get(ref.id);
  if (formulation) return link(page, routes.assumption(formulation.hypothesisId, formulation.hypothesisRevision), formulation.name, formulation.id);
  const record = registries.assumptions.get(ref.id);
  const revision = exact || ref.revision !== record.revision ? ref.revision : undefined;
  return link(page, routes.assumption(ref.id, revision), assumptionLabel(ref.id) + (exact ? ' · r' + ref.revision : ''));
}

function premises(page, bound) {
  return bound.assumptions.map(ref => premiseLink(page, ref)).join(bound.assumptionOperator === 'any' ? ' or ' : ' and ');
}

function preferredEdition(paper) {
  return paper.editions.find(edition => edition.id === paper.preferredEditionId);
}

function preferredPaperLink(page, paper, showEdition = false) {
  const edition = preferredEdition(paper);
  const title = edition.title ?? paper.title;
  const titleLink = edition.preferredUrl ? anchor(edition.preferredUrl, title) : link(page, routes.paper(paper.id), title, edition.id);
  return titleLink + (showEdition ? ' · ' + escape(edition.label) : '');
}

function inspectedEdition(page, paper, edition, locators) {
  const preferred = edition.id === paper.preferredEditionId;
  const title = edition.title ?? paper.title;
  const label = preferred || title === (preferredEdition(paper).title ?? paper.title)
    ? edition.label : title + ' · ' + edition.label;
  const record = link(page, routes.paper(paper.id), preferred || !edition.preferredUrl ? label : 'Edition record', edition.id);
  const original = preferred || !edition.preferredUrl ? record : anchor(edition.preferredUrl, label) + ' · ' + record;
  const fullText = edition.openUrl && edition.openUrl !== edition.preferredUrl ? ' · ' + anchor(edition.openUrl, 'Open full text') : '';
  return `<span class="source-edition">${preferred ? '' : 'Inspected edition · '}${original} · ${locators.map(escape).join(' · ')}${fullText}</span>`;
}

function sourceLocator(source) {
  return source.locator + (source.editionReason ? ' · ' + source.editionReason : '');
}

function sourceLink(page, source, { authors = false, role = true } = {}) {
  const paper = registries.papers.get(source.paperId);
  const edition = paper.editions.find(item => item.id === source.editionId);
  const splitEdition = edition.id !== paper.preferredEditionId;
  return preferredPaperLink(page, paper, splitEdition) +
    (authors ? ' · ' + escape(paper.authors.join(', ')) : '') +
    (role ? ' · ' + escape(source.role) : '') +
    (splitEdition ? '<br>' : ' · ') + inspectedEdition(page, paper, edition, [sourceLocator(source)]);
}

function reviewLink(page, id) {
  const review = registries.reviews.get(id);
  const label = review.label ?? `${humanize(review.type)} review · ${review.verdict}`;
  return link(page, routes.review(id), label + (review.stale ? ' · prior revision' : ''));
}

function relatedReviews(page, ref) {
  return items(db.reviews.filter(review => sameObject(review.object, ref)).map(review => reviewLink(page, review.id)), 'review-list');
}

function challengedStatementLabel(challenge) {
  if (challenge.object.type !== 'bound') return 'Challenged proof';
  const { version } = boundVersions.get(boundKey(challenge.object));
  const title = boundCopy(version).title ?? boundCopy(version).label ?? version.statement;
  return version.status === 'withdrawn' ? 'Withdrawn · ' + title : title;
}

function relatedChallenges(page, ref) {
  return items(db.challenges.filter(challenge => sameObject(challenge.object, ref))
    .map(challenge => link(page, routes.challenge(challenge.id), challenge.disposition === 'withdrawn-support' ? 'Correction record' : 'Challenge record')));
}

function sourcesFor(bound) {
  const all = [...bound.sources, ...Object.values(bound.assessments).flatMap(assessment =>
    ['forward', 'converse'].flatMap(direction => assessment[direction].evidence.flatMap(item => item.source ? item.source : [])))];
  return [...new Map(all.map(source => [json(source), source])).values()];
}

function artifactLinks(page, ref) {
  const { version, theorem } = proofData(ref);
  const fragment = theorem.destination?.startsWith('page=') ? theorem.destination
    : theorem.destination ? 'nameddest=' + encodeURIComponent(theorem.destination) : '';
  const citation = relativeUrl(page, routes.proof(ref)) + '#cite';
  const pdf = version.pdf ? anchor(relativeUrl(page, asset(version.pdf)) + (fragment ? '#' + fragment : ''), 'Proof PDF') : '';
  return `<div class="actions">${pdf}${link(page, asset(version.source), 'View source')}${anchor(citation, 'Cite this revision')}</div>`;
}

function statementSources(bound) {
  return bound.sources.filter(source => !source.placement || ['statement','forward'].includes(source.placement));
}

function hardnessNotice(record, bound) {
  const hardness = bound.hardnessBaseline + '-hardness';
  const bounds = record.bounds.filter(item => item.supported && item.status === 'established' &&
    item.assumptions.some(premise => premise.id === 'w1'));
  const strongestBaseline = bounds.find(item => item.hardnessBaseline === 'W[2]') ?? bounds[0];
  if (strongestBaseline?.id === bound.id && strongestBaseline.revision === bound.revision &&
      bounds.every(item => item.hardnessBaseline)) {
    return 'No lower bound recorded for this parameterization beyond ' + hardness + '.';
  }
  return hardness + '.';
}

function problemActions(page, record, bound) {
  const ref = { caseId: record.id, id: bound.id };
  const sources = statementSources(bound);
  const citations = [...new Set(sources.map(source => source.paperId))]
    .map(id => preferredPaperLink(page, registries.papers.get(id)));
  const { notation, notationLabel } = boundCopy(bound);
  const corrections = bound.status === 'withdrawn' ? db.challenges.filter(c =>
    sameObject(c.object, boundRef(record.id, bound))).map(c => link(page, routes.challenge(c.id), 'Correction record')) : [];
  const references = items(citations, 'bound-citations');
  if (bound.hardnessBaseline) return references;
  const actions = `<div class="bound-links"><div class="actions">${link(page, routes.bound(ref), 'Full statement')}</div>
    ${corrections.join(' ')}${notation ? link(page, 'notation/index.html', notationLabel ?? 'Notation', notation) : ''}</div>`;
  return actions + references;
}

function directRegistryLink(ref) {
  return sourceUrl(ref.type === 'proof' ? proofData(ref).version.source : 'data/cases/' + ref.caseId + '.json');
}

function cite(page, ref, title) {
  const id = ref.type === 'proof'
    ? `${ref.id}, theorem ${ref.theorem}, proof revision ${ref.revision}`
    : `${ref.caseId}/${ref.id}, bound revision ${ref.revision}`;
  const url = directRegistryLink(ref);
  const edition = 'Edition ' + db.edition + (commit ? ', Git commit ' + commit : ', local preview');
  const authors = ref.type === 'proof' ? proofData(ref).version.authorship?.authors ?? [] : ['Lower Bound Atlas'];
  const text = `${authors.length ? authors.join(', ') + '. ' : ''}${title}. ${id}. ${edition}.${url ? ' ' + url : ''}\n`;
  const key = fileSegment(ref.type === 'proof' ? ref.id + '-' + ref.theorem : ref.caseId + '-' + ref.id) + '-r' + ref.revision;
  const bib = '@misc{' + key + ',\n  author = {' + authors.map(author => '{' + author.replace(/[{}]/g, '') + '}').join(' and ') + '},\n  title = {' + title.replace(/[{}]/g, '') +
    '},\n  note = {' + id.replace(/[{}]/g, '') + ', ' + edition.replace(/[{}]/g, '') + '},\n' +
    (url ? '  url = {' + url + '}\n' : '') + '}\n';
  const textPath = posix.join(posix.dirname(page), 'citation.txt');
  const bibPath = posix.join(posix.dirname(page), 'citation.bib');
  write(textPath, text);
  write(bibPath, bib);
  return `<section class="panel" id="cite"><h2>Cite this revision</h2>
    <p class="citation">${escape(text)}</p>
    <div class="actions">${anchor(relativeUrl(page, textPath), 'Plain-text citation', ' download')}
    ${anchor(relativeUrl(page, bibPath), 'BibTeX citation', ' download')}${url ? anchor(url, 'Source at cited commit') : ''}</div></section>`;
}

function searchAttributes(record) {
  return Object.entries(record).map(([key, value]) =>
    ` data-${key}="${escape(typeof value === 'string' ? value : JSON.stringify(value))}"`).join('');
}

function optionList(options) {
  return options.map(item => {
    const [value, label] = Array.isArray(item) ? item : [item, item];
    return `<option value="${escape(value)}">${escape(label)}</option>`;
  }).join('');
}

function optionsFor(records, field) {
  return [...new Set(records.map(item => item[field]).filter(Boolean))].sort();
}

const comparisonHypothesis = 'eth';
const hypothesisOptions = db.assumptions.map(h => [h.id, assumptionLabel(h.id)]).sort((a,b) => byName(a[1],b[1]));
const sortBounds = ['bounds', 'Most recorded lower bounds'];
const currentStatements = new Map();
const paperUses = new Map();
const hypothesisCounts = new Map();
for (const record of db.cases) {
  const statements = [];
  for (const bound of record.bounds) {
    if (bound.hardnessBaseline || !bound.supported || bound.status !== 'established') continue;
    const hypotheses = bound.assumptions.map(h => h.id).filter(id =>
      !supersessions(record.id, id, record.bounds, record.supersessions).has(bound.id));
    if (hypotheses.length) statements.push({id:bound.id, hypotheses});
    for (const id of hypotheses) hypothesisCounts.set(id,(hypothesisCounts.get(id) ?? 0)+1);
    for (const {id} of bound.assumptions) {
      const directions = [id,...db.formulations.filter(f => f.hypothesisId === id).map(f => f.id)];
      const sources = [...statementSources(bound), ...bound.sources.filter(s => s.placement === 'proof'), ...directions.flatMap(key =>
        (bound.assessments?.[key]?.forward?.evidence ?? []).flatMap(e => e.source ? [e.source] : []))];
      for (const paperId of new Set(sources.map(source => source.paperId))) {
        if (!paperUses.has(paperId)) paperUses.set(paperId,new Set());
        paperUses.get(paperId).add(id);
      }
    }
  }
  currentStatements.set(record.id,statements);
}

function searchComparisons(record) {
  const statements = currentStatements.get(record.id);
  return record.recoveryComparisons.filter(e => statements.some(b =>
    b.hypotheses.includes(e.hypothesis.id) && (!e.recovery || b.id === e.recovery.id)));
}

function filters(label, selects, sortOptions = [], defaultSortLabel = 'Alphabetical (A–Z)') {
  selects = [...selects,['sort','Sort by',[['',defaultSortLabel], ...sortOptions]]];
  const select = ([name, label, options]) => {
    if (['assumption','status'].includes(name)) {
      const summary = name === 'status' ? 'Any recovery status' : label === 'Cited for a lower bound under' ? 'All papers' : 'All hypotheses';
      return `<div class="filter-field"><span id="filter-${name}-label">${escape(label)}</span>
        <fieldset class="multi-filter" data-field="${name}" aria-labelledby="filter-${name}-label">
        <details><summary data-default="${summary}">${summary}</summary><div class="choices">
        ${options.map(([id,text]) => `<label><input type="checkbox" name="${name}" value="${escape(id)}"><span>${escape(text)}</span></label>`).join('')}
        </div></details></fieldset></div>`;
    }
    return `<label class="filter-field"><span>${escape(label)}</span><select name="${name}">${optionList(name === 'sort' ? options : [['', 'Any'], ...options])}</select></label>`;
  };
  const first = selects.filter(([name]) => !['rule', 'family', 'kind'].includes(name));
  const more = selects.filter(([name]) => ['rule', 'family', 'kind'].includes(name));
  return `<form class="filters" data-atlas-filters data-target="${comparisonHypothesis}" role="search" aria-label="${escape(label)}" hidden>
    <label><span>${escape(label)}</span><input type="search" name="q" autocomplete="off" placeholder="Name, ID, alias, or keyword"></label>
    ${first.length ? '<div class="filter-grid">' + first.map(select).join('') + '</div>' : ''}
    ${selects.some(([name]) => name === 'status') ? '<p data-recovery-help>Compare each current historical ETH bound with the bounds under another hypothesis.</p>' +
      '<details><summary>What do these recovery statuses mean?</summary><dl>' + Object.values(recoveryStatuses).map(([name, definition]) =>
        detail(name, mathText(name === 'Unresolved' ? 'A lower bound is recorded under the alternative hypothesis, but the comparison with this historical target is unresolved. A hardness-only notice does not qualify.' : definition))).join('') + '</dl><p>A partial recovery can also require ' +
        link('index.html','notation/index.html','effective little-o','effective-little-o') +
        '. An equivalence barrier can coexist with partial recovery. Problems without a historical ETH target do not match this filter.</p></details>' : ''}
    ${more.length ? '<details><summary>More filters</summary><div class="filter-grid">' + more.map(select).join('') + '</div></details>' : ''}
    <div class="search-actions"><button type="reset">Clear filters</button><button type="button" data-copy-search>Copy search link</button><span role="status" data-copy-feedback></span></div>
  </form>`;
}

function results(cards, singular, plural, title, emptyText) {
  const count = cards.length;
  return `<div class="results-heading"><h2>${escape(title)}</h2><p data-atlas-count data-atlas-singular="${singular}" data-atlas-plural="${plural}" role="status" aria-live="polite">${count} ${count === 1 ? singular : plural}</p></div>
    <p data-atlas-empty ${count ? 'hidden' : ''}>${escape(emptyText)}</p>
    <div class="case-list" data-atlas-results${['problem','parameterization'].includes(singular) ? ' data-alphabetical' : ''}>${cards.join('')}</div>`;
}

function recoveryLabel(entry) {
  return recoveryStatuses[entry.status][0] + (entry.effective && entry.scale !== 'full' ? ' (effective little-o)' : '');
}

function recoveryTarget(page, record, entry) {
  const target = record.bounds.find(b => b.id === entry.target.id);
  return objectLink(page, boundRef(record.id,target), boundCopy(target).label ?? target.statement);
}

function browseIndex() {
  const page = 'index.html';
  const cards = alphabeticalCases.map(record => {
    const assumptionIds = [...new Set(record.bounds.flatMap(bound => bound.assumptions.map(item => item.id)))];
    const papers = [...new Set(record.bounds.flatMap(bound => bound.sources.map(item => item.paperId)))];
    const search = [...problemLabels(record), record.title, record.variant, record.parameter, record.task, record.family,
      ...record.bounds.flatMap(bound => bound.hardnessBaseline ? [bound.hardnessBaseline + '-hardness'] : []),
      ...assumptionIds.flatMap(id => {
        const { name, aliases } = registries.assumptions.get(id);
        return [id, name, ...aliases];
      }),
      ...papers.flatMap(id => {
        const { title, authors } = registries.papers.get(id);
        return [id, title, ...authors];
      })].filter(Boolean);
    return {
      id: record.id, name: record.title, aliases: record.aliases, search,
      family: record.family ?? '', kind: record.kind,
      assumptions: assumptionIds, statements: currentStatements.get(record.id), recoveries: searchComparisons(record).map(e => ({
        hypothesis: e.hypothesis.id, target: e.target.id, status: e.status, bound: e.recovery?.id
      }))
    };
  });
  const groups = new Map();
  for (const index of cards) {
    const record = registries.cases.get(index.id);
    const parameter = problemLabels(record)[1];
    const id = problemKey(record);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ index, parameter, path: routes.case(record.id) });
  }
  const cardMarkup = [...groups].map(([id, entries]) =>
    `<article class="case-card" data-atlas-group><h3>${link(page,problems.has(id) ? routes.problem(id) : entries[0].path, problemLabels(registries.cases.get(entries[0].index.id))[0])}</h3>
      <strong>Recorded parameterizations</strong><ul>${entries.map(({ index, path, parameter }) =>
        `<li data-atlas-case${searchAttributes(index)}>${link(page,path,parameter,'bounds')} <span class="match-info" data-matching-hypotheses hidden></span>
          ${searchComparisons(registries.cases.get(index.id)).map(e =>
            '<div data-recovery-outcome="' + escape(e.status) + '" data-target="' + escape(e.target.id) + '" data-hypothesis="' + escape(e.hypothesis.id) + '" hidden>' +
            mathText(assumptionLabel(e.hypothesis.id)) + ' · ' + escape(recoveryLabel(e)) + ' · ETH target: ' +
            recoveryTarget(page,registries.cases.get(index.id),e) + '</div>').join('')}</li>`).join('')}</ul></article>`);
  const selects = [
    ['assumption', 'Hypothesis', hypothesisOptions],
    ['status', 'Recovery status of the historical ETH bound', Object.entries(recoveryStatuses).map(([id,[label]]) => [id,label])],
    ['family', 'Family', optionsFor(db.cases, 'family')],
    ['kind', 'Case kind', optionsFor(db.cases, 'kind').map(item => [item, humanize(item)])]
  ].filter(([name, , options]) => options.length > (['family', 'kind'].includes(name) ? 1 : 0));
  catalogPage(page, 'Browse lower bounds', 'Find conditional lower bounds by problem, parameter or hypothesis.',
    filters('Search problems', selects, [sortBounds,['parameters','Most parameterizations']]) + results(cardMarkup, 'problem', 'problems', 'Problems', 'No problems match these filters.'),
    { active: 'Problems', browse: true });
  write('search.json', json(cards));
}

function manuscriptCredit(page, item, level, id = '') {
  const target = proofRef(item);
  const { proof, theorem, version: manuscript } = proofData(target);
  const humanVerified = theorem.reviewIds.some(id => {
    const review = registries.reviews.get(id);
    return review.type === 'human' && review.applicable;
  });
  const kind = manuscript.authorship?.kind;
  const heading = kind === 'ai' ? 'Proof by AI' : kind === 'human' && humanVerified ? 'Proof' : 'Proof manuscript';
  return '<h' + level + id + '>' + heading + '</h' + level + '>' + (manuscript.authorship?.authors?.length ? escape(manuscript.authorship.authors.join(', ')) + ' · ' : '') + objectLink(page,target,proof.title + ' · Theorem ' + theorem.number) +
    artifactLinks(page,target) + relatedReviews(page,target);
}

function restrictions(conditions) {
  return conditions.length ? '<div class="input-restrictions"><strong>Input restrictions</strong>' +
    items(conditions.map(c => mathText(c.condition))) + '</div>' : '';
}

function problemConditions(record) {
  return restrictions(record.inputConditions.filter(c => c.level === 'problem'));
}

function inputScope(record, bound) {
  return restrictions(record.inputConditions.filter(c => bound.inputConditions.includes(c.id)));
}

function modelException(bound) {
  return bound.modelException ? '<p><strong>Algorithm model</strong> ' + mathText(bound.modelException.description) + '</p>' : '';
}

function restrictionLinks(page, problem) {
  if (!problem) return '';
  const parents = (problem.restrictionOf ?? []).map(r => [problems.get(r.problemId), r.condition]);
  const children = [...problems.values()].flatMap(child => (child.restrictionOf ?? [])
    .filter(r => r.problemId === problem.id).map(r => [child, r.condition]));
  return [['Restriction of', parents], ['Restricted problems', children]].filter(([, rows]) => rows.length)
    .map(([title, rows]) => '<section><h2>' + title + '</h2>' + items(rows.sort(([a],[b]) => byName(a.name,b.name)).map(([related, condition]) =>
      link(page, routes.problem(related.id), related.name) + ' (' + mathText(condition) + ')')) + '</section>').join('');
}

function casePages() {
  for (const record of db.cases) {
    const page = routes.case(record.id);
    casePage(record, page);
    write(api + '/cases/' + record.id + '.json', json(record));
  }
  for (const problem of problems.values()) {
    const page = routes.problem(problem.id);
    const records = alphabeticalCases.filter(c => c.problemId === problem.id);
    write(api + '/problems/' + problem.id + '.json', json({...problem, parameterizations: records.map(c => c.id)}));
    if (records.length === 1) {
      casePage(records[0], page);
      continue;
    }
    if (!records.length) continue;
    const entries = records.map(c => '<article class="case-card"><h3>' + link(page,routes.case(c.id),problemLabels(c)[1]) +
      '</h3>' + paragraphs(c.reader?.parameter ?? c.parameter) + paragraphs(c.reader?.additionalInput) +
      restrictions(c.inputConditions.filter(condition => condition.level === 'problem')) + '</article>');
    catalogPage(page, problem.name, '', '<section class="problem-box"><dl><dt>Input</dt><dd>' +
      mathText(problem.input) + '</dd><dt>Question</dt><dd>' + mathText(problem.question) +
      '</dd></dl></section>' + restrictionLinks(page,problem) + '<section><h2>Recorded parameterizations</h2><div class="case-list">' + entries.join('') +
      '</div></section>', {crumbs:[['index.html','Problems']]});
  }
}

function casePage(record, page) {
    const problem = problems.get(record.problemId);
    const definition = problemDefinition(problem, record.problemRevision);
    const [name] = problemLabels(record);
    const copy = record.reader ?? {};
    const anchorId = copy.anchor ?? 'parameterization';
    const challenges = db.challenges.filter(c => c.object.caseId === record.id);

    function row(bound, hypothesisId, witness) {
      const wording = boundCopy(bound);
      const id = bound.assumptions[0].id === hypothesisId ? bound.id : hypothesisId + '-' + bound.id;
      const section = `<section class="bound-row" id="${escape(id)}"${witness ? ' data-superseded-by="' + escape(witness.stronger) + '"' : ''}>`;
      if (bound.hardnessBaseline) {
        return section + paragraphs(hardnessNotice(record,bound)) + problemActions(page,record,bound) + '</section>';
      }
      const title = escape(wording.label ?? '');
      const destination = routes.bound({ caseId: record.id, id: bound.id });
      const equivalents = [
        ...formulationComparisons(record,bound).map(({formulation: f}) => [f.id, f.name]),
        ...Object.entries(bound.assessments ?? {}).filter(([id,a]) => a.verdict === 'established-equivalent' &&
          !formulationComparisons(record,bound).some(({formulation}) => formulation.id === id))
          .map(([id]) => [id, assumptionLabel(id)])
      ];
      const equivalence = equivalents.map(([id,name]) => '<p>' + link(page,destination,
        (wording.subject ? wording.subject + ' is equivalent to ' : 'Equivalent to ') + name, id) + '.</p>').join('');
      const historical = hypothesisId === 'eth';
      const label = bound.status !== 'established' ? 'Running time' : historical ? 'Running time excluded under ETH' : 'Excluded running time';
      const recoveryNotes = record.recoveryComparisons.filter(e => e.hypothesis.id === hypothesisId && e.recovery?.id === bound.id)
        .map(e => '<p>' + escape(recoveryLabel(e)) + ' · ETH target: ' + recoveryTarget(page,record,e) + '.</p>').join('');
      return `${section}${title ? '<h4>' + title + '</h4>' : ''}
        ${bound.status !== 'established' ? status(bound.status) : ''}${bound.assumptions.length > 1 ? premises(page,bound) : ''}
        ${inputScope(record,bound)}${modelException(bound)}
        <div class="excluded-time"><span>${label}</span>${runtimeFormula(record,bound)}</div>${runtimeQualifications(record,bound)}
        ${equivalence + recoveryNotes + problemActions(page,record,bound)}
        ${witness ? '<p>' + anchor('#' + witness.stronger, 'Superseding bound') + '. ' + mathText(witness.reason) + '</p>' : ''}</section>`;
    }
    const cards = hypothesisOrder.filter(id => registries.assumptions.has(id)).map(id => {
      const bounds = record.bounds.filter(b => b.assumptions.some(p => p.id === id));
      const witnesses = supersessions(record.id, id, bounds, record.supersessions);
      const earlier = bounds.filter(b => witnesses.has(b.id));
      const current = bounds.filter(b => !witnesses.has(b.id));
      const label = assumptionLabel(id);
      const comment = copy.comments?.[id];
      return `<article class="hypothesis-card" id="assessment-${escape(id)}"><h3>${premiseLink(page, {id, revision: registries.assumptions.get(id).revision})}${registries.assumptions.get(id).researchStatus === 'historical' ? ' (historical)' : ''}</h3>
        ${current.map(b => row(b,id)).join('')}${!bounds.length ? paragraphs('No lower bound recorded for this parameterization.') : ''}
        ${paragraphs(comment)}
        ${earlier.length ? '<details class="reader-details" data-earlier-bounds><summary>Earlier ' + escape(label) + (earlier.length === 1 ? ' bound' : ' bounds') + '</summary>' + earlier.map(b => row(b,id,witnesses.get(b.id))).join('') + '</details>' : ''}</article>`;
    }).join('');
    const parameterLinks = alphabeticalCases.filter(other => problemKey(other) === problemKey(record)).map(other => {
      const label = problemLabels(other)[1];
      if (page === routes.case(other.id)) return anchor('#' + anchorId, label, ' aria-current="location"');
      return link(page, routes.case(other.id), label, other.reader?.anchor ?? 'parameterization');
    });
    const body = `<nav class="param-nav" aria-label="Recorded parameterizations"><strong>Recorded parameterizations</strong>${parameterLinks.join(' ')}</nav>
      <section id="${escape(anchorId)}" class="problem-box" aria-label="Problem definition"><dl>
      <dt>Input</dt><dd>${mathText([definition?.input ?? copy.input ?? record.variant, copy.additionalInput].filter(Boolean).join(' '))}</dd>
      <dt>Parameter</dt><dd>${mathText(copy.parameter ?? record.parameter)}</dd>
      <dt>Question</dt><dd>${mathText(definition?.question ?? copy.question ?? record.task)}</dd></dl>${problemConditions(record)}</section>${restrictionLinks(page,problem)}
      ${challenges.length ? '<section class="warning">' + heading('Corrections and challenges') + items(challenges.map(c => objectLink(page,c.object,challengedStatementLabel(c)))) + '</section>' : ''}
      <section id="comparisons">${heading('Lower bounds by hypothesis','bounds')}
      ${copy.symbols?.length ? '<h3>Notation</h3>' + symbolList(copy.symbols) : ''}
      ${paragraphs(copy.notation ?? (copy.symbols?.length ? '' : record.encoding))}${cards}</section>
      <details class="reader-details"><summary>Record details</summary>${facts([['Identifier',record.id],['Revision',String(record.revision)],['Aliases',record.aliases.join(', ')]])}
      ${link(page,page,'Permalink')} · ${link(page,api+'/cases/'+record.id+'.json','JSON record')}</details>`;
    const crumbs = [['index.html','Problems']];
    if (problem && page !== routes.problem(problem.id)) crumbs.push([routes.problem(problem.id), name]);
    catalogPage(page,name,'',body,{crumbs});
}

function paperReferences(page, sources, { roles = false } = {}) {
  const papers = new Map();
  for (const source of sources) {
    if (!papers.has(source.paperId)) papers.set(source.paperId, new Map());
    const editions = papers.get(source.paperId);
    if (!editions.has(source.editionId)) editions.set(source.editionId, new Set());
    editions.get(source.editionId).add((roles ? source.role + ' · ' : '') + sourceLocator(source));
  }
  return items([...papers].map(([paperId, editions]) => {
    const paper = registries.papers.get(paperId);
    const splitEdition = [...editions.keys()].some(id => id !== paper.preferredEditionId);
    return preferredPaperLink(page, paper, !editions.has(paper.preferredEditionId)) + ' · ' + escape(paper.authors.join(', ')) +
      [...editions].map(([editionId, locators]) =>
        (splitEdition ? '<br>' : ' · ') +
        inspectedEdition(page, paper, paper.editions.find(edition => edition.id === editionId), [...locators])).join('');
  }));
}

function implicationRow(from, to, evidence, level = 3) {
  return '<section class="implication"><h' + level + ' aria-label="' + escape(from + ' implies ' + to) + '">' +
    escape(from) + ' <span aria-hidden="true">⇒</span> ' + escape(to) + '</h' + level + '>' +
    '<div class="implication-evidence">' + evidence + '</div></section>';
}

function equivalenceSection(page, target, forward, converse) {
  const name = assumptionLabel(target.id);
  return '<section class="equivalence" id="' + escape(target.id) + '"><h2>Equivalence to ' +
    premiseLink(page,target) + '</h2>' + implicationRow(name,'Statement',forward) +
    implicationRow('Statement',name,converse) + '</section>';
}

function boundPages() {
  for (const { record, version } of boundVersions.values()) {
    const ref = boundRef(record.id, version);
    const recordPath = api + '/bounds/' + record.id + '/' + version.id + '/r' + version.revision + '.json';
    write(recordPath, json(version));
    if (version.hardnessBaseline || movedBounds.has(boundKey(ref))) continue;
    const problemName = problemLabels(record)[0];
    const currentRecord = registries.cases.get(record.id);
    const current = currentRecord.bounds.find(bound => bound.id === version.id);
    const pages = [objectPage(ref)];
    if (current?.revision === version.revision) pages.push(routes.bound({ ...ref, revision: undefined }));
    for (const page of pages) {
      const revision = objectPage(ref);
      const copy = boundCopy(version);
      const runtime = runtimeDetails(record,version);
      const name = boundTitle(version);
      const challenges = relatedChallenges(page,ref);
      let proofAnchor = false;
      function evidenceFor(direction, includeStatement = false, headingLevel = 4) {
        const sources = includeStatement ? statementSources(version) : [];
        const manuscripts = new Map();
        function addProof(item) { manuscripts.set(objectPage(proofRef(item)),item); }
        if (includeStatement) version.proofs.forEach(addProof);
        for (const e of direction?.evidence ?? []) {
          if (e.proof) addProof(e.proof);
          else if (e.source) sources.push(e.source);
        }
        return paperReferences(page,sources) + [...manuscripts.values()].map(item => {
          const id = proofAnchor ? '' : ' id="proof"';
          proofAnchor = true;
          return manuscriptCredit(page,item,headingLevel,id);
        }).join('');
      }
      const premise = version.assumptions.length === 1 ? version.assumptions[0] : undefined;
      const isPremise = target => target.id === premise?.id && target.revision === premise.revision;
      const formulationEvidence = formulationComparisons(record,version);
      const assessed = Object.entries(version.assessments ?? {}).filter(([id,a]) =>
        a.verdict === 'established-equivalent' && !formulationEvidence.some(({formulation}) => formulation.id === id));
      const premiseHasEquivalence = assessed.some(([id,a]) => isPremise({id,revision:a.hypothesisRevision})) ||
        formulationEvidence.some(({formulation}) => isPremise(formulation));
      const forwardAssessment = premise && version.assessments?.[premise.id];
      const forwardEvidence = forwardAssessment?.forward.effectiveStatus === 'established' &&
        forwardAssessment.hypothesisRevision === premise.revision ? forwardAssessment.forward : undefined;
      const premiseName = version.assumptions.map(ref => assumptionLabel(ref.id)).join(version.assumptionOperator === 'any' ? ' or ' : ' and ');
      const prefix = ['Under ' + premiseName + ', ', 'Under the ' + premiseName + ', '].find(text => version.statement.startsWith(text));
      const statement = prefix ? version.statement.slice(prefix.length) : version.statement;
      const statementText = prefix && statement.startsWith('no ') ? 'No ' + statement.slice(3) : statement;
      const implication = premiseHasEquivalence ? '' : implicationRow(premiseName,'Statement',evidenceFor(forwardEvidence,true,3),2);
      const equivalences = formulationEvidence.map(({formulation: f,evidence: e}) =>
        equivalenceSection(page,f,
          items([e,...(e.additionalForwardSources ?? [])].map(ref => anchor(ref.source,ref.locator))) +
            (isPremise(f) ? evidenceFor(undefined,true) : ''),
          items([anchor(e.reverseSource ?? e.source,e.reverseLocator ?? e.locator)]))).join('');
      const comparisons = assessed.map(([id,a]) => {
        const target = {id,revision:a.hypothesisRevision};
        return equivalenceSection(page,target,evidenceFor(a.forward,isPremise(target)),evidenceFor(a.converse));
      }).join('');
      const historical = (copy.historicalNote ?? []).map(part => typeof part === 'string' ? escape(part) :
        part.url ? anchor(part.url,part.text) : link(page,part.path,part.text,part.fragment)).join('');
      const history = version.history ?? [];
      const recoveries = (record.recoveryComparisons ?? []).filter(e =>
        e.recovery?.id === version.id && e.recovery.revision === version.revision);
      const recoverySection = recoveries.map(e => {
        const target = boundVersions.get(boundKey({...e.target, caseId: record.id})).version;
        const statements = [target, version];
        const additional = e.evidence.filter(ref => !statements.some(b => ref.proofId
          ? b.proofs.some(p => p.proofId === ref.proofId && p.revision === ref.revision && p.theorem === ref.theorem)
          : statementSources(b).some(s => s.paperId === ref.paperId && s.editionId === ref.editionId && s.locator === ref.locator)));
        return '<p>' + escape(recoveryLabel(e)) + ' · ETH target: ' + recoveryTarget(page,record,e) +
          '</p>' + paragraphs(e.comparison) +
          paperReferences(page, additional.filter(ref => !ref.proofId), { roles: true }) +
          items(additional.filter(ref => ref.proofId).map(ref => objectLink(page,proofRef(ref))));
      }).join('');
      const content = `
        ${current && current.revision !== version.revision ? '<p class="warning">' + objectLink(page,boundRef(record.id,current),'See the current revision') + '</p>' : ''}
        ${version.status !== 'established' ? '<p class="warning">' + status(version.status) + '</p>' : ''}
        <section class="problem-box"><h2 id="statement">Statement</h2>
        ${runtime.legacy ? paragraphs(record.reader?.boundContext) : ''}
        ${restrictions(record.inputConditions.filter(c => c.level === 'problem' || version.inputConditions.includes(c.id)))}${modelException(version)}
        ${!runtime.legacy ? paragraphs(statementText) + '<p class="statement">' + runtimeFormula(record,version) +
          '</p>' + runtimeQualifications(record,version) + runtimeSymbols(record,version) + paragraphs(runtime.explanation) :
          copy.statement ? paragraphs(copy.statement) :
          paragraphs(copy.runtime ?? version.runtime,'statement') + paragraphs(statementText) +
          paragraphs(version.model) + paragraphs(version.inputFactor)}
        ${copy.notation ? link(page,'notation/index.html',copy.notationLabel ?? 'Notation',copy.notation) : ''}
        </section>${implication}${equivalences}${comparisons}
        ${historical ? '<section><h2>Historical status</h2><p>' + historical + '</p></section>' : ''}
        ${challenges ? '<section class="warning"><h2>Challenges and corrections</h2>' + challenges + '</section>' : ''}
        ${recoverySection ? '<section><h2>Recovery of a historical ETH bound</h2>' + recoverySection + '</section>' : ''}
        <details class="reader-details"><summary>Citation and record details</summary>
        <p>${link(page,revision,'Revision permalink')} · ${link(page,recordPath,'JSON record')}</p>
        ${items(history.map(b => objectLink(page,boundRef(record.id,b),'Earlier revision ' + b.revision)))}
        ${cite(page,ref,problemName + ' · ' + name)}</details>`;
      catalogPage(page,name,'',content,
        {crumbs:[['index.html','Problems'],[routes.case(record.id),problemName]]});
    }
  }
}

function applicationCards(page, hypothesis, revision) {
  const groups = new Map();
  for (const ref of db.reverse.assumptions[hypothesis.id] ?? []) {
    const { record, version } = boundVersions.get(boundKey(ref));
    if (revision && !version.assumptions.some(p => p.id === hypothesis.id && p.revision === revision)) continue;
    if (!groups.has(record.id)) groups.set(record.id, { record, bounds: [] });
    groups.get(record.id).bounds.push({ ref, version });
  }
  return [...groups.values()].sort((a,b) => compareCases(a.record,b.record)).map(({ record, bounds }) => {
    const [name, parameter] = problemLabels(record);
    const attributes = searchAttributes({ id: record.id, name: name + ' · ' + parameter, total: currentStatements.get(record.id).filter(b => b.hypotheses.includes(hypothesis.id)).length, aliases: record.aliases,
      search: [name, parameter, record.title, record.task, record.parameter,
        ...bounds.flatMap(({ version }) => [version.id, boundCopy(version).label, version.runtime, version.statement,
          ...(version.hardnessBaseline ? [version.hardnessBaseline + '-hardness'] : [])])],
      task: record.task, parameter: record.parameter });
    const entries = bounds.map(({ ref, version }) => {
      const label = version.hardnessBaseline ? version.hardnessBaseline + '-hardness' : boundCopy(version).label;
      const state = version.status === 'established' ? '' : status(version.status) + ' ';
      const scope = version.status === 'conditional' || version.assumptions.length > 1
        ? paragraphs(version.statement) : '';
      const runtime = version.hardnessBaseline ? '' :
        ' · ' + runtimeFormula(record,version) + runtimeQualifications(record,version);
      return state + objectLink(page, ref, label || 'Full statement') + runtime +
        inputScope(record,version) + modelException(version) + scope;
    });
    return { record, name, parameter, markup: `<article class="case-card" data-atlas-case${attributes}>
      <h3>${link(page, routes.case(record.id), name)}</h3>
      <p class="case-parameter"><strong>Parameter</strong> ${escape(parameter)}</p>${items(entries)}</article>` };
  });
}

function assumptionPages() {
  const index = 'assumptions/index.html';
  const rank = id => hypothesisOrder.includes(id) ? hypothesisOrder.indexOf(id) : hypothesisOrder.length;
  const ordered = [...db.assumptions].sort((a, b) => rank(a.id) - rank(b.id));
  const intro = ordered.map(record => {
    const text = hypothesisText(record);
    const attributes = searchAttributes({ id: record.id, name: text?.title ?? record.name, aliases: record.aliases, lifecycle: record.researchStatus ?? 'active', total: hypothesisCounts.get(record.id) ?? 0,
      search: [record.name, record.definition, record.model, text?.summary, ...record.aliases] });
    return `<article class="case-card" data-atlas-case${attributes}><h3>${link(index, routes.assumption(record.id), text?.title ?? record.name)}</h3>
      ${paragraphs(text?.summary ?? record.definition)}</article>`;
  });
  catalogPage(index, 'Hypotheses', '', filters('Search hypotheses', [['lifecycle','Hypothesis status',[['active','Active'],['historical','Historical']]]], [sortBounds]) +
    results(intro, 'hypothesis', 'hypotheses', 'Definitions', 'No hypotheses match this search.'), { active: 'Hypotheses', browse: true });
  for (const record of ordered) {
    for (const version of [record, ...(record.history ?? [])]) {
      const text = hypothesisText(version);
      const pinned = routes.assumption(record.id, version.revision);
      const current = routes.assumption(record.id);
      for (const page of (version === record ? [pinned, current] : [pinned])) {
        const applications = applicationCards(page, record, page === pinned ? version.revision : undefined);
        const choices = key => applications.map(item => key === 'task' ? [item.record.task, item.name] : [item.record.parameter, item.parameter]);
        const selections = applications.length > 1 ? [['task', 'Problem', choices('task')], ['parameter', 'Parameter', choices('parameter')]] : [];
        const definition = paragraphs(text?.statement ?? version.definition);
        const catalog = applications.length ? filters('Find a recorded bound', selections, [sortBounds]) +
          results(applications.map(item => item.markup), 'parameterization', 'parameterizations', 'Lower bounds by problem', 'No matching lower bounds.')
          : '<section><h2>Lower bounds by problem</h2><p>No lower bounds recorded under this hypothesis.</p></section>';
        const formulations = (db.formulations ?? []).filter(f => f.hypothesisId === record.id && f.hypothesisRevision === version.revision);
        const historical = record.id === 'eth' && uniformETH?.hypothesisRevision === version.revision && uniformETH.refutation;
        const citedFormulations = new Map();
        for (const f of formulations) {
          if (!citedFormulations.has(f.reference)) citedFormulations.set(f.reference, {label:f.referenceLabel ?? 'Source', names:[]});
          citedFormulations.get(f.reference).names.push(f.name);
        }
        const definitions = [];
        if (version.source) {
          const label = historical ? 'Original ETH' : version.name;
          definitions.push((formulations.length ? '<strong>' + escape(label) + '.</strong> ' : '') +
            sourceLink(page, version.source, { authors:true, role:false }));
        }
        for (const [url, {label, names}] of citedFormulations) {
          definitions.push('<strong>' + escape(names.join(' and ')) + '.</strong> ' + anchor(url,label));
        }
        const heading = definitions.length > 1 ? 'Defining sources' : version.source?.role === 'class definitions' ? 'Source for the class definitions' : 'Defining source';
        const source = definitions.length ? '<section id="defining-sources"><h2>' + heading + '</h2>' +
          (definitions.length === 1 ? '<p>' + definitions[0] + '</p>' : '<ul>' + definitions.map(item => '<li>' + item + '</li>').join('') + '</ul>') + '</section>' : '';
        const variants = formulations.map(f => '<section class="problem-box" id="' + escape(f.id) + '"><h2>' + escape(f.name) + '</h2>' +
          paragraphs(f.statement) + '</section>').join('');
        catalogPage(page, text?.title ?? version.name, '', `
          <section class="problem-box"${historical ? ' id="original-eth"' : ''}><h2>${historical ? 'Original ETH' : 'Statement'}</h2>${definition}</section>
          ${variants}
          ${historical ? '<section id="historical-status"><h2>Historical status</h2><p>In October 2026, OpenAI and Anthropic each reported a deterministic algorithm for counting the satisfying assignments of a 3-CNF formula. Anthropic describes the two results as independent and concurrent.</p>' +
            '<p>Either algorithm, with its claimed running time, would decide 3-SAT with an ' +
            link(page,'notation/index.html','effectively sublinear exponent','effective-little-o') + '. This would refute strongly uniform ETH and hence also uniform ETH and original ETH.</p>' +
            '<ul><li>OpenAI, ' + anchor(uniformETH.refutation,'The Exponential Time Hypothesis is False') + ' (October 2026), Theorem 1.1.</li>' +
            '<li>Anthropic, <a href="https://hexagonmath.org/pdf/2610.00577">A ' + mathText('2^(o(n))') + ' Time Algorithm for 3-SAT</a> (October 2026), Main Theorem and provenance note.</li></ul></section>' +
            '<section><h2>Recovery under another hypothesis</h2><p>If either reported result holds, a lower bound that implies strongly uniform ETH cannot follow from any true hypothesis. For a bound excluding only algorithms with an effectively sublinear exponent, the implication must hold for that version of the bound.</p></section>' : ''}
          ${source}${catalog}
          <details class="reader-details"><summary>Record details</summary>
          ${facts([['Identifier', record.id], ['Revision', String(version.revision)], ['Aliases', version.aliases.join(', ')], ['Model', version.model], ['Quantifiers', version.quantifiers], ['Conventions', version.conventions], ['Source note', version.access]])}
          ${link(page, pinned, 'Revision permalink')} · ${link(page, current, 'Current definition and applications')} ·
          ${link(page, api + '/assumptions/' + record.id + '.json', 'JSON record')}</details>`,
          { browse: applications.length > 0, crumbs: [[index, 'Hypotheses']] });
      }
    }
    write(api + '/assumptions/' + record.id + '.json', json(record));
  }
}

function paperUsesList(page, uses) {
  const rows = [];
  const groups = new Map();
  for (const ref of uses) {
    const locator = sourceLocator(ref);
    if (ref.type !== 'bound') {
      const target = ref.type === 'assumption' ? premiseLink(page, ref, {exact: true})
        : link(page, routes.case(ref.caseId), registries.cases.get(ref.caseId).title + ' · ' + assumptionLabel(ref.id) + ' assessment', 'assessment-' + ref.id);
      rows.push(target + ' · ' + escape(locator) + ' · ' + escape(ref.role));
      continue;
    }
    const record = registries.cases.get(ref.caseId);
    const key = JSON.stringify([problemKey(record), locator]);
    if (!groups.has(key)) {
      const group = {name: problemLabels(record)[0], locator, targets: new Map()};
      groups.set(key, group);
      rows.push(group);
    }
    const targets = groups.get(key).targets;
    const id = boundKey(ref);
    if (!targets.has(id)) targets.set(id, {ref, parameter: problemLabels(record)[1], roles: new Set()});
    targets.get(id).roles.add(ref.role);
  }
  return items(rows.map(group => {
    if (typeof group === 'string') return group;
    const targets = [...group.targets.values()].sort((a,b) => byName(a.parameter,b.parameter));
    const links = targets.map(({ref,parameter,roles}) => {
      const {version} = boundVersions.get(boundKey(ref));
      const label = targets.some(other => other.ref !== ref && other.parameter === parameter)
        ? parameter + ' · ' + boundTitle(version) : parameter;
      const details = [...roles].filter(role => role !== 'running-time lower bound' &&
        !(role === 'forward implication' && roles.has('running-time lower bound')));
      return objectLink(page, ref, label) + (details.length ? ' (' + escape(details.join(', ')) + ')' : '');
    });
    return escape(group.name) + ' · ' + escape(group.locator) + ' · ' + links.join(' · ');
  }));
}

function paperCitation(page, paper, edition) {
  if (!edition.preferredUrl) return '';
  const title = edition.title ?? paper.title;
  const name = title.replace(/[{}]/g, '');
  const key = paper.id + '-' + edition.id;
  const authors = paper.authors.join(' and ').replace(/[{}]/g, '');
  const bib = `@misc{${key},\n  author = {${authors}},\n  title = {${name}},\n  note = {${edition.label.replace(/[{}]/g, '')}},\n` +
    (edition.doi ? '  doi = {' + edition.doi + '},\n' : '') + '  url = {' + edition.preferredUrl + '}\n}\n';
  const path = posix.join(posix.dirname(page), edition.id + '.bib');
  const textPath = posix.join(posix.dirname(page), edition.id + '.txt');
  write(path, bib);
  write(textPath, paper.authors.join(', ') + '. ' + title + '. ' + edition.label + '. ' + edition.preferredUrl + '\n');
  return anchor(relativeUrl(page, textPath), 'Plain-text citation', ' download') +
    anchor(relativeUrl(page, path), 'BibTeX for this edition', ' download');
}

function paperPages() {
  const index = 'papers/index.html';
  function authorKey(name) {
    if (/\bGroup$/u.test(name)) return name;
    const parts = name.trim().split(/\s+/u);
    const suffix = /^(?:Jr\.?|Sr\.?|II|III|IV)$/u.test(parts.at(-1)) ? parts.pop() : '';
    let start = parts.length - 1;
    while (start > 0 && /^(?:de|der|van|von|la|le|den)$/u.test(parts[start - 1])) start--;
    return [parts.slice(start).join(' '), parts.slice(0,start).join(' '), suffix].join(', ');
  }
  const papers = db.papers.map(paper => ({paper, authors:paper.authors.map(authorKey)}));
  papers.sort((a,b) => {
    for (let i = 0; i < Math.min(a.authors.length,b.authors.length); i++) {
      const difference = byName(a.authors[i],b.authors[i]);
      if (difference) return difference;
    }
    return a.authors.length - b.authors.length || byName(preferredEdition(a.paper).title ?? a.paper.title, preferredEdition(b.paper).title ?? b.paper.title);
  });
  const cards = papers.map(({paper},rank) => {
    const edition = preferredEdition(paper);
    const attributes = searchAttributes({ id: paper.id, name: edition.title ?? paper.title, 'author-rank':rank, aliases: [], assumptions: [...(paperUses.get(paper.id) ?? [])], year: edition.label.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? "",
      search: [paper.title, ...paper.authors, ...paper.editions.flatMap(item => [item.title, item.label, item.doi].filter(Boolean))] });
    return `<article class="case-card" data-atlas-case${attributes}><h3>${preferredPaperLink(index, paper)}</h3>
      ${paragraphs(paper.authors.join(', ') + ' · ' + edition.label, 'muted')}<p>${link(index, routes.paper(paper.id), 'Editions and recorded uses', edition.id)}</p></article>`;
  });
  catalogPage(index, 'Original papers', 'Find the inspected editions and the statements that cite them.',
    filters('Search papers', [['assumption','Cited for a lower bound under',hypothesisOptions]], [['title','Title (A–Z)'],['newest','Newest publication first'],['oldest','Oldest publication first']], 'Authors (A–Z)') + results(cards, 'paper', 'papers', 'Papers', 'No papers match this search.'), { active: 'Papers', browse: true });
  for (const paper of db.papers) {
    const page = routes.paper(paper.id);
    const uses = db.reverse.papers[paper.id] ?? [];
    const preferred = preferredEdition(paper);
    const editions = [preferred, ...paper.editions.filter(edition => edition !== preferred)].map(edition => {
      const editionUses = uses.filter(use => use.editionId === edition.id);
      const editionTitle = edition.title ?? paper.title;
      const title = editionTitle !== (preferred.title ?? paper.title) ? paragraphs(editionTitle) : '';
      return `<section class="panel" id="${edition.id}"><h2>${edition === preferred ? 'Preferred edition · ' : ''}${escape(edition.label)}</h2>
        ${title}
        <div class="actions">${edition.preferredUrl ? anchor(edition.preferredUrl, edition.doi ? 'DOI · ' + edition.doi : 'Open original edition') : ''}
        ${edition.openUrl && edition.openUrl !== edition.preferredUrl ? anchor(edition.openUrl, 'Open full text') : ''}${paperCitation(page, paper, edition)}</div>
        ${paragraphs(edition.access)}
        <h3>Recorded uses</h3>${paperUsesList(page, editionUses) || paragraphs('No use of this edition is recorded.')}</section>`;
    });
    catalogPage(page, preferred.title ?? paper.title, paper.authors.join(', '), editions.join(''), { crumbs: [[index, 'Papers']] });
    write(api + '/papers/' + paper.id + '.json', json(paper));
  }
}

function challengeAction(ref) {
  const object = ref.type === 'proof' ? ref.id + '/' + ref.theorem : ref.caseId + '/' + ref.id;
  const params = new URLSearchParams({
    title: 'Challenge ' + object + ' revision ' + ref.revision,
    body: `Object: ${object}\nRevision: ${ref.revision}\n${commit ? 'Git commit: ' + commit + '\n' : ''}\nStep and objection:\n\nEvidence:\n`
  });
  return anchor(repository + '/issues/new?' + params, ref.type === 'proof' ? 'Challenge this proof' : 'Challenge this bound');
}

function proofPages() {
  for (const proof of db.proofs) {
    const overview = routes.proof(proof);
    const supported = db.reverse.proofs[proof.id] ?? [];
    const sections = [];
    for (const version of [...proof.revisions].reverse()) {
      const cards = version.theorems.map(theorem => {
        const ref = { type: 'proof', id: proof.id, revision: version.revision, theorem: theorem.label };
        const page = objectPage(ref);
        const theoremName = 'Theorem ' + theorem.number;
        const current = version.revision === proof.currentRevision;
        const currentVersion = proof.revisions.find(candidate => candidate.revision === proof.currentRevision);
        const currentTheorem = currentVersion.theorems.find(candidate => candidate.label === theorem.label);
        const uses = supported.filter(bound => bound.proofRevision === ref.revision && bound.theorem === ref.theorem);
        const dependencies = theorem.dependencies ?? version.dependencies ?? [];
        const dependents = db.reverse.dependencies['proof/' + ref.id + '/' + ref.revision + '/' + ref.theorem] ?? [];
        const challenges = relatedChallenges(page, ref);
        const checked = relatedReviews(page, ref);
        const citationMap = new Map();
        for (const use of uses) {
          const { version: bound } = boundVersions.get(boundKey(use));
          for (const source of sourcesFor(bound)) citationMap.set(json(source), source);
        }
        const body = `
          ${current ? '' : `<p class="warning">Earlier proof revision · ${currentTheorem
            ? objectLink(page, { ...ref, revision: currentVersion.revision }, 'Current theorem revision')
            : link(page, overview, 'Current proof record')}</p>`}
          <section class="panel"><h2>Exact theorem statement</h2>${paragraphs(theorem.statement, 'statement')}
            ${artifactLinks(page, ref)}
            ${facts([['Theorem ID', theorem.label], ['PDF destination', theorem.destination], ['Dependency coverage', version.dependencyCoverage]])}
          </section>
          <section>${heading('Verification')}${checked || paragraphs('No review recorded.')}
            ${challenges}${!theorem.supports ? paragraphs('This proof revision has no current support in the export.', 'warning') : ''}
            <div class="actions">${challengeAction(ref)}</div>
          </section>
          ${uses.length ? `<section>${heading('Related bounds and premises')}${items(uses.map(bound => {
            const { record, version } = boundVersions.get(boundKey(bound));
            return objectLink(page, bound, record.title + ' · ' + bound.id) + ' · ' + premises(page, version) + ' · ' + status(version.status);
          }))}</section>` : ''}
          ${dependencies.length || dependents.length ? `<section>${heading('Recorded dependencies')}
            ${items(dependencies.map(item => objectLink(page, item)))}${dependents.length ? '<h3>Used by</h3>' +
              items(dependents.map(item => objectLink(page, item))) : ''}</section>` : ''}
          ${citationMap.size ? `<section>${heading('Original papers from related bounds')}${paperReferences(page, [...citationMap.values()])}</section>` : ''}
          ${cite(page, ref, proof.title + ' · ' + theoremName)}`;
        catalogPage(page, theoremName + ' · ' + proof.title, '', body,
          { crumbs: [[overview, proof.title]] });
        write(api + '/' + page.replace('/index.html', '.json'), json({ proofId: proof.id, revision: version.revision,
          source: version.source, pdf: version.pdf, authorship: version.authorship, dependencies, theorem }));
        return `<article class="bound-card"><h3>${objectLink(overview, ref, theoremName + ' · ' + theorem.label)}</h3>
          ${paragraphs(theorem.statement)}${artifactLinks(overview, ref)}${relatedReviews(overview, ref)}</article>`;
      });
      sections.push(`<section id="r${version.revision}">${heading('Revision ' + version.revision)}${cards.join('')}</section>`);
    }
    catalogPage(overview, proof.title, '', sections.join(''));
    write(api + '/proofs/' + proof.id + '.json', json(proof));
  }
}

function reviewObjectTitle(ref) {
  if (ref.type === 'proof') {
    const { proof, theorem } = proofData(ref);
    return proof.title + ' · Theorem ' + theorem.number + ' · r' + ref.revision;
  }
  const { record, version } = boundVersions.get(boundKey(ref));
  const title = boundTitle(version);
  const name = title.startsWith(record.title) ? title : record.title + ' · ' + title;
  return name + ' · r' + ref.revision;
}

function reviewPages() {
  const entries = db.reviews.map(review => ({ review, objectTitle: reviewObjectTitle(review.object) }));
  const index = 'reviews/index.html';
  const listing = entries.map(({review, objectTitle}) => ({
    id: review.id,
    label: objectTitle + ' · ' + humanize(review.type) + ' review · ' + review.date
  })).sort((a, b) => a.label.localeCompare(b.label, 'en'));
  catalogPage(index, 'Review records', '', items(listing.map(entry => link(index, routes.review(entry.id), entry.label))));
  for (const { review, objectTitle } of entries) {
    const page = routes.review(review.id);
    const lean = review.lean;
    const sharedTitle = entries.some(entry => entry.review !== review && entry.objectTitle === objectTitle);
    const reviewerDetails = item => [humanize(item.type) + ' review', item.reviewer, item.date].filter(Boolean).join(' · ');
    const repeatedDetails = sharedTitle && entries.some(entry => entry.review !== review &&
      entry.objectTitle === objectTitle && reviewerDetails(entry.review) === reviewerDetails(review));
    const title = 'Review of ' + objectTitle +
      (sharedTitle ? ' · ' + reviewerDetails(review) : '') + (repeatedDetails ? ' · ' + review.id : '');
    const content = `
      <section class="panel">${heading('Reviewed scope')}${paragraphs(review.scope)}
        <dl class="details-grid">${detail('Reviewed object', objectLink(page, review.object, objectTitle))}
        ${detail('Verdict', status(review.verdict))}
        ${[['Reviewer', review.reviewer], ['Date', review.date], ['Review type', humanize(review.type)],
          ['Source SHA-256', review.sourceSha256],
          ['Independent review', review.independent === undefined ? undefined : review.independent ? 'Yes' : 'No']]
          .filter(([, value]) => value).map(([label, value]) => detail(label, mathText(value))).join('')}</dl>
        ${review.stale ? paragraphs('This review is retained with the recorded revision.', 'warning') : ''}
        <div class="actions">${evidenceLink(page, review.evidence, 'Open review report')}</div>
      </section>${lean ? `<section class="panel">${heading('Lean build')}
        ${facts([['Declaration', lean.declaration], ['Toolchain', lean.toolchain], ['Commit', lean.commit],
          ['Dependencies', lean.dependencies], ['Axioms', lean.axioms.join(', ')]])}
        ${items([evidenceLink(page, lean.buildEvidence, 'Build evidence'), reviewLink(page, lean.correspondenceReviewId)])}</section>` : ''}`;
    catalogPage(page, title, '', content);
    write(api + '/reviews/' + review.id + '.json', json(review));
  }
}

function challengePages() {
  for (const challenge of db.challenges) {
    const page = routes.challenge(challenge.id);
    const sources = challenge.object.type === 'bound'
      ? boundVersions.get(boundKey(challenge.object))?.version.sources.filter(s => s.placement === 'correction') ?? [] : [];
    const content = `<section class="warning"><p>${status(challenge.disposition)}</p>
      <dl class="details-grid">${detail('Challenged object', objectLink(page, challenge.object))}
        ${detail('Reporter', escape(challenge.reporter))}${detail('Date', escape(challenge.date))}</dl>
      <div class="actions">${evidenceLink(page, challenge.evidence, 'Read challenge evidence')}</div></section>
      <section>${heading('Decision history')}${challenge.decisions.length ? challenge.decisions.map(decision =>
        `<article class="panel"><h3>${escape(decision.date + ' · ' + decision.reviewer)}</h3>
          ${paragraphs(decision.reason)}${evidenceLink(page, decision.evidence, 'Read decision evidence')}</article>`).join('') : paragraphs('No decision recorded.')}</section>
      ${sources.length ? '<section><h2>Sources for the correction</h2>' + paperReferences(page, sources, { roles: true }) + '</section>' : ''}
      ${challenge.corrections?.length ? `<section>${heading('Corrections')}${items(challenge.corrections.map(ref => objectLink(page, ref)))}</section>` : ''}`;
    const current = challenge.object.caseId
      ? `<div class="actions">${link(page, routes.case(challenge.object.caseId), 'Current case and benchmark comparison', 'comparisons')}</div>` : '';
    catalogPage(page, 'Challenge · ' + challenge.id, challenge.objection, content + current,
      { crumbs: [['about/index.html', 'About & guide']] });
    write(api + '/challenges/' + challenge.id + '.json', json(challenge));
  }
}

function versionHistory(page) {
  const days = new Map();
  function add(date, ref, outcome, destination, action) {
    const bound = ref.type === 'bound' && boundVersions.get(boundKey(ref));
    const context = bound ? problemLabels(bound.record)[0] : proofData(ref).proof.title;
    const title = bound ? boundCopy(bound.version).title ?? boundCopy(bound.version).label ?? bound.version.statement
      : 'Theorem ' + proofData(ref).theorem.number;
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(`<li><div><p class="change-context">${escape(context)}</p>
      <h4>${objectLink(page, ref, title)}</h4></div>
      <div class="change-result"><p>${escape(outcome)}</p>${link(page, destination, action)}</div></li>`);
  }
  const [initial, ...entries] = JSON.parse(readFileSync(resolve(root, 'data/history.json'), 'utf8'));
  function checkEvent(event) {
    if (!event?.contributor?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) throw Error('Missing history date or contributor');
  }
  checkEvent(initial);
  if (initial.kind !== 'initial') throw Error('Missing initial release in history');
  const loggedProblems = new Set();
  const loggedBounds = new Set();
  const initialCases = new Set();
  for (const { id, revision } of initial.cases) {
    const record = registries.cases.get(id);
    const snapshot = record && [record, ...(record.history ?? [])].find(item => item.revision === revision);
    if (!snapshot || initialCases.has(id)) throw Error('Unknown or duplicate initial case in history: ' + id);
    initialCases.add(id);
    loggedProblems.add(snapshot.problemId);
    for (const bound of snapshot.bounds) loggedBounds.add(boundKey(boundRef(id, bound)));
  }
  const caseCount = initialCases.size;
  const problemCount = loggedProblems.size;
  const initialEntry = `<li><div><h4>Initial private launch candidate</h4>
    <p>${problemCount} problems and ${caseCount} parameterizations.</p></div>
    <div class="change-result"><p>${escape(initial.contributor)}</p></div></li>`;
  const moveDestinations = new Set((db.boundMoves ?? []).map(move => boundKey(move.to)));
  const heldBounds = new Set([...(atlas.raw.cases ?? []), ...atlas.caseFiles.values()].flatMap(record =>
    record.bounds.filter(bound => bound.includeInRelease === false).map(bound => record.id + '/' + bound.id)));
  for (const event of entries.slice().reverse()) {
    checkEvent(event);
    if (event.kind === 'update') {
      if (!event.title?.trim() || !event.summary?.trim()) throw Error('Missing Atlas update title or summary');
      if (!days.has(event.date)) days.set(event.date, []);
      days.get(event.date).push(`<li><div><h4>${escape(event.title)}</h4><p>${escape(event.summary)}</p></div>
        <div class="change-result"><p>${escape(event.contributor)}</p></div></li>`);
      continue;
    }
    const groups = new Map();
    for (const id of event.problems) {
      if (!problems.has(id) || loggedProblems.has(id)) throw Error('Unknown or duplicate problem in history: ' + id);
      loggedProblems.add(id);
      groups.set(id, []);
    }
    for (const ref of event.bounds) {
      if (heldBounds.has(ref.caseId + '/' + ref.id)) continue;
      const key = boundKey(ref);
      const bound = boundVersions.get(key);
      const validChange = moveDestinations.has(key) ? ref.change === 'moved' : ['added','updated'].includes(ref.change);
      if (!bound || loggedBounds.has(key) || !validChange) throw Error('Invalid bound in history: ' + key);
      loggedBounds.add(key);
      const owner = bound.record.problemId;
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner).push('<li>' + humanize(ref.change) + ' · ' + objectLink(page, { ...ref, type: 'bound' }, boundTitle(bound.version)) + '</li>');
    }
    for (const [id, links] of groups) {
      const added = event.problems.includes(id);
      const summary = links.length === 1 ? '1 lower bound' : links.length + ' lower bounds';
      const details = links.length ? '<details><summary>' + summary + '</summary><ul>' + links.join('') + '</ul></details>' : '';
      if (!days.has(event.date)) days.set(event.date, []);
      days.get(event.date).push('<li><div><p class="change-context">' + (added ? 'Problem added' : 'Lower bounds changed') +
        '</p><h4>' + link(page, routes.problem(id), problems.get(id).name) + '</h4>' + details +
        '</div><div class="change-result"><p>' + escape(event.contributor) + '</p>' +
        (event.commit ? anchor(repository + '/commit/' + event.commit, 'View commit') : '') + '</div></li>');
    }
  }
  for (const record of db.cases) {
    if (options.release && !loggedProblems.has(record.problemId)) throw Error('Missing problem history: ' + record.problemId);
    for (const bound of record.bounds) {
      const key = boundKey(boundRef(record.id,bound));
      if (options.release && !loggedBounds.has(key)) throw Error('Missing bound history: ' + key);
    }
  }
  for (const challenge of db.challenges) {
    if (initial.challenges.includes(challenge.id)) continue;
    const decision = challenge.decisions.at(-1);
    const withdrawn = challenge.disposition === 'withdrawn-support';
    add(decision?.date ?? challenge.date, challenge.object, withdrawn ? 'Claim withdrawn' : humanize(challenge.disposition),
      routes.challenge(challenge.id), withdrawn ? 'Read correction' : 'Read challenge');
  }
  for (const review of db.reviews.filter(r => r.object.type === 'bound')) {
    if (initial.reviews.includes(review.id)) continue;
    add(review.date, review.object, humanize(review.type) + ' review · ' + humanize(review.verdict),
      routes.review(review.id), 'Read review');
  }
  if (!days.has(initial.date)) days.set(initial.date, []);
  days.get(initial.date).push(initialEntry);
  const format = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' });
  const sections = [...days.keys()].sort().reverse().map(date =>
    `<section class="change-day"><h3><time datetime="${escape(date)}">${escape(format.format(new Date(date)))}</time></h3>
      <ul>${days.get(date).join('')}</ul></section>`);
  return sections.join('') || paragraphs('No challenges or bound reviews recorded.');
}

function aboutPage() {
  const page = 'about/index.html';
  const sections = [['using-the-atlas','Using the atlas'], ['working-with-agents','Working with agents'], ['how-to-contribute','How to contribute'],
    ['background','Scientific background'], ['maintainer','Creation and maintenance'], ['licensing','Licensing and citation'],
    ['version-history','Version history']];
  const repoFile = (file, label) => anchor(repository + '/blob/' + (commit ?? 'main') + '/' + file, label);
  const contents = '<nav aria-label="On this page"><ul class="toc">' +
    sections.map(([id, label]) => '<li>' + anchor('#' + id, label) + '</li>').join('') + '</ul></nav>';
  catalogPage(page, 'About & guide', '', contents + `<div class="atlas-guide">
    <section id="using-the-atlas"><h2>Using the atlas</h2>
    <p>Start with a ${link(page,'index.html','problem')} and choose a parameterization. On each hypothesis card, read the excluded running time together with its input restrictions and quantifiers. Open “Full statement” for the precise claim, the original paper and, for an atlas-derived result, the proof.</p>
    <p>To find out what survives under another hypothesis, select that hypothesis and a recovery status in the problem list. Each match identifies the historical ETH bound being compared. When citing a result, cite its original paper or proof. The statement’s revision permalink identifies the exact atlas entry you consulted.</p></section>
    <section id="working-with-agents"><h2>Working with agents</h2>
    <p>Give your agent the ${link(page,api + '/atlas.json','JSON export')} to explore the current edition. To prepare a contribution, give it a clone of the ${anchor(repository,'repository')} with the ${repoFile('AGENTS.md','agent README')}.</p>
    <h3>Look up a result</h3><p>You can paste this example prompt into your agent.</p><blockquote>Find the Distinct Vectors lower bound under FPT ≠ W[1]. Give the parameter, the excluded running time, and the range of its coefficient. Identify the historical ETH bound it recovers. Link to the original paper and the atlas proof.</blockquote>
    <h3>Propose an entry</h3><p>To let your agent choose a result, use this prompt.</p><blockquote>Read AGENTS.md first. Propose one missing published lower bound for the atlas and show me the changes for review.</blockquote>
    <p>If you already have a result in mind, replace the bracketed text below.</p><blockquote>Read AGENTS.md first. Add the [hypothesis] lower bound for [problem] parameterized by [parameter], from [paper link or DOI, theorem number]. Show me the proposed changes for review.</blockquote></section>
    <section id="how-to-contribute"><h2>How to contribute</h2>
    <ol><li>Search the atlas for the problem, parameterization and hypothesis. If the bound is missing or needs a correction, identify the precise statement and its source, preferably a DOI and theorem number.</li>
    <li>Prepare the entry on a branch in your copy of the repository. External contributors can use a GitHub fork. Credit the contributor in the version history and run the atlas checks. For a new derivation, include the proof PDF and LaTeX source and obtain an independent correctness review.</li>
    <li>Open a pull request against <code>main</code>. The maintainer reviews the proposal and merges accepted changes. Entries selected for publication appear when the website is next built and published.</li></ol>
    <p>The ${repoFile('CONTRIBUTING.md','contribution guide on GitHub')} includes the commands and a worked example. To suggest an entry or report a correction without preparing an edit, ${anchor(repository + '/issues/new','open a GitHub issue')} with the statement and source.</p></section>
    <section id="background"><h2>Scientific background</h2>
    <p>Many published running-time lower bounds rely on the Exponential Time Hypothesis (ETH). In October 2026, OpenAI and Anthropic each reported a deterministic subexponential-time algorithm for 3-SAT. Either result, if correct, would refute ETH. The atlas asks which historical lower bounds can be recovered under another hypothesis. ${link(page,routes.assumption('eth'),'ETH formulations and the reported refutations','historical-status')}.</p>
    <p>Recovery is assessed for a particular running time and input class. Sometimes another hypothesis yields the full exclusion; sometimes it yields a weaker exponent or requires effective convergence. When a bound itself implies ETH, an exact recovery would also prove ETH from the alternative hypothesis. ${link(page,'assumptions/index.html','Browse the hypotheses')}.</p></section>
    <section id="maintainer"><h2>Creation and maintenance</h2>
    <p>Hendrik Molter (Hasso Plattner Institute, Potsdam) created the atlas and is currently its sole maintainer. It grew out of a research collection of published lower bounds, reductions and proof notes. ChatGPT agents assisted with source checks, proof drafting and independent reviews, and with building the database and website.</p>
    <h3 id="responsibility">Disclaimer on correctness and attribution</h3>
    <p>Hendrik Molter assumes no responsibility as maintainer for the accuracy of the atlas, including its mathematical statements, proofs, citations and attributions. He takes responsibility for a proof only when he is listed as one of its authors.</p>
    <p>Some proofs have been checked only by AI agents. On each proof page, the “Verification” section identifies the reviews on record. “Agent verified” means an AI agent checked the proof. Human review and formal verification in Lean are indicated separately when recorded. ${link(page,'reviews/index.html','Browse the review records')}.</p></section>
    <section id="licensing"><h2>Licensing and citation</h2>
    <p>The original reader software is available under the ${link(page,'assets/LICENSE-MIT.txt','MIT License')}. Original Atlas content, including database entries, Atlas-authored proofs and review notes, is available under ${anchor('https://creativecommons.org/licenses/by/4.0/','CC BY 4.0')}. The bundled STIX fonts retain their ${link(page,'assets/fonts/LICENSE-STIX.txt','SIL Open Font License')}. Cited publications retain their own terms.</p>
    <p>Please cite the original paper or proof for each mathematical result. If you found it through the Atlas, citing the Atlas as well is optional. To cite a specific entry, use the statement’s revision permalink.</p>
    <p>If you reproduce or adapt Atlas content, credit Lower Bound Atlas and any named authors or contributors, link to the source and license, and indicate any changes. ${link(page,'assets/LICENSE-CONTENT.md','Licensing and attribution notice')}.</p></section>
    <section id="version-history"><h2>Version history</h2><p>This history starts with the private launch candidate. Subsequent entries record additions, revisions, reviews, challenges and corrections. For changes to the data, proofs and website, see the ${anchor(repository + '/commits/main/', 'repository history')}.</p>
    ${versionHistory(page)}<button class="history-more" type="button" hidden></button></section><script defer src="${relativeUrl(page, 'assets/history.js')}"></script></div>`, {active:'About & guide'});
}

copy('website/style.css', 'assets/style.css');
copy('LICENSE', 'assets/LICENSE-MIT.txt');
write('assets/LICENSE-CONTENT.md', readFileSync(resolve(root, 'LICENSE.md'), 'utf8')
  .replace('(./LICENSE)', '(./LICENSE-MIT.txt)')
  .replace('(website/fonts/LICENSE-STIX.txt)', '(fonts/LICENSE-STIX.txt)'));
for (const file of ['STIXTwoMath-Regular.otf', 'STIXTwoText-Regular.otf', 'STIXTwoText-SemiBold.otf', 'LICENSE-STIX.txt']) {
  copy('website/fonts/' + file, 'assets/fonts/' + file);
}
copy('website/browse.js', 'assets/browse.js');
copy('website/history.js', 'assets/history.js');
browseIndex();
casePages();
boundPages();
function notationPage() {
  const page = 'notation/index.html';
  catalogPage(page, 'Notation', '', `
    <section><h2>Default algorithmic model</h2><p>${escape(defaultModel)} Individual bounds specify any exceptions.</p></section>
    <section class="problem-box"><h2 id="effective-little-o">Effective little-o</h2>
    ${paragraphs('An exponent h(d) is effectively sublinear in d if there is a total computable function T such that for every integer j ≥ 1 and all d ≥ T(j), we have h(d) ≤ d/j. Ordinary little-o requires such thresholds to exist. Effective little-o also requires a procedure that computes a threshold from j.')}
    ${paragraphs('In an excluded running time, 2^(o_eff(d)) allows any exponent bounded above by a computable effectively sublinear function.')}</section>
    <section><h2 id="indexed-convergence">When the exponent also depends on a parameter</h2>
    ${paragraphs('For h(d,q), one procedure computes T(q,j) from the parameter q and the accuracy index j. For every q ≥ 2 and j ≥ 1, all d ≥ T(q,j) must satisfy h(d,q) ≤ d/j. The threshold may depend on q.')}
    ${paragraphs('A computable upper envelope is a total computable function H with h(d,q) ≤ H(d,q) for every pair of arguments. In the Closest String theorem it also bounds the exponent below the convergence threshold. The exponent h itself need not be computable.')}</section>
    <section><h2>Source</h2>${anchor('https://doi.org/10.1137/070687153','Chen and Grohe, An Isomorphism Between Subexponential and Parameterized Complexity Theory')}</section>`, {active:'Notation'});
}
notationPage();
assumptionPages();
paperPages();
proofPages();
reviewPages();
challengePages();
aboutPage();
catalogPage('legal/index.html', 'Legal notice and privacy', '', `
  <section id="impressum"><h2>Impressum</h2>
    <p>Operator and data controller: Hendrik Molter · <a href="mailto:hendrik.molter@hpi.de">hendrik.molter@hpi.de</a></p></section>
  <section id="privacy"><h2>Privacy</h2>
    <p><strong>Visiting and searching.</strong> GitHub Pages hosts the Atlas and logs IP addresses for security. Searches run in your browser. Opening a shared search URL sends its terms and filters to GitHub. GitHub explains retention and international transfers in its <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">privacy statement</a>.</p>
    <p><strong>Contact and contributions.</strong> Emails are kept as needed to answer requests or meet legal obligations. GitHub issues and pull requests are public. Contributions and author credits may remain in the project history. The operator relies on legitimate interests in secure hosting, answering inquiries and preserving the research record (Article 6(1)(f) GDPR).</p>
    <p><strong>Your rights.</strong> You may contact the operator to request access, correction, erasure or restriction of processing, or to object on grounds relating to your situation. You may also complain to a supervisory authority, including the <a href="https://www.lda.brandenburg.de/">Brandenburg data protection authority</a>.</p>
  </section>`);
write(api + '/atlas.json', json(db));
removeObsoleteFiles();
write('manifest.json', json({
  generator: 'lower-bound-atlas/website',
  edition: db.edition, schemaVersion: db.schemaVersion, apiVersion: db.apiVersion,
  registryRevision: db.revision, sourceCommit: commit, preview: !options.release, releaseValidated: Boolean(options.release),
  assets: [...copies].sort(), files: [...emitted, 'manifest.json'].sort()
}));
console.log('Built ' + db.edition + ' in ' + output);
