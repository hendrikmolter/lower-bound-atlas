# Lower Bound Atlas

A versioned collection of computational lower bounds. Start with a case to see the exact decision problem, parameter, runtime and premise. Follow the citations to the inspected paper editions, or open the LaTeX and PDF of an atlas proof. Bounds can record separately evidenced implications in both directions for any registered hypothesis or formulation. A proof review identifies the particular theorem and revision checked.

## Open the local reader

Run these commands in the repository root with Node.js 20 or newer. No package installation is needed.

```sh
npm run site
npm run preview
```

Open the loopback address printed by the preview command. For offline browsing, open `dist/site/index.html` directly. The generated pages, search, proof PDFs, LaTeX and review notes live in the build directory. Links to original papers and GitHub revisions use the network.

The release build pins source citations to the Git commit matching the data, proofs, and evidence. To inspect local edits before committing, build with `npm run site:preview` and serve the result with `npm run preview`.

Start with **3-Coloring** to compare ETH and SH equivalences, **Cycle Packing** to browse by width parameter, or the **k × k Clique Hypothesis** to trace a hypothesis from its definition to its applications. Regenerate the reader after editing records. The build runs release validation before rendering and writes the machine-readable edition to `dist/site/api/v1/atlas.json`.

## Browse the database

From the repository root with Node.js 20 or newer:

```sh
node scripts/atlas.mjs search "Closest String"
node scripts/atlas.mjs show lms-3color-order
node scripts/atlas.mjs assumptions search "satisfiability"
node scripts/atlas.mjs validate --release
node scripts/atlas.mjs export --release --out dist/atlas-v1.json
```

The registry assigns a stable ID to each problem. The [case files](data/cases) record individual parameterizations and refer to their problem by ID. Problem pages live at `problems/{problemId}/`, parameterization pages at `cases/{caseId}/`, and each problem’s API record lists its parameterizations. Changing a display name preserves those links. Coverage is selective. Each recovery assessment identifies its historical ETH target, alternative hypothesis, and supporting evidence.

## Files and evidence

For JSON consumers, resolve `case.problemId` in `problems` for the name, input and question. Use `bound.runtime`, `qualifications`, and `runtimeSymbols` together when quoting an exclusion. An omitted `modelException` means uniform deterministic worst-case time on the bit model. Legacy records are still readable by the CLI. Consumers that previously used `reader.runtime`, `reader.statement`, or the free-text `model` field should switch to these fields for the current edition.

- [Registry](data/atlas.json) contains assumptions, paper editions and shared evidence. [Case files](data/cases) own their bounds and comparisons.
- [Proofs](proofs) contains downloadable authoritative LaTeX and compiled PDFs. [Evidence](evidence) records the scope and findings of proof and source reviews.
- [JSON Schema](schemas/atlas-v1.schema.json) defines the version 1 exchange fields. The CLI also checks references, evidence and semantic constraints.
- [Contributing](CONTRIBUTING.md) includes a worked literature proposal and a guide to project-derived proofs. The [agent README](AGENTS.md) covers lookups, new problems and parameterizations, and preparing a checked contribution for review.

## How to cite

To cite an Atlas entry, credit Lower Bound Atlas and the identified author or contributor where supplied. Cite the original paper or proof for the mathematical result. To identify the Atlas entry, record the case ID, bound ID and revision, together with a link to the repository commit. For a proof, add the theorem label and proof revision. Each work names a preferred publication in `preferredEditionId`. Each source identifies the edition actually inspected in `editionId`, with its own theorem or page in `locator`. The reader credits the preferred publication and links to the inspected edition when it differs. DOI links identify individual editions.


## License

The original software is [MIT licensed](LICENSE). Original Atlas content, including the database compilation, Atlas-authored proofs and review notes, is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The [licensing and attribution notice](LICENSE.md) explains the scopes and the separate terms for STIX fonts and other third-party material.
