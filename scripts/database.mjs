import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { algorithmModel } from './models.mjs';
import { boundScopeCase, problemDefinition, problemDefinitionHash } from './problems.mjs';
import { currentRecoveryBounds, recoveryComparisons } from './recovery.mjs';

const schema = JSON.parse(readFileSync(new URL('../schemas/atlas-v1.schema.json', import.meta.url), 'utf8'));
export const hypotheses = ['eth', 'sh'];
// The legacy contributor equivalence-barrier rule specifically compares ETH and SH.
const labelNames = { agent: 'Agent verified', human: 'Human verified', lean: 'Machine verified (Lean)' };
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fold = value => value.normalize('NFKC').toLowerCase().trim();

export function sourceDigest(bytes) {
  return createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
}

export class AtlasError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function json(value) {
  const stable = item => {
    if (Array.isArray(item)) return item.map(stable);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort(compareText).map(key => [key, stable(item[key])]));
    }
    return item;
  };
  return JSON.stringify(stable(value), null, 2) + '\n';
}

export function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new AtlasError('READ_ERROR', 'Cannot read JSON: ' + path, [error.message]);
  }
}

export function loadAtlas(file = 'data/atlas.json') {
  const path = resolve(file);
  const raw = readJSON(path);
  const caseDir = resolve(dirname(path), 'cases');
  const caseFiles = new Map();
  if (existsSync(caseDir)) {
    const entries = readdirSync(caseDir, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue;
      if (!entry.isFile()) throw new AtlasError('READ_ERROR', 'Case record is not a regular file: ' + entry.name);
      const path = resolve(caseDir, entry.name);
      caseFiles.set(path, readJSON(path));
    }
  }
  return { path, root: dirname(dirname(path)), raw, caseFiles };
}

function matchType(value, type) {
  switch (type) {
    case 'array': return Array.isArray(value);
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'integer': return Number.isSafeInteger(value);
    default: return typeof value === type;
  }
}

function schemaErrors(value, rule, path) {
  if (rule === false) return [path + ' is not permitted'];
  if (rule === true) return [];
  if (rule.$ref) return schemaErrors(value, schema.$defs[rule.$ref.split('/').at(-1)], path);
  if (rule.anyOf) {
    return rule.anyOf.some(sub => schemaErrors(value, sub, path).length === 0) ? [] : [path + ' has no valid reference shape'];
  }
  if (rule.type && ![rule.type].flat().some(type => matchType(value, type))) {
    return [path + ' must be ' + [rule.type].flat().join(' or ')];
  }
  if (rule.enum && !rule.enum.includes(value)) return [path + ' must be one of ' + rule.enum.join(', ')];
  if ('const' in rule && rule.const !== value) return [path + ' must equal ' + rule.const];
  if (rule.minimum && value < rule.minimum) return [path + ' is below minimum'];
  if (rule.minLength && value.trim().length < rule.minLength) return [path + ' must be nonempty'];
  if (rule.pattern && !new RegExp(rule.pattern).test(value)) return [path + ' has invalid format'];
  if (rule.items) {
    if (rule.minItems && value.length < rule.minItems) return [path + ' must be nonempty'];
    return value.flatMap((item, index) => schemaErrors(item, rule.items, path + '[' + index + ']'));
  }
  const missing = (rule.required ?? []).filter(key => !Object.hasOwn(value, key)).map(key => path + '.' + key + ' is required');
  const invalid = Object.entries(rule.properties ?? {}).flatMap(([key, sub]) =>
    Object.hasOwn(value, key) ? schemaErrors(value[key], sub, path + '.' + key) : []);
  const additional = rule.additionalProperties !== undefined
    ? Object.entries(value).filter(([key]) => !Object.hasOwn(rule.properties ?? {}, key))
      .flatMap(([key, entry]) => rule.additionalProperties === false
        ? [path + '.' + key + ' is not permitted']
        : schemaErrors(entry, rule.additionalProperties, path + '.' + key))
    : [];
  return [...missing, ...invalid, ...additional];
}

function collect(load) {
  const errors = schemaErrors(load.raw, schema, 'registry');
  for (const [path, record] of load.caseFiles) {
    errors.push(...schemaErrors(record, schema.$defs.case, path));
    if (path.split(sep).at(-1) !== record?.id + '.json') errors.push('Case filename must match the case ID: ' + path);
  }
  if (errors.length) throw new AtlasError('INVALID_SCHEMA', 'Atlas records do not match schema v1', errors);
  const db = structuredClone({ ...load.raw, cases: [...(load.raw.cases ?? []), ...load.caseFiles.values()] });
  for (const kind of ['proofs', 'reviews', 'challenges']) {
    db[kind].push(...db.cases.flatMap(record => record[kind] ?? []));
    for (const record of db.cases) delete record[kind];
  }
  return db;
}

function ordered(records) {
  return [...records].sort((a, b) => compareText(a.id, b.id));
}

function objectKey(ref) {
  return ref.type === 'proof'
    ? ['proof', ref.id, ref.revision, ref.theorem].join('/')
    : ['bound', ref.caseId, ref.id, ref.revision].join('/');
}

function proofRef(link) {
  return { type: 'proof', id: link.proofId, revision: link.revision, theorem: link.theorem };
}

function findVersion(record, revision) {
  if (record?.revision === revision) return record;
  return record?.history?.find(version => version.revision === revision);
}

export function paperUrl(edition) {
  return edition.doi ? 'https://doi.org/' + edition.doi : edition.primaryUrl ?? edition.openUrl;
}

function index(records, context, fail, key = item => item.id) {
  const map = new Map();
  for (const record of records) {
    if (map.has(key(record))) fail(context + ': identity collision for ' + key(record));
    map.set(key(record), record);
  }
  return map;
}

function aliases(records, context, fail) {
  const map = new Map();
  for (const record of records) {
    for (const value of [record.id, ...record.aliases]) {
      const key = fold(value);
      if (map.has(key) && map.get(key) !== record.id) fail(context + ': alias collision for ' + value);
      map.set(key, record.id);
    }
  }
  return map;
}

function urlOk(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function pathOk(value) {
  return !isAbsolute(value) && !/[:\\?#]/.test(value) && value.split('/').every(part => part && part !== '..' && part !== '.');
}

function checkHistory(record, context, fail) {
  const versions = index(record.history ?? [], context + ' history', fail, item => item.revision);
  for (const historical of versions.values()) {
    if (historical.id !== record.id || historical.revision >= record.revision || historical.history?.length) {
      fail(context + ': history must contain earlier flat snapshots of the same ID');
    }
  }
}

function normalizedSourceUrl(value) {
  if (!urlOk(value)) return undefined;
  const url = new URL(value);
  url.hash = '';
  return url.hostname === 'doi.org' ? url.href.toLowerCase() : url.href;
}

function editionSourceUrls(edition) {
  return new Set([paperUrl(edition), edition.primaryUrl, edition.openUrl]
    .map(normalizedSourceUrl).filter(Boolean));
}

function citedPaperIds({ papers, assumptions, formulations, cases }) {
  const ids = new Set();
  const addCitation = ref => {
    if (ref?.paperId) ids.add(ref.paperId);
  };
  for (const record of cases) {
    for (const version of [record, ...(record.history ?? [])]) {
      for (const bound of version.bounds) {
        for (const snapshot of [bound, ...(bound.history ?? [])]) {
          snapshot.sources.forEach(addCitation);
          for (const { forward, converse } of Object.values(snapshot.assessments ?? {})) {
            for (const evidence of [...forward.evidence, ...converse.evidence]) addCitation(evidence.source);
          }
        }
      }
      for (const resolution of version.resolutions) resolution.evidence.forEach(addCitation);
      for (const recovery of version.recoveryAssessments ?? []) recovery.evidence.forEach(addCitation);
    }
  }

  // Some shared hypothesis sources are stored as URLs instead of edition pins.
  const sourceUrls = new Set();
  const addUrl = value => {
    const url = normalizedSourceUrl(value);
    if (url) sourceUrls.add(url);
  };
  for (const assumption of assumptions) {
    for (const version of [assumption, ...(assumption.history ?? [])]) {
      addCitation(version.source);
      addUrl(version.refutation);
    }
  }
  for (const formulation of formulations ?? []) {
    for (const version of [formulation, ...(formulation.history ?? [])]) {
      addUrl(version.reference);
      addUrl(version.refutation);
      for (const link of version.equivalences ?? []) {
        addUrl(link.source);
        addUrl(link.reverseSource);
        for (const source of link.additionalForwardSources ?? []) addUrl(source.source);
      }
    }
  }
  for (const paper of papers) {
    if (ids.has(paper.id)) continue;
    if (paper.editions.some(edition => [...editionSourceUrls(edition)].some(url => sourceUrls.has(url)))) ids.add(paper.id);
  }
  return ids;
}

// Select the edition before checking its references or generating any backlinks and assets.
function selectRelease(db) {
  const heldProofs = new Set();
  const visibleProofs = new Set();
  function collectProofRefs(value, refs) {
    if (!value || typeof value !== 'object') return;
    if (value.proofId) refs.add(value.proofId);
    if (value.type === 'proof' && value.id) refs.add(value.id);
    for (const child of Object.values(value)) collectProofRefs(child, refs);
  }
  const excludedBounds = new Set();
  for (const record of db.cases) {
    const versions = [record, ...(record.history ?? [])];
    const held = new Set(record.bounds.filter(b => b.includeInRelease === false).map(b => b.id));
    for (const id of held) excludedBounds.add(record.id + '/' + id);
    for (const version of versions) {
      for (const b of version.bounds) collectProofRefs(b, held.has(b.id) ? heldProofs : visibleProofs);
      for (const r of version.resolutions) collectProofRefs(r, r.includeInRelease === false ? heldProofs : visibleProofs);
      version.bounds = version.bounds.filter(b => !held.has(b.id));
      collectProofRefs(version.recoveryAssessments?.filter(a => !held.has(a.target.id) && !held.has(a.recovery.id)), visibleProofs);
      if (version.recoveryAssessments) version.recoveryAssessments = version.recoveryAssessments.filter(a =>
        !held.has(a.target.id) && !held.has(a.recovery.id));
      if (version.recoveryDispositions) version.recoveryDispositions = version.recoveryDispositions.filter(a =>
        !held.has(a.target.id) && !held.has(a.recovery.id));
      version.resolutions = version.resolutions.filter(r => r.includeInRelease !== false);
    }
  }
  const proofRecords = new Map(db.proofs.map(p => [p.id, p]));
  // Retain dependencies of shared proofs, including proofs referenced only by another theorem.
  for (const id of heldProofs) collectProofRefs(proofRecords.get(id), heldProofs);
  for (const id of proofRecords.keys()) if (!heldProofs.has(id)) visibleProofs.add(id);
  for (const id of visibleProofs) collectProofRefs(proofRecords.get(id), visibleProofs);
  const excludedProofs = new Set([...heldProofs].filter(id => !visibleProofs.has(id)));
  const includesTarget = ({type, id, caseId}) => type === 'proof'
    ? !excludedProofs.has(id) : !excludedBounds.has(caseId + '/' + id);
  db.proofs = db.proofs.filter(p => !excludedProofs.has(p.id));
  db.reviews = db.reviews.filter(r => includesTarget(r.object));
  db.challenges = db.challenges.filter(c => includesTarget(c.object));
  if (db.boundMoves) db.boundMoves = db.boundMoves.filter(move => includesTarget(move.from) && includesTarget(move.to));
  for (const formulation of db.formulations ?? []) {
    if (formulation.equivalences) formulation.equivalences = formulation.equivalences.filter(
      e => !excludedBounds.has(e.caseId + '/' + e.boundId));
  }
}

export function validateAtlas(load, { release = false, website = false } = {}) {
  const db = collect(load);
  const errors = [];
  const fail = message => errors.push(message);
  const cited = citedPaperIds(db);
  for (const paper of db.papers) {
    if (!cited.has(paper.id)) fail(paper.id + ': registered paper has no recorded citation');
  }
  const selectedRelease = release || website;
  if (selectedRelease) selectRelease(db);
  function checkSourceBasis(basis, hasSource, context) {
    if (basis === undefined) return;
    if (!hasSource || !basis || !['stated','derived'].includes(basis.kind) ||
        Object.keys(basis).some(key => !['kind','step'].includes(key)) ||
        (basis.kind === 'derived' ? typeof basis.step !== 'string' || !basis.step.trim() : basis.step !== undefined)) {
      fail(context + ': a derived implication needs a cited source and a derivation step; a stated implication has no note');
    }
  }
  const assumptions = index(db.assumptions, 'assumptions', fail);
  const cases = index(db.cases, 'cases', fail);
  const problems = index(db.problems ?? [], 'problems', fail);
  const restrictionParents = new Map([...problems.values()].map(p => [p.id, (p.restrictionOf ?? []).map(r => r.problemId)]));
  for (const problem of problems.values()) {
    if (hasCycle(problem.id, restrictionParents)) fail(problem.id + ': circular problem restriction');
    const parents = new Set();
    for (const relation of problem.restrictionOf ?? []) {
      if (!problems.has(relation.problemId) || relation.problemId === problem.id || parents.has(relation.problemId)) {
        fail(problem.id + ': expected a distinct registered parent problem for each restriction');
      }
      parents.add(relation.problemId);
    }
    checkHistory(problem, 'problem ' + problem.id, fail);
    if (problem.history?.length && (!problem.revision || problem.history.some(p => !p.revision))) {
      fail(problem.id + ': historical problem definitions need explicit revisions');
    }
  }
  const releaseIds = db.releaseHypotheses ?? schema.properties.releaseHypotheses.default.filter(id => assumptions.has(id));
  const launchAssumptions = new Set(releaseIds);
  if (launchAssumptions.size !== releaseIds.length || releaseIds.some(id => !assumptions.has(id))) {
    fail('Release hypotheses must be distinct registered hypothesis IDs');
  }
  const formulations = index(db.formulations ?? [], 'formulations', fail);
  const assessmentTargets = new Map([...assumptions, ...formulations]);
  for (const form of formulations.values()) {
    if (assumptions.has(form.id)) fail('Assessment target ID collision: ' + form.id);
    checkHistory(form, 'formulation ' + form.id, fail);
    for (const f of [form, ...(form.history ?? [])]) {
      f.equivalences ??= [];
      if (!findVersion(assumptions.get(f.hypothesisId), f.hypothesisRevision) ||
          !urlOk(f.reference) || (f.refutation !== undefined && !urlOk(f.refutation))) fail('Invalid hypothesis formulation: ' + f.id);
      for (const e of f.equivalences) {
        checkSourceBasis(e.forwardBasis, e.source, f.id + ' forward');
        checkSourceBasis(e.reverseBasis, e.reverseSource ?? e.source, f.id + ' converse');
        const target = cases.get(e.caseId)?.bounds.find(b => b.id === e.boundId);
        if (e.additionalForwardSources?.some(ref => !urlOk(ref.source) || !ref.locator)) fail('Invalid additional forward reference: ' + e.boundId);
        if (!findVersion(target, e.boundRevision) || !urlOk(e.source) ||
            (e.reverseSource !== undefined && (!urlOk(e.reverseSource) || !e.reverseLocator))) fail('Invalid formulation equivalence: ' + e.boundId);
      }
    }
  }
  const papers = index(db.papers, 'papers', fail);
  const proofs = index(db.proofs, 'proofs', fail);
  const reviews = index(db.reviews, 'reviews', fail);
  index(db.challenges, 'challenges', fail);
  aliases(db.assumptions, 'assumptions', fail);
  aliases(db.cases, 'cases', fail);

  const localEvidence = (value, context, { local = false } = {}) => {
    if (!local && urlOk(value)) return undefined;
    if (!pathOk(value)) {
      fail(context + ': unsafe evidence path ' + value);
      return undefined;
    }
    try {
      const target = realpathSync(resolve(load.root, value));
      const inside = relative(realpathSync(load.root), target);
      if (!inside || inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) {
        fail(context + ': evidence escapes the edition directory');
        return undefined;
      }
      const bytes = readFileSync(target);
      if (bytes.length === 0) fail(context + ': evidence is empty');
      return bytes;
    } catch {
      fail(context + ': evidence file not found or unreadable: ' + value);
      return undefined;
    }
  };

  const citation = (ref, context, current) => {
    const paper = papers.get(ref.paperId);
    const version = paper?.editions.find(entry => entry.id === ref.editionId);
    if (!version) fail(context + ': unknown paper edition ' + ref.paperId + '/' + ref.editionId);
    else if (release && !paperUrl(version)) fail(context + ': cited edition lacks an original source link');
    if (version && current && version.id !== paper.preferredEditionId && !ref.editionReason?.trim()) {
      fail(context + ': explain why this claim needs the nonpreferred edition ' + ref.paperId + '/' + version.id);
    }
    return version;
  };

  const getProof = (id, revision) => proofs.get(id)?.revisions.find(entry => entry.revision === revision);
  const getBound = (caseId, id, revision) => {
    const entry = cases.get(caseId);
    if (!entry) return undefined;
    for (const version of [entry, ...(entry.history ?? [])]) {
      const bound = findVersion(version.bounds.find(bound => bound.id === id), revision);
      if (bound) return bound;
    }
  };
  const lookup = ref => {
    if (ref.type === 'bound' && ref.caseId && !ref.theorem) return getBound(ref.caseId, ref.id, ref.revision);
    if (ref.type === 'proof' && !ref.caseId && ref.theorem) {
      return getProof(ref.id, ref.revision)?.theorems.find(item => item.label === ref.theorem);
    }
    return undefined;
  };
  const objectLink = (ref, context) => {
    const found = lookup(ref);
    if (!found) fail(context + ': unknown or malformed target ' + objectKey(ref));
    return found;
  };
  const isCurrent = ref => {
    if (ref.type === 'proof') return currentRevision(proofs.get(ref.id)?.revisions) === ref.revision;
    return cases.get(ref.caseId)?.bounds.find(item => item.id === ref.id)?.revision === ref.revision;
  };
  const moveSources = new Set();
  for (const { from, to } of db.boundMoves ?? []) {
    const key = from.caseId + '/' + from.id;
    if (from.type !== 'bound' || to.type !== 'bound' || from.caseId === to.caseId ||
        !lookup(from) || !lookup(to) || cases.get(from.caseId)?.bounds.some(bound => bound.id === from.id) ||
        !cases.get(to.caseId)?.bounds.some(bound => bound.id === to.id) || moveSources.has(key)) {
      fail(key + ': a bound move needs a distinct archived source and a destination with a current bound');
    }
    moveSources.add(key);
  }
  const defects = new Set();
  const dependencies = new Map();
  const sourceDigests = new Map();
  const activeProofs = new Set();
  const hashMatches = review => review.object.type === 'bound' ||
    Boolean(review.sourceSha256 && sourceDigests.get(review.object.id + '@' + review.object.revision) === review.sourceSha256);
  const freshReview = review => review?.verdict === 'verified' && hashMatches(review) &&
    (review.object.type === 'bound' || review.independent === true);

  const doiOwners = new Map();
  for (const paper of papers.values()) {
    const editions = index(paper.editions, paper.id + ' editions', fail);
    const preferred = editions.get(paper.preferredEditionId);
    if (!preferred) fail(paper.id + ': unknown preferred edition ' + paper.preferredEditionId);
    else {
      const hasEdition = kind => paper.editions.some(edition => edition.kind === kind);
      const unpublished = ['manuscript', 'preprint'].includes(preferred.kind);
      if ((unpublished || preferred.kind === 'proceedings') && hasEdition('journal')) {
        fail(paper.id + ': prefer a registered journal edition');
      } else if (unpublished && hasEdition('proceedings')) {
        fail(paper.id + ': prefer a registered proceedings edition');
      } else if (unpublished && hasEdition('book')) {
        fail(paper.id + ': prefer the latest registered book edition');
      } else if (preferred.kind === 'book' && paper.editions.some(edition =>
        edition.kind === 'book' && edition.editionNumber > preferred.editionNumber)) {
        fail(paper.id + ': prefer the latest registered book edition');
      }
    }
    for (const edition of paper.editions) {
      const context = paper.id + '/' + edition.id;
      if (edition.kind === 'book' && edition.editionNumber === undefined) fail(context + ': book edition requires an editionNumber');
      if (edition.kind !== 'book' && edition.editionNumber !== undefined) fail(context + ': editionNumber is reserved for books');
      if (edition.doi) {
        const doi = edition.doi.toLowerCase();
        if (!/^10\.\d{4,9}\/[^\s?#]+$/.test(doi)) fail(context + ': expected a DOI identifier');
        if (doiOwners.has(doi)) fail(context + ': DOI identity collision with ' + doiOwners.get(doi));
        doiOwners.set(doi, context);
      }
      for (const field of ['primaryUrl', 'openUrl']) {
        if (edition[field] && !urlOk(edition[field])) fail(context + ': ' + field + ' must be an HTTPS URL');
      }
      if (!paperUrl(edition) && !edition.access) fail(context + ': edition lacks a source URL or an access note');
    }
  }
  for (const assumption of assumptions.values()) {
    checkHistory(assumption, 'assumption ' + assumption.id, fail);
    for (const version of [assumption, ...(assumption.history ?? [])]) {
      if (version.refutation && !urlOk(version.refutation)) fail('Invalid refutation URL for ' + assumption.id);
      if (version.source) citation(version.source, 'assumption ' + assumption.id, version === assumption);
      else if (!version.access) fail('assumption ' + assumption.id + ': needs a defining citation or access note');
    }
  }
  for (const proof of proofs.values()) {
    index(proof.revisions, proof.id + ' revisions', fail, item => item.revision);
    for (const version of proof.revisions) {
      const context = proof.id + '@' + version.revision;
      const credit = version.authorship;
      if (credit && !credit.authors?.length && !(credit.origin === 'atlas' && credit.kind === 'ai')) {
        fail(context + ': supply the manuscript author credits');
      }
      const source = localEvidence(version.source, context + ' source', { local: true });
      if (source) sourceDigests.set(context, sourceDigest(source));
      const pdf = version.pdf ? localEvidence(version.pdf, context + ' PDF', { local: true })?.toString('latin1') : undefined;
      if (pdf && (!pdf.startsWith('%PDF-') || !pdf.trimEnd().endsWith('%%EOF'))) fail(context + ': invalid PDF artifact');
      index(version.theorems, context + ' theorem labels', fail, item => item.label);
      for (const theorem of version.theorems) {
        const ref = { type: 'proof', id: proof.id, revision: version.revision, theorem: theorem.label };
        dependencies.set(objectKey(ref), (theorem.dependencies ?? version.dependencies ?? []).map(objectKey));
        if (theorem.destination && !/^(?:page=[1-9]\d*|[A-Za-z0-9_.:-]+)$/.test(theorem.destination)) {
          fail(context + ': malformed PDF destination for ' + theorem.label);
        }
      }
      for (const ref of [...(version.dependencies ?? []), ...version.theorems.flatMap(item => item.dependencies ?? [])]) {
        const refErrors = schemaErrors(ref, schema.$defs.objectLink, context + ' dependency');
        if (refErrors.length) errors.push(...refErrors);
        else objectLink(ref, context + ' dependency');
      }
    }
  }
  for (const review of reviews.values()) {
    const context = 'review ' + review.id;
    objectLink(review.object, context);
    const evidence = localEvidence(review.evidence, context);
    if (evidence && !evidence.toString('utf8').trim()) fail(context + ': review report is blank');
    if (/^(\*|all|yes|verified|ok)$/i.test(review.scope.trim())) fail(context + ': review must describe its specific scope');
    if (review.type === 'lean' && !review.lean) fail(context + ': Lean build evidence is required');
    if (!review.lean) continue;
    if (review.type !== 'lean' || review.object.type !== 'proof') fail(context + ': Lean reviews must target a proof statement');
    if (!/^[0-9a-f]{40}$/i.test(review.lean.commit) || review.lean.axioms.some(name => /(^|\.)sorryAx$/.test(name))) {
      fail(context + ': Lean evidence must specify a full commit and contain no sorryAx');
    }
    localEvidence(review.lean.buildEvidence, context + ' build');
    const correspondence = reviews.get(review.lean.correspondenceReviewId);
    if (!correspondence || correspondence.type === 'lean' || !freshReview(correspondence) ||
        objectKey(correspondence.object) !== objectKey(review.object)) {
      fail(context + ': missing verified prose-to-Lean correspondence review for the same theorem revision');
    }
    if (release && freshReview(review)) fail(context + ': reproducible Lean execution is required for release');
  }
  for (const challenge of db.challenges) {
    const context = 'challenge ' + challenge.id;
    const challenged = objectLink(challenge.object, context);
    localEvidence(challenge.evidence, context);
    for (const decision of challenge.decisions) localEvidence(decision.evidence, context + ' decision');
    for (const correction of challenge.corrections ?? []) objectLink(correction, context + ' correction');
    if (challenge.disposition !== 'open' && challenge.decisions.length === 0) fail(context + ': disposition requires a reviewed decision');
    if (challenge.disposition === 'proof-gap' && challenge.object.type !== 'proof') fail(context + ': proof gap must target a proof theorem');
    if (challenge.disposition === 'withdrawn-support' && (challenge.object.type !== 'bound' || challenged?.status !== 'withdrawn')) {
      fail(context + ': withdrawn-support must target an exact withdrawn bound revision');
    }
    if (challenge.disposition === 'refuted' && challenge.object.type !== 'bound') fail(context + ': refutation must target a bound');
    if (['proof-gap', 'refuted'].includes(challenge.disposition)) defects.add(objectKey(challenge.object));
  }

  for (const record of cases.values()) {
    checkHistory(record, 'case ' + record.id, fail);
    const versions = [record, ...(record.history ?? [])].sort((a, b) => b.revision - a.revision);
    const statementVersions = new Map();
    const contexts = new Map();
    for (const version of versions) {
      const problem = problems.get(version.problemId);
      if (version.reader?.comments !== undefined) fail(record.id + ': general reader comments are not allowed');
      if (!problem && ((db.problems && version === record) || version.problemId !== undefined)) {
        fail(record.id + ': expected a registered problemId');
      }
      const definition = problemDefinition(problem, version.problemRevision);
      if (problem?.revision && version === record &&
          (version.model !== undefined || version.restrictions !== undefined ||
          ['name', 'input', 'question'].some(field => version.reader?.[field] !== undefined))) {
        fail(record.id + ': use the registered problem definition, structured input conditions and shared model');
      }
      if (problem?.revision !== undefined || version.problemRevision !== undefined || version.problemDefinitionHash !== undefined) {
        if (!version.problemRevision || !definition || version.problemDefinitionHash !== problemDefinitionHash(definition)) {
          fail(record.id + ': expected a valid problem revision and matching problemDefinitionHash');
        }
      }
      const conditions = index(version.inputConditions ?? [], record.id + ' input conditions', fail);
      const definitions = new Map();
      for (const entry of [...(version.reader?.parameterSymbols ?? []), ...(version.reader?.symbols ?? [])]) {
        if (definitions.has(entry.symbol)) fail(record.id + ': duplicate symbol definition ' + entry.symbol);
        definitions.set(entry.symbol, entry.meaning);
      }
      const problemScope = [
        definition?.input ?? version.reader?.input ?? version.encoding,
        definition?.question ?? version.reader?.question ?? version.task,
        version.reader?.additionalInput ?? '', version.parameter
      ];
      contexts.set(version, {conditions, definitions, problemScope});
    }
    for (const version of versions) {
      index(version.bounds, record.id + ' bounds', fail);
      index(version.resolutions, record.id + ' resolutions', fail, item => item.assumptionId);
      for (const bound of version.bounds) {
        const context = record.id + '/' + bound.id;
        checkHistory(bound, context, fail);
        for (const snapshot of [bound, ...(bound.history ?? [])]) {
          const owner = boundScopeCase(versions, version, bound, snapshot);
          const {conditions, definitions, problemScope} = contexts.get(owner);
          const selected = snapshot.inputConditions;
          if (new Set(selected).size !== selected.length || selected.some(id => conditions.get(id)?.level !== 'bound')) {
            fail(context + ': select distinct bound-level input conditions from the problem registry');
          }
          if (snapshot.reader?.rowTitle) fail(context + ': use shared input conditions instead of a custom row title');
          if (snapshot.hardnessBaseline && (snapshot.assumptions.length !== 1 ||
              snapshot.assumptions[0].id !== 'w1' || !snapshot.sources.length)) {
            fail(context + ': a hardness baseline requires the FPT ≠ W[1] hypothesis and a cited hardness result');
          }
          const hasRuntimeFields = snapshot.qualifications !== undefined || snapshot.runtimeSymbols !== undefined;
          if (snapshot.reader?.explanation !== undefined) fail(context + ': general reader explanations are not allowed');
          checkSourceBasis(snapshot.sourceBasis, snapshot.sources.some(s => !s.placement || ['statement','forward'].includes(s.placement)), context);
          if (version.problemRevision && version === record && snapshot === bound &&
              (snapshot.model !== undefined || snapshot.restrictions !== undefined)) {
            fail(context + ': use structured input conditions and modelException for a nonstandard model');
          }
          if (!hasRuntimeFields && db.problems && version === record && snapshot === bound) {
            fail(context + ': current bounds require qualifications and runtimeSymbols');
          }
          if (hasRuntimeFields) {
            if (version === record && snapshot === bound) {
              const effective = snapshot.runtime.includes('o_eff(');
              if (effective !== (snapshot.exponentDomain !== undefined) ||
                  (effective && !['nonnegative','computable-integer','upper-bounded-integer'].includes(snapshot.exponentDomain))) {
                fail(context + ': use o_eff with a registered exponentDomain');
              }
              if (effective && (snapshot.reader?.notation === 'effective-little-o' ||
                  (snapshot.qualifications ?? []).some(q => /convergence|computable (?:cutoff|threshold|modulus)|effectively sublinear/i.test(q)))) {
                fail(context + ': use the shared effective little-o definition');
              }
            }
            if (!Array.isArray(snapshot.qualifications) || !Array.isArray(snapshot.runtimeSymbols)) {
              fail(context + ': supply both qualifications and runtimeSymbols');
            }
            if (['runtime', 'scope', 'statement'].some(field => snapshot.reader?.[field] !== undefined)) {
              fail(context + ': specify the formula and qualifications once on the bound');
            }
            const refs = snapshot.runtimeSymbols ?? [];
            if (new Set(refs).size !== refs.length || refs.some(symbol => !definitions.has(symbol))) {
              fail(context + ': runtimeSymbols must select distinct registered symbol definitions');
            }
          }
          const ref = { type: 'bound', caseId: record.id, id: snapshot.id, revision: snapshot.revision };
          for (const part of snapshot.reader?.historicalNote ?? []) {
            if (typeof part === 'string') continue;
            if (part.url ? !urlOk(part.url) : !part.path || !pathOk(part.path)) fail(context + ': invalid historical reference');
          }
          if (snapshot.modelException && snapshot.model !== undefined) fail(context + ': use only one algorithm model representation');
          const exactFields = ['statement', 'runtime', 'inputFactor', 'assumptions', 'assumptionOperator'];
          const scope = owner.inputConditions.filter(c => c.level === 'problem' || selected.includes(c.id))
            .map(c => [c.id, c.condition]).sort(([a], [b]) => a.localeCompare(b));
          const runtimeScope = [snapshot.exponentDomain, snapshot.qualifications ?? [],
            (snapshot.runtimeSymbols ?? []).map(symbol => [symbol, definitions.get(symbol)])];
          const statementVersion = json([...exactFields.map(field => snapshot[field]), problemScope, runtimeScope, algorithmModel(snapshot), scope]);
          if (statementVersions.has(objectKey(ref)) && statementVersions.get(objectKey(ref)) !== statementVersion) {
            fail(context + ': theorem statement changed without changing its revision');
          }
          statementVersions.set(objectKey(ref), statementVersion);
          if (['withdrawn', 'invalidated'].includes(snapshot.status)) defects.add(objectKey(ref));
          index(snapshot.assumptions, context + ' premises', fail);
          if (release && snapshot.assumptions.some(item => !launchAssumptions.has(item.id))) {
            fail(context + ': contains a premise outside this edition’s release hypotheses');
          }
          if (release && version === record && snapshot === bound && snapshot.status === 'proposed') {
            fail(context + ': a proposed bound cannot be included in the release edition');
          }
          for (const premise of snapshot.assumptions) {
            if (!findVersion(assumptions.get(premise.id), premise.revision)) fail(context + ': missing assumption revision ' + premise.id);
          }
          for (const source of snapshot.sources) citation(source, context, version === record && snapshot === bound);
          for (const link of snapshot.proofs) {
            const target = proofRef(link);
            objectLink(target, context);
            if (version === record && snapshot === bound && ['established', 'conditional'].includes(bound.status)) {
              activeProofs.add(objectKey(target));
            }
          }
          if (snapshot.status === 'established' && snapshot.provenance === 'literature' && snapshot.sources.length === 0) {
            fail(context + ': established literature bound needs an edition and theorem locator');
          }
          if (snapshot.status === 'established' && snapshot.provenance === 'atlas' && snapshot.proofs.length === 0) {
            fail(context + ': established atlas bound needs a proof theorem');
          }
          for (const [hypothesis, assessment] of Object.entries(snapshot.assessments ?? {})) {
            if (!findVersion(assessmentTargets.get(hypothesis), assessment.hypothesisRevision)) {
              fail(context + ': missing assessed ' + hypothesis + ' convention revision');
            }
            for (const direction of [assessment.forward, assessment.converse]) {
              checkSourceBasis(direction.sourceBasis, direction.evidence.some(e => e.source), context);
              if (['established', 'disproved'].includes(direction.status) && direction.evidence.length === 0) {
                fail(context + ': directional verdict needs evidence');
              }
              for (const evidence of direction.evidence) {
                if (!getBound(record.id, snapshot.id, evidence.boundRevision)) fail(context + ': unknown reviewed bound revision');
                if (!findVersion(assessmentTargets.get(hypothesis), evidence.hypothesisRevision ?? 1)) {
                  fail(context + ': unknown reviewed ' + hypothesis + ' convention revision');
                }
                if (!evidence.source && !evidence.proof) fail(context + ': directional evidence must cite a paper theorem or proof');
                if (evidence.source) citation(evidence.source, context + ' assessment', version === record && snapshot === bound);
                if (evidence.proof) objectLink(proofRef(evidence.proof), context + ' assessment');
                const review = reviews.get(evidence.reviewId);
                const reviewedBound = { ...ref, revision: evidence.boundRevision };
                const targets = [reviewedBound, ...(evidence.proof ? [proofRef(evidence.proof)] : [])];
                if (!review || review.verdict !== 'verified' || !targets.some(target => objectKey(target) === objectKey(review.object))) {
                  fail(context + ': directional evidence requires a verified review of the bound revision or cited proof');
                }
              }
            }
          }
        }
      }
    }
  }

  // A theorem may depend on a bound with several independent supports.
  // A confirmed gap in one of them propagates only when every support fails.
  const usable = (ref, seen = new Set()) => {
    const key = objectKey(ref);
    if (defects.has(key) || seen.has(key) || !lookup(ref)) return false;
    const next = new Set([...seen, key]);
    if (ref.type === 'proof') return (dependencies.get(key) ?? []).every(id => usable(linkFromKey(id), next));
    const bound = lookup(ref);
    if (bound.status !== 'established') return false;
    return bound.provenance === 'literature' || bound.proofs.some(link => usable(proofRef(link), next));
  };

  for (const proof of proofs.values()) {
    for (const version of proof.revisions) {
      for (const theorem of version.theorems) {
        const ref = { type: 'proof', id: proof.id, revision: version.revision, theorem: theorem.label };
        const key = objectKey(ref);
        if (release && version.authorship?.origin === 'atlas' && version.authorship.kind === 'human' && ![...reviews.values()].some(review => review.type === 'human' && freshReview(review) && objectKey(review.object) === key)) {
          fail(key + ': named human authors require a human verification of this theorem and source revision');
        }
        if (hasCycle(key, dependencies)) fail(proof.id + ': cyclic proof dependency');
        const current = version.revision === currentRevision(proof.revisions);
        if (!release || defects.has(key) || (!current && !activeProofs.has(key))) continue;
        if (!version.pdf || !theorem.destination) fail(key + ': current proof theorem lacks a PDF and direct destination');
        if (![...reviews.values()].some(review => review.type !== 'lean' && freshReview(review) && objectKey(review.object) === key)) {
          fail(key + ': theorem lacks an independent review with a matching source digest');
        }
      }
    }
  }

  const assessmentState = (bound, caseId, hypothesis) => {
    const assessment = bound.assessments?.[hypothesis];
    if (!assessment) return { forward: 'unassessed', converse: 'unassessed', verdict: 'unassessed' };
    const convention = assessmentTargets.get(hypothesis);
    const staleConvention = convention?.revision !== assessment.hypothesisRevision ||
      (convention?.hypothesisId && assumptions.get(convention.hypothesisId)?.revision !== convention.hypothesisRevision);
    const boundRef = { type: 'bound', id: bound.id, caseId, revision: bound.revision };
    const status = direction => {
      if (!['established', 'disproved'].includes(direction.status)) return direction.status;
      if (staleConvention || !usable(boundRef) || !direction.evidence.some(evidence =>
        evidence.boundRevision === bound.revision && (evidence.hypothesisRevision ?? 1) === assessment.hypothesisRevision &&
        freshReview(reviews.get(evidence.reviewId)) &&
        (!evidence.proof || usable(proofRef(evidence.proof))))) return 'stale';
      return direction.status;
    };
    const forward = status(assessment.forward);
    const converse = status(assessment.converse);
    let verdict = 'unknown';
    if (forward === 'stale' || converse === 'stale') verdict = 'needs-reassessment';
    else if (forward === 'disproved' || converse === 'disproved') verdict = 'proved-non-equivalent';
    else if (forward === 'established' && converse === 'established') verdict = 'established-equivalent';
    else if (forward === 'established') verdict = 'hypothesis-implies-bound';
    else if (converse === 'established') verdict = 'bound-implies-hypothesis';
    else if (forward === 'unassessed' && converse === 'unassessed') verdict = 'unassessed';
    return { forward, converse, verdict };
  };

  const recoveryKey = ({target, hypothesis, recovery}) => json([
    target.id, target.revision, hypothesis.id, hypothesis.revision, recovery.id, recovery.revision
  ]);
  for (const record of cases.values()) {
    for (const version of [record, ...(record.history ?? [])]) {
      const checked = new Set();
      const credited = new Set();
      for (const a of version.recoveryAssessments ?? []) {
        const context = record.id + ' recovery of ' + a.target.id;
        const target = getBound(record.id, a.target.id, a.target.revision);
        const recovery = getBound(record.id, a.recovery.id, a.recovery.revision);
        if (target?.assumptions.length !== 1 || target.assumptions[0].id !== 'eth') fail(context + ': expected an ETH target');
        if (a.hypothesis.id === 'eth' || !findVersion(assumptions.get(a.hypothesis.id), a.hypothesis.revision) ||
            recovery?.assumptions.length !== 1 || recovery.assumptions[0].id !== a.hypothesis.id ||
            recovery.assumptions[0].revision !== a.hypothesis.revision) fail(context + ': recovery premise mismatch');
        const key = json([a.target,a.hypothesis,a.recovery,a.scale,a.effective]);
        if (checked.has(key) || !a.evidence.length) fail(context + ': duplicate assessment or missing evidence');
        checked.add(key);
        credited.add(recoveryKey(a));
        for (const ref of a.evidence) {
          if (ref.proofId) {
            objectLink(proofRef(ref),context);
            if (release && !usable(proofRef(ref))) fail(context + ': unsupported proof');
          } else citation(ref, context, version === record);
        }
      }
      const declined = new Set();
      for (const disposition of version.recoveryDispositions ?? []) {
        const { target, hypothesis, recovery } = disposition;
        const context = record.id + ' recovery disposition for ' + target.id + ' and ' + recovery.id;
        const targetBound = getBound(record.id, target.id, target.revision);
        const alternativeBound = getBound(record.id, recovery.id, recovery.revision);
        if (targetBound?.assumptions.length !== 1 || targetBound.assumptions[0].id !== 'eth') {
          fail(context + ': expected an ETH target');
        }
        if (hypothesis.id === 'eth' || !findVersion(assumptions.get(hypothesis.id), hypothesis.revision) ||
            alternativeBound?.assumptions.length !== 1 || alternativeBound.assumptions[0].id !== hypothesis.id ||
            alternativeBound.assumptions[0].revision !== hypothesis.revision) {
          fail(context + ': alternative premise mismatch');
        }
        const key = recoveryKey(disposition);
        if (declined.has(key)) fail(context + ': duplicate disposition');
        if (credited.has(key)) fail(context + ': disposition conflicts with recovery assessment for the same revisions');
        declined.add(key);
      }
      for (const resolution of version.resolutions) {
        const context = record.id + ' resolution ' + resolution.assumptionId;
        if (!assumptions.has(resolution.assumptionId)) fail(context + ': unknown recovery assumption');
        const current = version === record;
        const get = ref => getBound(record.id, ref.id, ref.revision);
        const matches = [...resolution.benchmarks, ...resolution.recovered];
        for (const link of matches) if (!get(link)) fail(context + ': unknown bound revision ' + link.id + '@' + link.revision);
        for (const ref of resolution.evidence) {
          if ('proofId' in ref) objectLink(proofRef(ref), context);
          else citation(ref, context, current);
        }
        if (!['resolved', 'essentially-resolved'].includes(resolution.status)) continue;
        if (!resolution.rule || !resolution.benchmarks.length || !resolution.evidence.length) {
          fail(context + ': reviewed resolution requires a rule, benchmark and evidence');
        }
        if (current && matches.some(link => {
          const ref = { type: 'bound', caseId: record.id, ...link };
          return !isCurrent(ref) || !usable(ref);
        })) fail(context + ': current resolution relies on an obsolete or unsupported bound revision');
        if (resolution.rule === 'equivalence-barrier' && current) {
          const targets = resolution.benchmarks.map(get).filter(Boolean);
          for (const hypothesis of hypotheses) {
            const relevant = targets.filter(bound => bound.assumptions.some(item => item.id === hypothesis));
            if (!relevant.length || relevant.some(bound => assessmentState(bound, record.id, hypothesis).verdict !== 'established-equivalent')) {
              fail(context + ': equivalence barrier requires an established equivalence for each recorded ' + hypothesis + ' benchmark');
            }
          }
        }
        if (['eth-match', 'sh-match', 'effective-match', 'sh-type-match'].includes(resolution.rule) && !resolution.recovered.length) {
          fail(context + ': match rule requires a recovered bound');
        }
        if (resolution.status === 'essentially-resolved' && (!resolution.remainingGap || !['effective-match', 'sh-type-match'].includes(resolution.rule))) {
          fail(context + ': essentially resolved needs a partial-match rule and the remaining gap');
        }
      }
    }
    if (!release) continue;
    const established = record.bounds.filter(bound => bound.status === 'established');
    if (!established.some(bound => bound.assumptions.some(item => launchAssumptions.has(item.id)))) {
      fail(record.id + ': no established bound under this edition’s release hypotheses');
    }
    for (const bound of established) {
      const context = record.id + '/' + bound.id;
      const ref = { type: 'bound', caseId: record.id, id: bound.id, revision: bound.revision };
      if (!usable(ref)) fail(context + ': confirmed defect or unsupported dependency prevents release');
      if (bound.assumptions.some(item => item.revision !== assumptions.get(item.id)?.revision)) {
        fail(context + ': established bound uses superseded premise conventions');
      }
    }
  }
  if (release && !errors.length) {
    for (const record of cases.values()) {
      const internal = record.bounds.filter(b => b.provenance === 'atlas' && b.proofs.length &&
        b.proofs.every(ref => proofs.get(ref.proofId)?.revisions.find(v => v.revision === ref.revision)?.authorship?.origin === 'atlas'));
      const bounds = record.bounds.map(b => ({...b, supported: usable({type:'bound', caseId:record.id, id:b.id, revision:b.revision})}));
      const supportedRecord = {...record, bounds};
      const credited = recoveryComparisons(supportedRecord, db).filter(e => e.recovery);
      for (const b of internal) {
        if (!credited.some(e => e.recovery.id === b.id && e.recovery.revision === b.revision)) {
          fail(record.id + '/' + b.id + ': internal bound needs a credited recovery or includeInRelease: false');
        }
      }
      const decided = new Set([...credited, ...(record.recoveryDispositions ?? [])].map(recoveryKey));
      const targets = currentRecoveryBounds(supportedRecord, 'eth');
      for (const hypothesis of db.assumptions.filter(h => h.id !== 'eth' && launchAssumptions.has(h.id))) {
        for (const recovery of currentRecoveryBounds(supportedRecord, hypothesis.id)) {
          for (const target of targets) {
            if (decided.has(recoveryKey({target, hypothesis, recovery}))) continue;
            fail(record.id + ': missing recovery decision for ' + target.id + '@' + target.revision +
              ' and ' + recovery.id + '@' + recovery.revision + ' under ' + hypothesis.id + '@' + hypothesis.revision);
          }
        }
      }
    }
  }
  if (errors.length) throw new AtlasError('INVALID_ATLAS', 'Atlas validation failed', errors);

  return { db, usable, isCurrent, assessmentState, lookup, freshReview, hashMatches, selectedRelease, releaseHypotheses: release && launchAssumptions };
}

function linkFromKey(key) {
  const [type, id, revision, ...rest] = key.split('/');
  if (type === 'proof') return { type, id, revision: Number(revision), theorem: rest.join('/') };
  return { type, caseId: id, id: revision, revision: Number(rest[0]) };
}

function hasCycle(key, dependencies, ancestors = new Set()) {
  if (ancestors.has(key)) return true;
  const next = new Set([...ancestors, key]);
  return (dependencies.get(key) ?? []).some(ref => hasCycle(ref, dependencies, next));
}

function currentRevision(versions = []) {
  return Math.max(...versions.map(version => version.revision));
}

function addBacklink(map, id, ref) {
  (map[id] ??= []).push(ref);
}

function formulationBoundSources(result) {
  const editions = new Map();
  for (const paper of result.papers) {
    for (const edition of paper.editions) {
      for (const url of editionSourceUrls(edition)) {
        if (editions.has(url)) editions.set(url, undefined);
        else editions.set(url, { paperId: paper.id, editionId: edition.id });
      }
    }
  }
  const sources = new Map();
  for (const formulation of result.formulations ?? []) {
    for (const link of formulation.equivalences ?? []) {
      const key = objectKey({ type: 'bound', caseId: link.caseId, id: link.boundId, revision: link.boundRevision });
      const entry = sources.get(key) ?? [];
      const add = (url, locator, direction) => {
        const edition = editions.get(normalizedSourceUrl(url));
        if (edition) entry.push({ ...edition, locator, direction });
      };
      add(link.source, link.locator, 'forward');
      for (const extra of link.additionalForwardSources ?? []) add(extra.source, extra.locator, 'forward');
      add(link.reverseSource ?? link.source, link.reverseLocator ?? link.locator, 'converse');
      sources.set(key, entry);
    }
  }
  return sources;
}

export function exportAtlas(validation) {
  const { db, usable, isCurrent, assessmentState, freshReview, hashMatches } = validation;
  const result = structuredClone(db);
  const allowed = validation.releaseHypotheses;
  if (allowed) {
    result.assumptions = result.assumptions.filter(h => allowed.has(h.id));
    if (result.formulations) result.formulations = result.formulations.filter(f => allowed.has(f.hypothesisId));
    const targets = new Set([...allowed, ...(result.formulations ?? []).map(f => f.id)]);
    for (const record of result.cases) {
      for (const version of [record, ...(record.history ?? [])]) {
        delete version.recoveryDispositions;
        version.resolutions = version.resolutions.filter(r => allowed.has(r.assumptionId));
        for (const bound of version.bounds) {
          for (const b of [bound, ...(bound.history ?? [])]) {
            for (const id of Object.keys(b.assessments ?? {})) if (!targets.has(id)) delete b.assessments[id];
          }
        }
      }
    }
  }
  if (validation.selectedRelease) {
    const cited = citedPaperIds(result);
    result.papers = result.papers.filter(paper => cited.has(paper.id));
  }
  delete result.proposalIds;
  for (const record of result.cases) delete record.proposalIds;
  const reverse = {
    assumptions: Object.create(null),
    papers: Object.create(null),
    proofs: Object.create(null),
    dependencies: Object.create(null)
  };
  const formulationSources = formulationBoundSources(result);
  for (const kind of ['assumptions', 'cases', 'papers', 'proofs', 'reviews', 'challenges']) result[kind] = ordered(result[kind]);
  result.apiVersion = 'v1';
  for (const paper of result.papers) {
    paper.editions = ordered(paper.editions);
    for (const edition of paper.editions) edition.preferredUrl = paperUrl(edition);
    paper.preferredUrl = paper.editions.find(edition => edition.id === paper.preferredEditionId).preferredUrl;
  }
  for (const assumption of result.assumptions) {
    if (assumption.source) addBacklink(reverse.papers, assumption.source.paperId, {
      type: 'assumption', id: assumption.id, revision: assumption.revision, ...assumption.source
    });
  }
  for (const review of result.reviews) {
    review.stale = !isCurrent(review.object) || Boolean(review.sourceSha256 && !hashMatches(review));
    review.applicable = freshReview(review) && usable(review.object);
    if (review.applicable) review.label = labelNames[review.type];
  }
  for (const proof of result.proofs) {
    proof.currentRevision = currentRevision(proof.revisions);
    proof.revisions.sort((a, b) => a.revision - b.revision);
    for (const version of proof.revisions) {
      if (version.authorship?.origin === 'atlas' && version.authorship.kind === 'ai') version.authorship.authors ??= ['Atlas'];
      for (const theorem of version.theorems) {
        const ref = { type: 'proof', id: proof.id, revision: version.revision, theorem: theorem.label };
        theorem.supports = usable(ref);
        theorem.reviewIds = result.reviews.filter(review => objectKey(review.object) === objectKey(ref)).map(review => review.id);
        for (const dependency of theorem.dependencies ?? version.dependencies ?? []) addBacklink(reverse.dependencies, objectKey(dependency), ref);
      }
    }
  }
  for (const record of result.cases) {
    record.bounds = ordered(record.bounds);
    for (const bound of record.bounds) {
      bound.effectiveModel = algorithmModel(bound);
      const ref = { type: 'bound', caseId: record.id, id: bound.id, revision: bound.revision };
      bound.supported = usable(ref);
      bound.reviewIds = result.reviews.filter(review => objectKey(review.object) === objectKey(ref)).map(review => review.id);
      const evidenceSources = [...bound.sources];
      const structuredSources = { forward: bound.sources.filter(s => !s.placement || ['statement', 'forward'].includes(s.placement)), converse: [] };
      const proofLinks = new Map(bound.proofs.map(link => [objectKey(proofRef(link)),link]));
      bound.assessments ??= {};
      for (const [hypothesis, assessment] of Object.entries(bound.assessments)) {
        const state = assessmentState(bound, record.id, hypothesis);
        assessment.verdict = state.verdict;
        for (const direction of ['forward', 'converse']) {
          assessment[direction].effectiveStatus = state[direction];
          for (const {proof} of assessment[direction].evidence) {
            if (proof) proofLinks.set(objectKey(proofRef(proof)),proof);
          }
          const sources = assessment[direction].evidence.flatMap(evidence => evidence.source ? [evidence.source] : []);
          structuredSources[direction].push(...sources);
          evidenceSources.push(...sources);
        }
      }
      for (const { direction, ...source } of formulationSources.get(objectKey(ref)) ?? []) {
        const duplicate = structuredSources[direction].some(citation =>
          citation.paperId === source.paperId && citation.editionId === source.editionId);
        if (!duplicate) evidenceSources.push({ ...source, role: direction + ' implication' });
      }
      for (const premise of bound.assumptions) addBacklink(reverse.assumptions, premise.id, ref);
      const seen = new Set();
      for (const source of evidenceSources) {
        const key = json(source);
        if (seen.has(key)) continue;
        seen.add(key);
        addBacklink(reverse.papers, source.paperId, { ...ref, ...source });
      }
      for (const link of proofLinks.values()) addBacklink(reverse.proofs, link.proofId, {
        ...ref, proofRevision: link.revision, theorem: link.theorem, applicable: usable(proofRef(link))
      });
    }
    for (const resolution of record.resolutions) {
      for (const source of resolution.evidence.filter(item => 'paperId' in item)) {
        addBacklink(reverse.papers, source.paperId, { type: 'resolution', caseId: record.id, id: resolution.assumptionId, ...source });
      }
    }
  }
  for (const record of result.cases) record.recoveryComparisons = recoveryComparisons(record,result);
  return { ...result, reverse };
}

function textScore(query, entries) {
  if (!query) return 1;
  const terms = query.split(/\s+/);
  const haystack = entries.filter(value => typeof value === 'string').map(fold);
  if (haystack.includes(query)) return 3;
  if (haystack.some(value => value.includes(query))) return 2;
  return terms.every(term => haystack.some(value => value.includes(term))) ? 1 : 0;
}

export function searchAssumptions(db, query) {
  const key = fold(query);
  return ranked(db.assumptions, item => {
    if ([item.id, ...item.aliases].map(fold).includes(key)) return 4;
    return textScore(key, [item.name, item.definition, item.model, ...item.aliases]);
  });
}

function ranked(records, score) {
  return records.map(record => ({ record, score: score(record) }))
    .filter(item => item.score).sort((a, b) => b.score - a.score || compareText(a.record.id, b.record.id))
    .map(item => item.record);
}

export function searchCases(db, query, filters = {}) {
  const key = fold(query);
  const selection = db.cases.filter(record =>
    ['kind', 'family'].every(field => !filters[field] || fold(record[field] ?? '') === fold(filters[field])) &&
    (!filters.model || [record.model, ...record.bounds.map(algorithmModel)].some(model => model && fold(model) === fold(filters.model))) &&
    (!filters.recovery || record.recoveryComparisons.some(e => e.status === filters.recovery &&
      (!filters.assumption || e.hypothesis.id === filters.assumption))) &&
    (!filters.assumption || filters.recovery || record.bounds.some(bound => bound.assumptions.some(item => item.id === filters.assumption)) ||
      record.resolutions.some(item => item.assumptionId === filters.assumption)) &&
    ((!filters.status && !filters.rule) || record.resolutions.some(item =>
      (!filters.assumption || filters.assumption === item.assumptionId) &&
      (!filters.rule || filters.rule === item.rule) &&
      (!filters.status || (filters.status === 'unresolved' ? item.status !== 'resolved' : item.status === filters.status)))));
  return ranked(selection, record => {
    const problem = db.problems?.find(p => p.id === record.problemId);
    if ([record.id, ...record.aliases, ...(problem ? [problem.id] : [])].map(fold).includes(key)) return 4;
    const assumptionIds = new Set(record.bounds.flatMap(bound => bound.assumptions.map(item => item.id)));
    const paperIds = new Set(record.bounds.flatMap(bound => bound.sources.map(item => item.paperId)));
    const premises = db.assumptions.filter(item => assumptionIds.has(item.id)).flatMap(item => [item.id, item.name, ...item.aliases]);
    const titles = db.papers.filter(item => paperIds.has(item.id)).flatMap(item => [
      item.id, item.title, ...item.authors, ...item.editions.flatMap(edition => [edition.title, edition.label, edition.doi])
    ]);
    return textScore(key, [problem?.name ?? '', record.title, record.variant, record.parameter, record.task, record.family, ...premises, ...titles]);
  });
}

export function showRecord(db, key, caseKey) {
  const exact = (item, id) => [item.id, ...(item.aliases ?? [])].map(fold).includes(fold(id));
  if (caseKey) return db.cases.find(item => exact(item, caseKey))?.bounds.find(item => exact(item, key));
  const matches = ['problems', 'cases', 'assumptions', 'formulations', 'papers', 'proofs', 'reviews', 'challenges']
    .flatMap(kind => (db[kind] ?? []).filter(item => exact(item, key)).map(record => ({ kind, record })));
  if (matches.length > 1) throw new AtlasError('AMBIGUOUS_ID', 'Record ID occurs in more than one registry', matches.map(item => item.kind));
  if (matches.length) return matches[0].record;
  const parts = key.split('/');
  if (parts.length === 2 && parts.every(Boolean)) return showRecord(db, parts[1], parts[0]);
  return undefined;
}

export function searchBounds(db, query, filters = {}) {
  if (Boolean(filters.assessment) !== Boolean(filters.verdict)) {
    throw new AtlasError('USAGE', 'Provide both --assessment ID and --verdict VERDICT');
  }
  if (filters.assessment && ![...db.assumptions, ...(db.formulations ?? [])].some(target => target.id === filters.assessment)) {
    throw new AtlasError('USAGE', 'Unknown assessment target: ' + filters.assessment);
  }
  const key = fold(query);
  const conditions = new Map(db.cases.map(record => [record.id, record.inputConditions ?? []]));
  const records = db.cases.flatMap(record => record.bounds.map(bound => ({ ...bound, caseId: record.id })));
  const matches = records.filter(bound =>
    (!filters.case || filters.case === bound.caseId) &&
    (!filters.assumption || bound.assumptions.some(item => item.id === filters.assumption)) &&
    (!filters.status || bound.status === filters.status) &&
    hypotheses.every(id => !filters[id] || (bound.assessments?.[id]?.verdict ?? 'unassessed') === filters[id]) &&
    (!filters.assessment || (bound.assessments?.[filters.assessment]?.verdict ?? 'unassessed') === filters.verdict));
  return ranked(matches, bound => {
    if (key === bound.caseId + '/' + bound.id || key === bound.id) return 4;
    const scope = conditions.get(bound.caseId).filter(c => c.level === 'problem' || bound.inputConditions.includes(c.id));
    return textScore(key, [bound.caseId, bound.id, bound.statement, bound.runtime, algorithmModel(bound),
      bound.restrictions, ...(bound.qualifications ?? []), ...scope.map(c => c.condition)]);
  });
}

export function dependentRecords(db, root) {
  const visited = new Set([objectKey(root)]);
  const output = [];
  const queue = [root];
  for (const ref of queue) {
    const direct = db.reverse.dependencies[objectKey(ref)] ?? [];
    const supported = ref.type === 'proof' ? (db.reverse.proofs[ref.id] ?? [])
      .filter(item => item.theorem === ref.theorem && item.proofRevision === ref.revision)
      .map(({ type, caseId, id, revision }) => ({ type, caseId, id, revision })) : [];
    for (const dependent of [...direct, ...supported]) {
      const key = objectKey(dependent);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(dependent);
        output.push(dependent);
      }
    }
  }
  return output;
}
