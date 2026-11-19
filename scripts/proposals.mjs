import { createHash, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { AtlasError, json, loadAtlas, validateAtlas } from './database.mjs';
import { algorithmModel } from './models.mjs';

export function writeJson(path, value) {
  const target = resolve(path);
  const directory = dirname(target);
  mkdirSync(directory, { recursive: true });
  const temporary = resolve(directory, '.' + basename(target) + '.' + randomUUID() + '.tmp');
  try {
    writeFileSync(temporary, json(value), { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, target);
  } finally {
    removeIfPresent(temporary);
  }
}

function removeIfPresent(path) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function serialWrite(path, action) {
  const lock = resolve(dirname(path), '.atlas-write.lock');
  let descriptor;
  try {
    descriptor = openSync(lock, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') throw new AtlasError('BUSY', 'Another writer owns ' + lock);
    throw error;
  }
  try {
    writeFileSync(descriptor, json({ pid: process.pid, time: new Date().toISOString() }));
    return action();
  } finally {
    closeSync(descriptor);
    unlinkSync(lock);
  }
}

const criteria = {
  assumption: ['name', 'aliases', 'definition', 'model', 'quantifiers', 'conventions', 'source'],
  bound: ['statement', 'runtime', 'runtimeSymbols', 'qualifications', 'inputFactor', 'model', 'inputConditions', 'assumptions', 'sources']
};

function values(record, field) {
  const value = record[field];
  if (field === 'model' && 'runtime' in record) return [normalize(algorithmModel(record))];
  if (['inputConditions', 'runtimeSymbols', 'qualifications'].includes(field)) {
    return Array.isArray(value) ? [json([...value].sort())] : [];
  }
  if (field === 'sources' || field === 'source') {
    return [value].flat().filter(Boolean).map(item => json([item.paperId, item.editionId, item.locator]));
  }
  if (field === 'assumptions') return (value ?? []).map(item => item.id);
  if (field === 'name' || field === 'aliases') {
    return [record.name, ...(record.aliases ?? [])].filter(Boolean).map(normalize);
  }
  return typeof value === 'string' ? [normalize(value)] : [];
}

function normalize(value) {
  return value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
}

function suggestions(kind, proposed, candidates) {
  return candidates.flatMap(existing => {
    const matchedFields = criteria[kind].filter(field => values(proposed, field).some(item => values(existing, field).includes(item)));
    const nameOverlap = kind === 'assumption' && matchedFields.includes('name');
    const substantiveMatch = kind === 'bound' && matchedFields.some(field => ['statement', 'runtime', 'sources'].includes(field));
    if (!(nameOverlap || (kind === 'assumption' && matchedFields.includes('definition')) || substantiveMatch)) return [];
    return [{ id: existing.id, caseId: existing.caseId, matchedFields, differentFields: criteria[kind].filter(field => !matchedFields.includes(field)) }];
  }).sort((a, b) => b.matchedFields.length - a.matchedFields.length || a.id.localeCompare(b.id) || (a.caseId ?? '').localeCompare(b.caseId ?? ''));
}

function snapshot(record) {
  const { history, proposalIds, proofs, reviews, challenges, ...version } = record;
  return version;
}

function proposalRecord(payload, field) {
  const record = payload?.[field] ?? payload;
  if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string') {
    throw new AtlasError('BAD_PROPOSAL', 'Expected a ' + field + ' JSON object with an ID');
  }
  if (record.revision !== 1 || record.history?.length) {
    throw new AtlasError('BAD_PROPOSAL', 'A new record must start at revision 1 with no history');
  }
  if (payload !== record) {
    const extra = field === 'assumption' ? ['papers'] : ['proofs', 'reviews', 'challenges'];
    for (const key of Object.keys(payload)) {
      if (key === field) continue;
      if (!extra.includes(key) || !Array.isArray(payload[key])) {
        throw new AtlasError('BAD_PROPOSAL', 'Unexpected or malformed proposal field: ' + key);
      }
    }
  }
  return record;
}

export function propose(command, payload, options) {
  const { file = 'data/atlas.json', caseId, assumption, expectedRevision, apply = false } = options;
  const kind = command === 'add-assumption' ? 'assumption' : command === 'add-bound' ? 'bound' : undefined;
  if (!kind) throw new AtlasError('BAD_PROPOSAL', 'Unknown proposal command: ' + command);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new AtlasError('USAGE', 'A positive integer --expected-revision is required');
  }
  const proposed = proposalRecord(payload, kind);
  const digest = createHash('sha256').update(json({ command, payload, caseId, assumption, expectedRevision })).digest('hex');
  const transaction = () => {
    const load = loadAtlas(file);
    const { db } = validateAtlas(load);
    const caseFile = kind === 'bound' ? [...load.caseFiles].find(([, item]) => item.id === caseId) : undefined;
    const inlineCase = kind === 'bound' ? load.raw.cases?.find(item => item.id === caseId) : undefined;
    const target = kind === 'assumption' ? load.raw : caseFile?.[1] ?? inlineCase;
    if (!target) throw new AtlasError('NOT_FOUND', 'Unknown case ID: ' + caseId);
    if (target.proposalIds?.includes(digest)) return { outcome: 'already-applied', id: proposed.id, revision: target.revision };
    if (target.revision !== expectedRevision) {
      throw new AtlasError('STALE_REVISION', 'Expected revision ' + expectedRevision + ', found ' + target.revision);
    }
    let candidates;
    if (kind === 'assumption') {
      candidates = db.assumptions;
      const keys = new Set([proposed.id, ...(Array.isArray(proposed.aliases) ? proposed.aliases.filter(item => typeof item === 'string') : [])].map(normalize));
      if (db.assumptions.some(item => [item.id, ...item.aliases].some(value => keys.has(normalize(value))))) {
        throw new AtlasError('IDENTITY_COLLISION', 'Assumption ID or alias already exists: ' + proposed.id);
      }
      target.assumptions.push(proposed);
      target.papers.push(...(payload === proposed ? [] : payload.papers ?? []));
    } else {
      if (!assumption || !db.assumptions.some(item => item.id === assumption) ||
          !Array.isArray(proposed.assumptions) || !proposed.assumptions.some(item => item?.id === assumption)) {
        throw new AtlasError('BAD_PROPOSAL', 'Bound must include the registered premise supplied with --assumption');
      }
      if (target.bounds.some(item => item.id === proposed.id)) throw new AtlasError('IDENTITY_COLLISION', 'Bound ID already exists in this case: ' + proposed.id);
      if (proposed.assumptions.some(ref => db.assumptions.find(item => item.id === ref?.id)?.revision !== ref?.revision)) {
        throw new AtlasError('STALE_REVISION', 'A proposed bound must use each premise’s current definition revision');
      }
      candidates = db.cases.flatMap(item => item.bounds.map(bound => ({ ...bound, caseId: item.id })));
      (target.history ??= []).push(snapshot(structuredClone(target)));
      target.bounds.push(proposed);
      if (payload !== proposed) {
        for (const field of ['proofs', 'reviews', 'challenges']) {
          if (payload[field]) (target[field] ??= []).push(...payload[field]);
        }
      }
    }
    target.revision++;
    (target.proposalIds ??= []).push(digest);
    validateAtlas(load);
    const possibleDuplicates = suggestions(kind, proposed, candidates);
    if (apply) writeJson(caseFile?.[0] ?? load.path, caseFile ? target : load.raw);
    return { outcome: apply ? 'applied' : 'valid', id: proposed.id, revision: target.revision, possibleDuplicates };
  };
  return apply ? serialWrite(resolve(file), transaction) : transaction();
}
