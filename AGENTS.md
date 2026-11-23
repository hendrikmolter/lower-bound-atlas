# Agent README

The [public content rules](CONTRIBUTING.md#public-content-rules) govern every Atlas contribution, including database text, generated pages, templates, proofs and guide pages. Before adding reader-facing text, identify the rule that authorizes it and its place on the page. If none applies, leave the text out and ask the maintainer about a reusable rule. A free-text field or an example from another entry is insufficient authorization.

Work from the repository root with Node.js 20 or newer. For a structured lookup, use the CLI or the [public JSON export](https://hendrikmolter.github.io/lower-bound-atlas/api/v1/atlas.json). To locate current reader-facing pages, use the [sitemap](https://hendrikmolter.github.io/lower-bound-atlas/sitemap.xml). For a contribution, work in a fresh clone on a branch. Return the proposed changes for review unless the requester also asks you to submit them.

## Find an entry or select a result

If the requester names a paper or problem, start there. For an open-ended request to add a published bound, choose one missing theorem about a natural problem from a paper the atlas already cites.

```sh
node scripts/atlas.mjs search "coloring"
node scripts/atlas.mjs bounds search --assumption eth
node scripts/atlas.mjs show lms-3color-order
node scripts/atlas.mjs --help
```

Search names, aliases, parameterizations, theorem locators and paper editions. Read the original theorem and its problem definition. Two bounds with the same formula may concern different decision problems. For example, 3-Coloring fixes the color budget, whereas Chromatic Number takes it as input. A supplied vertex cover also changes the input. For a lookup, report the precise bound, its restrictions and its original reference. Link an atlas proof or recovery assessment when relevant.

## Add a published lower bound

For a qualitative no-FPT bound from parameterized hardness, record `hardnessBaseline` as `W[1]` or `W[2]` according to the cited result for the precise parameter and input restrictions. Keep the excluded FPT running time and the source in the bound record. The reader supplies the shared wording when this is the only kind of result recorded under FPT ≠ W[1].

For this edition, select decision problems with a documented historical ETH lower bound for the problem. Check the exact output requested by the cited theorem. Include a bound under an alternative hypothesis when its quantitative conclusion adds information about the problem. Ordinary polynomial-time NP-hardness alone does not qualify a polynomial-time exclusion under FPT ≠ W[1] or an input-length quasipolynomial-time exclusion under NP ⊈ QP. A result derived by changing hypotheses needs an explicit derivation and accurate attribution.

1. Identify the decision problem, parameter, hypothesis revision, excluded running time, polynomial factor, and all input restrictions and quantifiers. Record the paper, edition and theorem number. Identify the original result and check for a journal version, including under a different title. For preprints inspect the newest version. Document any necessary exception in the citation’s `editionReason`. Prefer research publications to lecture notes and undergraduate or master’s theses. Books and doctoral theses are suitable sources. Prefer the journal article, then the published proceedings paper, then a preprint or other manuscript. For a book, cite the newest published edition. Use its DOI when available. Check the exact theorem, page or section in the edition you cite. If a detail is available only in another version, cite that version as well and identify the detail. If access prevents verification, identify the edition you could inspect and tell the requester exactly which location remains unverified. See the [citation rules](CONTRIBUTING.md#choosing-a-citation). Reuse its existing registry record when available.
2. Find the matching parameterization in [data/cases](data/cases). If it exists, use its case ID and current revision. If it is missing, follow the steps below first.
3. Prepare a revision-1 bound proposal. Use the [worked proposal](examples/tutorial/bound.json) for the file format and the [contribution guide](CONTRIBUTING.md) for release fields, evidence and source placement. Record a published theorem with literature provenance. Check the converse even when the source states only the forward implication. Follow the [equivalence check](CONTRIBUTING.md#checking-for-an-equivalence) and report which directions and sources you checked with the proposal.
4. Preview the proposal, inspect the duplicate candidates, then apply it using the same arguments plus `--apply`. Substitute your case ID, hypothesis ID, current case revision and proposal file in this command.

   ```sh
   node scripts/atlas.mjs propose add-bound --case CASE_ID --assumption HYPOTHESIS_ID --expected-revision REVISION --file PROPOSAL.json
   ```

   If the revision has changed, reread the record and reconcile the changes before retrying. To register a new hypothesis, follow the separate worked example in the contribution guide.
5. For a public entry, append its date, contributor, newly added problem IDs and bound revisions to [data/history.json](data/history.json). Credit the theorem authors in the source citation.

### When the parameterization or problem is new

The proposal command adds a bound to a registered parameterization. Set up a new parameterization directly in the data files before running that command.

1. Look for the shared problem in [data/atlas.json](data/atlas.json). Reuse its ID if the decision problem already exists. Otherwise append a record to `problems` with a stable ID, name, common input, decision question and definition revision 1. Increment the registry revision for the edit. For instance, the shared Chromatic Number input would be the graph and color budget, and the additional input for one parameterization would be a supplied vertex cover.
2. Run `node scripts/atlas.mjs problems pin PROBLEM_ID`. Copy the returned `problemId`, `problemRevision` and `problemDefinitionHash` into the new case.
3. Create `data/cases/CASE_ID.json` with that case ID and revision 1. Use [the treewidth parameterization of Cycle Packing](data/cases/cycle-packing-treewidth.json) as a structural example. Supply the variant, task, encoding, parameter and coverage for the new record. Define symbols and any additional input in `reader`, and encode restrictions in `inputConditions`. Start with empty `bounds` and `resolutions` arrays. Leave out the example’s history, proposal IDs and evidence.
4. Run `node scripts/atlas.mjs validate`, then preview and apply the first bound at case revision 1. The CLI advances the case revision and records the earlier snapshot. Run release validation after adding the bound.

## Check and hand back the proposal

Run the database and release checks, tests, export and PDF checks listed in [CONTRIBUTING.md](CONTRIBUTING.md#checks-and-read-api). Build the reader with `npm run site:preview` for uncommitted changes or `npm run site` for a commit-pinned release, then run `python3 scripts/check_reader.py`. Inspect the generated problem page and full statement, including their source links and runtime notation. Compare the displayed exponent and polynomial factor with the cited theorem or reviewed proof. In headings, name the parameter or the growth function explicitly. Use “sublinear in the parameter” only for an exponent that is little-o of that parameter. Return the diff or local commit, exact theorem citation, duplicate candidates considered, checks run, and any unresolved issue.

For a new derivation, follow the [proof workflow](CONTRIBUTING.md#walk-through-an-atlas-proof). Supply a focused, self-contained LaTeX manuscript and PDF. Obtain an independent correctness review before release and identify agent reviews as such. If you find an error in an existing proof, identify the theorem, revision and affected step. Preserve separately reviewed support and record repairs so readers can follow the history.
