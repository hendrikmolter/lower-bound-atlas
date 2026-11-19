# Contributing to Lower Bound Atlas

Begin in a fresh clone, on a branch. Check for an existing case, theorem, and paper edition. A scoped issue is useful for coordinating a substantial investigation across clones. A pull request can carry a small citation correction directly.

## Contribution rights and attribution

By submitting an original contribution for inclusion, you agree to license its software portions under the MIT License and its Atlas content portions under CC BY 4.0, as described in the [licensing and attribution notice](LICENSE.md). Submit material you have the right to license on these terms. For third-party material, identify the source, copyright holder and applicable terms, preserve required notices, and explain what permits redistribution. Link to papers and cite the relevant theorem or page. Include copies of external material only when redistribution is permitted. Credit the original theorem authors, the authors of any new proof, and the Atlas contributors in their respective records. Describe AI assistance where relevant to authorship or verification.

## Maintainer decisions

Contributors can propose edits and review their substance. Maintainers decide whether to merge a pull request and publish the resulting entry. While the project has one maintainer, that maintainer can merge with zero maintainer approvals. When the project has multiple maintainers, a pull request requires approval from at least one maintainer other than the author.

The repository's [main branch ruleset template](.github/main-ruleset.json) uses zero required approvals for the sole-maintainer setup. On a GitHub plan that supports rulesets for the repository, a maintainer with administration access can activate the template:

```sh
gh api --method POST repos/{owner}/{repo}/rulesets --input .github/main-ruleset.json
```

Replace {owner} and {repo} with the repository coordinates. When adding another maintainer, update the template and edit the existing GitHub ruleset to require one approval. Keep the ruleset in sync with the documented maintainer policy.

Merge approval concerns repository governance. Independent proof verification is a separate release requirement for an Atlas-derived result and is recorded against the particular theorem and revision. A merge approval supplies evidence of proof verification only if the verifier is independent of the proof's authors and the verification is separately recorded.

## Walk through a literature contribution

The [tutorial files](examples/tutorial) add a premise and a proposed polynomial-time exclusion for 3-Coloring. Use a disposable clone for this exercise. The tutorial cites the journal edition of Garey, Johnson and Stockmeyer. Its P ≠ NP premise exercises the extensible registry outside the current release.

```sh
node scripts/atlas.mjs search "3-Coloring"
node scripts/atlas.mjs assumptions search "P ≠ NP"
node scripts/atlas.mjs show lms-3color-order
```

Read the current root `revision` in `data/atlas.json` and the case `revision` in `data/cases/lms-3color-order.json`. Search results can include related premises; check the IDs before registering a new one. The first proposal supplies the tutorial paper edition and the premise that will cite it. Omitting `--apply` previews the change.

```sh
node scripts/atlas.mjs propose add-assumption --expected-revision 14 --file examples/tutorial/assumption.json
node scripts/atlas.mjs propose add-assumption --expected-revision 14 --file examples/tutorial/assumption.json --apply
node scripts/atlas.mjs propose add-bound --case lms-3color-order --assumption tutorial-p-ne-np --expected-revision 15 --file examples/tutorial/bound.json
node scripts/atlas.mjs propose add-bound --case lms-3color-order --assumption tutorial-p-ne-np --expected-revision 15 --file examples/tutorial/bound.json --apply
node scripts/atlas.mjs search "3-Coloring" --assumption tutorial-p-ne-np
node scripts/atlas.mjs validate
```

Inspect the diff. The main registry owns the premise and edition, and the case owns the new bound. If a revision is stale, reread the current record and reconcile the mathematical changes before retrying. For a new assumption use `assumptions init --id ID --out FILE` to start a proposal. Use the CLI schema and the examples to supply exact model, quantifiers, conventions, and defining source where available.

## Choosing a citation

Look up the publication history with the publisher or authors. An extended journal version can have a different title. For a paper, prefer the journal version, followed by the published conference version, followed by a preprint or other unpublished manuscript. For a book, cite the newest published edition. Check the publisher’s edition number and date since a reprint or corrected printing can retain the same edition number.

Record each edition’s publication kind in `kind`. For books, record the publisher’s edition number in `editionNumber`. Set the work’s `preferredEditionId` to that publication. Use a DOI URL when one identifies the edition. Add an open copy of the same edition as its full-text link. Record a distinct edition when its title, numbering or content matters to the citation. Give the original authors, publication title, venue and year.

For each claim or proof detail, set `editionId` and `locator` to the edition and location you actually checked. Verify that the theorem covers the stated problem, restrictions and quantifiers. If the preferred edition omits a result or detail, additionally cite the edition containing it and identify the relevant theorem, section or page. Apply the same rule when an older book edition contains material omitted from the newest one. When the preferred full text is inaccessible, cite the publication alongside the inspected source and report which locator remains unverified. When updating a preference, check each claim against the original source and verify the new locator. Prefer the authors who established the result to a later exposition. For preprints, check the latest version and its revision notes. If a result disappeared, investigate corrections or withdrawal before relying on the older text. An older statement alone does not establish that a removed result is still supported.

A current citation to a nonpreferred edition must supply an `editionReason` specific to the claim, such as the omitted construction or the exact detail that could only be checked in an accessible author copy. Remove unused editions after checking theorem citations, proof bibliographies and historical pins. Books and doctoral theses are suitable sources. Prefer a research publication to lecture notes or an undergraduate or master's thesis when it contains the result or construction actually used.

## Walk through an atlas proof

For a complete example, follow the Closest String case from the W[1]-based recovery to its proof ID, revision, theorem label, source, PDF and corresponding review. To propose another project-derived bound:

1. Write a self-contained LaTeX proof of the exact exclusion. State the premise, input model and encoding, parameter, restrictions, quantifiers and input-polynomial factor. Give precise sources for imported results and an addressable PDF destination for each theorem.
2. Compile the PDF and add source and PDF in `proofs/`. In the proposal, reference the proof ID, revision and theorem. Use `provenance: "atlas"` and `status: "proposed"` for a new argument awaiting review. For each directional assessment, report evidence separately for the forward and converse implications.
3. An independent reviewer checks the specific proof revision, including correspondence of the manuscript to the machine record. Record the verdict, reviewer type, source digest, exact scope, imported dependencies, objections and any gaps in an inspectable review. Fixing a proof requires reviewing the corrected text. Human, agent and Lean verification each require their own evidence. A claim of literature novelty requires separate support.
4. If a proof is challenged, identify the object, revision, alleged error and evidence. Record the adjudicated outcome and review dependencies. An open objection, a confirmed proof gap and a refutation of the statement have different effects. In particular, another independently supported proof may still establish the bound.

## Checks and read API

Run these checks locally before submitting a change. The [Validate Atlas workflow](ci/atlas.yml) is ready to install at `.github/workflows/atlas.yml` to run these checks on pull requests to `main`. The deployment job is eligible only for a public repository after the checks on `main` succeed.

```sh
node --test
node scripts/atlas.mjs validate
node scripts/atlas.mjs validate --release
node scripts/atlas.mjs export --release --out dist/atlas-v1.json
python3 scripts/check_proof_pdfs.py
```

The database CLI needs only Node. The last check also needs Python 3.9+, pdfLaTeX and Poppler (`pdfinfo`, `pdftotext`). It rebuilds registered LaTeX sources and checks theorem destinations and the text in the committed PDFs. Inspect the rendered pages as part of review. The read API is a versioned JSON export suitable for an offline reader. The same export supplies paper and assumption backlinks, directional comparisons and revision-scoped verification records.

The Atlas records human and agent reviews and includes independently agent-reviewed proofs. The schema accepts optional Lean evidence for development. Releasing machine-verified results requires a future pinned Lean build check. A verified label applies to the exact scope in the review. Imported literature results retain their paper locators and access or verification qualifications.

Errors contain a machine-readable code, message and details. Exit 0 signals success, 1 a data or validation error, 2 a usage error, 3 a lookup miss, and 4 a revision conflict or active writer. A successful structural check does not establish mathematical correctness. The first public edition considers bounds under ETH, SH, deterministic FPT ≠ W[1], NP ⊈ QP, and the k × k Clique Hypothesis. Additional premises can be developed in a branch or proposed for a future edition.

Include an ETH lower bound with a fixed positive exponent coefficient only when a published source states it or an equivalent formulation. Cite the exact theorem and size measure. A little-o statement alone supports the little-o entry.

On problem pages, list the lower bound as stated in its source. Preserve the size measure, exponent and allowed prefactors. Record an equivalence only for the exact statement proved. To rule out recovery of the effective little-o version, cite an algorithm with an effectively sublinear exponent or a proof that this version implies strongly uniform ETH.

The shared `problems` registry owns each public problem name, input and question. The parameter label belongs in the case’s `reader.parameterLabel`. Keep the formula in the bound’s `runtime`. List its quantifiers, convergence requirements and other mathematical qualifications in `qualifications`. Use an empty array for an unqualified formula. Register the parameter symbols in `reader.parameterSymbols` and other symbols in `reader.symbols` on the parameterization. The bound’s ordered `runtimeSymbols` list selects their definitions by symbol. The overview, hypothesis page and full statement use the same formula and qualifications.

Use the bound’s `statement` to introduce the exclusion in prose. Its revision-specific `reader` object holds the short label and any additional `explanation` for the full statement, such as why a source theorem uses a different premise. Mark each citation’s `placement` as `statement`, `forward`, `proof`, `correction`, or `context`. Record equivalence evidence by direction in the assessments or hypothesis formulation.

Use a comparison note on a problem overview only for a documented recovery of an ETH bound. Specify whether the recovery is exact, effective, or up to scale. Cite papers used solely as proof prerequisites in the proof record.

Every problem and every bound (including archived revisions) requires an `inputConditions` array. Define each condition once in the parameterization record with a stable ID, display text, and level. A `problem` condition defines admissible inputs for the entire parameterization and is inherited by every bound. A `bound` condition narrows a particular theorem: select its ID on the bound. An empty selection explicitly means all inputs of the defined problem. Keep the decision question, parameter definition, algorithm model, and runtime quantifiers in their own fields. The problem box and full statements share the inherited conditions, and both page types use the same additional-scope heading. When a mathematical scope changes, revise the affected bounds and retain the earlier definitions with their historical records.

The default algorithm model is a uniform deterministic bit algorithm measured in worst-case time. A theorem using a different model records a bound-level `modelException` with a stable `kind` and a precise `description`. For example, a randomized exclusion should specify its error guarantee and whether the time bound is worst-case or expected. Hypotheses retain their own model definitions. Record input restrictions exclusively through `inputConditions`; the free-text `model` and `restrictions` fields on older problem and bound revisions are legacy metadata.

Cite a paper on a statement page when it supports that exact claim. Place sources used only to diagnose a withdrawn claim with the correction, and label their roles in the original argument or the review. Define additional symbols for a problem overview once in its ordered `reader.symbols` list.

Launch selection is independent of mathematical status. A contributor can set `"includeInRelease": false` on the bound to keep it in the private database while omitting it from the website and release API. Set it to true (the default) to include the bound when it passes release checks. Proofs used exclusively by held-back records follow them automatically, as do their reviews and challenges. A private resolution may also be marked `includeInRelease: false`. Validate the full private dataset and the release edition separately. Local JSON and repository history still contain private records.

## Problems and parameterizations

Each entry in the registry's `problems` array provides the stable `id`, public `name`, common `input`, decision `question`, and definition `revision`. Run `node scripts/atlas.mjs problems pin closest-string` with the desired problem ID to obtain the three fields to copy into a parameterization. The digest covers the shared input and question. Renaming the problem preserves its pin and URLs. For a mathematical change, retain the old definition in `history`, increment its revision, and repin the affected parameterizations after checking their bound and proof revisions. Put additional input specific to a parameterization, such as a supplied path decomposition, in `reader.additionalInput`.

## Historical ETH recovery

Add a case-level `recoveryAssessments` entry for a documented comparison. Pin the historical ETH target, alternative hypothesis, and recovering bound by ID and revision. Record the scale (`full`, `logarithmic`, or `degree`), whether effective convergence is required, both exponent scales or running times, a short mathematical comparison, and the supporting paper or proof references. Check input restrictions, prefactors, polynomial terms and the location of the exponent in a tower. The comparison is relative to the precise target.

Release validation requires a decision for each pair of current, supported, non-superseded ETH and alternative bounds when both are visible and each uses a single hypothesis. Check each incomparable ETH target and each eligible alternative separately. If the comparison earns no recovery credit, add a case-level `recoveryDispositions` entry using the same `target`, `recovery`, and `hypothesis` pins (each `{"id": "...", "revision": 1}`) and a `reason` describing the exact scope or clock gap. Use one disposition per pair and replace it if a recovery assessment later supports credit. A superseded pin remains valid historical evidence, but a new bound or hypothesis revision requires a fresh decision. Joint-premise bounds do not supply single-hypothesis comparisons.

Dispositions are kept in the contributor record. They award no credit and do not change the public recovery labels or count toward the release requirement for Atlas-authored bounds.

The export derives `recoveryComparisons` for current, supported, non-superseded ETH targets. It derives equivalence barriers from documented equivalences to refuted ETH formulations. A barrier may accompany partial recovery. With no qualifying evidence for a target and hypothesis, the outcome is unresolved. Problems without a target have no recovery outcomes. Contributor progress in `resolutions` is independent. Query published data using the release export, or use `search --assumption w1 --recovery logarithmic` on a local checkout.

## Release hypotheses and directional assessments

The registry’s `releaseHypotheses` lists the hypothesis IDs eligible in this edition. To admit a new hypothesis, register its definition, then add its ID to this list. The private export and preview can inspect it before release. A visible bound with an off-list premise fails release validation. The release export shows the eligible hypotheses, their formulations, and their directional assessments. Older registry files without the list use the original pilot IDs that they contain.

A bound may omit `assessments`. To record a comparison, key an entry by the exact hypothesis or formulation ID. Its `hypothesisRevision` pins the compared object’s own revision. Each entry has `forward` (hypothesis implies bound) and `converse` (bound implies hypothesis) directions, each with a status and evidence. The validator checks the source or proof and the verified review against the exact bound revision. Changing the target revision or the parent hypothesis convention of a formulation can make an implication stale. An omitted target is unassessed. A formulation records a defining reference; add a refutation link only when it has one.

Use `bounds search --assessment ID --verdict VERDICT` for any registered target. For example, `bounds search --assessment eth --verdict established-equivalent` finds established equivalences to ETH. The existing `--eth` and `--sh` filters remain available. Historical recovery continues to compare a selected hypothesis with the current historical ETH targets.

### Checking for an equivalence

For each new bound, write down the hypothesis, the excluded algorithm family, and the converse in the same notation. Look for an explicit biconditional, a completeness theorem for that parameterization, or a reduction in the opposite direction. A converse often appears in a different paper from the forward theorem. Record the source, edition and locator for each direction.

Check the size measure and any kernel used in the reverse direction. For ETH, identify the exact formulation on each side: ordinary little-o, little-o with effective convergence, or a positive exponential rate. For a complexity-class hypothesis, check the membership direction as well as hardness. A reduction establishing hardness on a restricted family does not automatically transfer an equivalence for that family to the unrestricted problem.

In the contribution summary, give the resulting assessment or identify the direction for which supporting evidence is still missing. Leave that direction unassessed when the search is inconclusive. If it takes an additional Atlas argument, use the independent proof workflow before recording an established implication.

### Credit in the version history

When adding a public problem or adding or revising a public lower bound, append a change set to `data/history.json`. Record the atlas date in YYYY-MM-DD format and credit the contributor who prepared the entry, including when a maintainer merges it on their behalf. List newly added problem IDs in `problems`. In `bounds`, identify each changed statement by `caseId`, `id`, and `revision`, with `change` set to `added` or `updated`. Either list can be empty. The optional `commit` field links an already recorded change to Git. The website build checks coverage of public entries. Continue to credit the theorem authors in the statement’s sources.

Record the manuscript’s actual author credits in the proof revision’s `authorship` field. External contributors retain their own bylines and acknowledgements. The Atlas byline and acknowledgement that the proof was found using ChatGPT are an internal convention for AI proofs produced by the atlas project. Record those revisions with origin `atlas`, kind `ai`, and author `Atlas`. Review and authorship are separate. The statement page uses “Proof by AI” for AI authorship and “Proof” for a human-authored theorem with applicable human verification.

Include an internally derived lower bound in the public edition when the bound itself has a credited recovery of at least one current historical ETH target under its stated hypothesis. Otherwise set `includeInRelease` to false. An equivalence that rules out exact recovery can coexist with a weaker recovery of the same target. An unresolved comparison with a different target also leaves the credited recovery intact.

Equivalence may be recorded for any registered hypothesis or formulation. Credit each implication separately in its directional evidence. Cite the original paper and theorem for a published implication, or link the exact proof revision and theorem for an atlas argument. If that argument uses a published lemma, record the lemma as a dependency of that direction. The two directions may share an author or manuscript when it establishes both. Credit the original lower bound independently of the proof of its converse.

Every Atlas-authored proof PDF must contain the complete Atlas argument needed for its stated result. Include any auxiliary arguments developed by Atlas in the same manuscript, even if they also occur in another Atlas PDF. Published lemmas may be imported with precise references. Check this when reviewing the manuscript.

Keep each published Atlas manuscript focused on the claim or implication linked from the public statement page. Include the lemmas needed for its proof. When narrowing a manuscript that also supports private entries, keep the earlier source with those entries and independently review the new public manuscript.

For a problem that restricts an input of another problem, add `restrictionOf` to the restricted problem’s registry record. Each entry gives the parent `problemId` and the mathematical `condition` (for example, a fixed color budget or a planar graph). The website links both problems and sorts problem and parameterization lists by display name. Enter each lower bound on the parameterization for which it is justified.

When moving an existing bound to another parameterization, archive the source case revision and add the bound to its destination. Record the exact source and destination bound revisions as `from` and `to` in the registry’s `boundMoves` array. Log the destination revision with `change: "moved"` in the version history. The version history links to the original statement and its original scope.
