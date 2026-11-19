#!/usr/bin/env node
import { AtlasError, dependentRecords, exportAtlas, json, loadAtlas, readJSON, searchAssumptions, searchBounds, searchCases, showRecord, validateAtlas } from './database.mjs';
import { propose, writeJson } from './proposals.mjs';
import { problemDefinitionHash } from './problems.mjs';

const usage = [
  'Usage: node scripts/atlas.mjs [--data PATH] COMMAND',
  '',
  '  search [QUERY] [--assumption ID] [--recovery OUTCOME] [--status STATUS] [--rule RULE] [--kind KIND] [--model MODEL] [--family FAMILY]',
  '  bounds search [QUERY] [--case CASE-ID] [--assumption ID] [--status STATUS] [--assessment ID --verdict VERDICT] [--eth VERDICT] [--sh VERDICT]',
  '  show ID [--case CASE-ID]',
  '  problems pin PROBLEM-ID',
  '  dependents ID --revision N (--case CASE-ID | --theorem LABEL)',
  '  assumptions search [QUERY]',
  '  assumptions init --id ID [--out FILE]',
  '  validate [--release] (alias: check)',
  '  export [--release] [--out FILE]',
  '  propose add-assumption --file FILE --expected-revision N [--apply]',
  '  propose add-bound --case CASE-ID --assumption ID --file FILE --expected-revision N [--apply]',
  '',
  'The default database is data/atlas.json. Proposals validate without writing unless --apply is present.'
].join('\n');

const flags = new Set(['help', 'release', 'apply']);
const values = new Set(['data', 'file', 'out', 'expected-revision', 'case', 'assumption', 'assessment', 'verdict', 'id', 'recovery', 'status', 'rule', 'kind', 'model', 'family', 'eth', 'sh', 'theorem', 'revision']);

function parse(argv) {
  const position = [];
  const options = Object.create(null);
  for (let index = 0; index < argv.length; index++) {
    const word = argv[index];
    if (!word.startsWith('--')) {
      position.push(word);
      continue;
    }
    const key = word.slice(2);
    if (Object.hasOwn(options, key)) throw new AtlasError('USAGE', 'Repeated option: ' + word);
    if (flags.has(key)) options[key] = true;
    else if (values.has(key) && argv[index + 1] && !argv[index + 1].startsWith('--')) options[key] = argv[++index];
    else throw new AtlasError('USAGE', 'Unknown option or missing value: ' + word);
  }
  return { position, options };
}

function allowed(options, keys) {
  for (const option of Object.keys(options)) {
    if (option !== 'data' && !keys.includes(option)) throw new AtlasError('USAGE', 'Option does not apply: --' + option);
  }
}

function output(data, file) {
  if (file) writeJson(file, data);
  else process.stdout.write(json(data));
}

function run(argv) {
  const { position, options } = parse(argv);
  const [command, action, ...rest] = position;
  if (options.help || !command) {
    process.stdout.write(usage + '\n');
    return;
  }
  const file = options.data ?? 'data/atlas.json';
  if (command === 'problems' && action === 'pin') {
    allowed(options, []);
    if (rest.length !== 1) throw new AtlasError('USAGE', 'Provide one registered problem ID');
    const problem = readJSON(file).problems?.find(p => p.id === rest[0]);
    if (!problem?.revision || !problem.input || !problem.question) {
      throw new AtlasError('INVALID_PROBLEM', 'Expected a versioned problem definition for ' + rest[0]);
    }
    output({problemId:problem.id, problemRevision:problem.revision, problemDefinitionHash:problemDefinitionHash(problem)});
    return;
  }
  if (command === 'propose') {
    allowed(options, ['file', 'expected-revision', 'case', 'assumption', 'apply']);
    if (!action || rest.length || !options.file || !/^[1-9]\d*$/.test(options['expected-revision'] ?? '')) {
      throw new AtlasError('USAGE', 'Provide a proposal action, --file and --expected-revision');
    }
    if (action === 'add-assumption' && (options.case || options.assumption)) {
      throw new AtlasError('USAGE', 'Only add-bound accepts --case and --assumption');
    }
    output(propose(action, readJSON(options.file), {
      file, caseId: options.case, assumption: options.assumption,
      expectedRevision: Number(options['expected-revision']), apply: options.apply
    }));
    return;
  }
  if (command === 'assumptions' && action === 'init') {
    allowed(options, ['id', 'out']);
    if (rest.length || !/^[a-z0-9][a-z0-9_-]*$/.test(options.id ?? '')) {
      throw new AtlasError('USAGE', 'Provide a canonical assumption ID with --id');
    }
    output({
      id: options.id,
      revision: 1,
      name: '',
      aliases: [],
      definition: '',
      model: '',
      quantifiers: '',
      conventions: '',
      source: { paperId: '', editionId: '', locator: '', role: 'definition' }
    }, options.out);
    return;
  }
  const load = loadAtlas(file);
  if (['validate', 'check', 'export'].includes(command)) {
    allowed(options, command === 'export' ? ['release', 'out'] : ['release']);
    if (action) throw new AtlasError('USAGE', 'Unexpected positional argument: ' + action);
    const valid = validateAtlas(load, { release: options.release });
    if (command === 'export') output(exportAtlas(valid), options.out);
    else output({ status: 'valid', schemaVersion: valid.db.schemaVersion, edition: valid.db.edition, cases: valid.db.cases.length, release: options.release ?? false });
    return;
  }
  const valid = validateAtlas(load);
  const data = exportAtlas(valid);
  if (command === 'search') {
    allowed(options, ['assumption', 'recovery', 'status', 'rule', 'kind', 'model', 'family']);
    output(searchCases(data, position.slice(1).join(' '), options).map(record => ({
      id: record.id, title: record.title, parameter: record.parameter, kind: record.kind,
      ...(options.recovery ? { recoveries: record.recoveryComparisons.filter(e => e.status === options.recovery && (!options.assumption || e.hypothesis.id === options.assumption)) } : {}),
      assessments: record.resolutions.map(item => ({ id: item.assumptionId, status: item.status, rule: item.rule }))
    })));
  } else if (command === 'assumptions' && action === 'search') {
    allowed(options, []);
    output(searchAssumptions(data, rest.join(' ')));
  } else if (command === 'bounds' && action === 'search') {
    allowed(options, ['case', 'assumption', 'assessment', 'verdict', 'eth', 'sh', 'status']);
    output(searchBounds(data, rest.join(' '), options));
  } else if (command === 'dependents' && action && !rest.length) {
    allowed(options, ['case', 'revision', 'theorem']);
    if (Boolean(options.case) === Boolean(options.theorem) || !/^[1-9]\d*$/.test(options.revision ?? '')) {
      throw new AtlasError('USAGE', 'Provide --revision and one of --case or --theorem');
    }
    const ref = options.case
      ? { type: 'bound', caseId: options.case, id: action, revision: Number(options.revision) }
      : { type: 'proof', id: action, theorem: options.theorem, revision: Number(options.revision) };
    if (!valid.lookup(ref)) throw new AtlasError('NOT_FOUND', 'Unknown target revision: ' + action);
    output(dependentRecords(data, ref));
  } else if (command === 'show' && action && !rest.length) {
    allowed(options, ['case']);
    const result = showRecord(data, action, options.case);
    if (!result) throw new AtlasError('NOT_FOUND', 'Unknown ID or alias: ' + action);
    output(result);
  } else {
    throw new AtlasError('USAGE', 'Unknown command or invalid arguments: ' + position.join(' '));
  }
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const code = error.code ?? 'UNEXPECTED';
  process.stderr.write(json({ error: { code, message: error.message, details: error.details ?? [] } }));
  process.exitCode = code === 'USAGE' ? 2 : code === 'NOT_FOUND' ? 3 : code === 'STALE_REVISION' || code === 'BUSY' ? 4 : 1;
}
