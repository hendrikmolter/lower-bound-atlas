"""Check the built edition's local navigation and proof/source downloads."""

import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "dist/site"


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.ids = set()
        self.cards = []
        self.card = None
        self.disclosures = []
        self.bound_locations = {}
        self.problem_group = self.problem_heading = False
        self.heading_target = None
        self.heading_by_case = {}
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        classes = attrs.get("class", "").split()
        if tag == "article" and "data-atlas-group" in attrs:
            self.problem_group = True
            self.heading_target = None
        if self.problem_group and tag == "h3":
            self.problem_heading = True
        if self.problem_heading and tag == "a":
            self.heading_target = attrs.get("href")
        if self.problem_group and "data-atlas-case" in attrs:
            if self.heading_target is None:
                raise ValueError(f"Problem heading has no link above {attrs['data-id']}")
            self.heading_by_case[attrs["data-id"]] = self.heading_target
        if tag == "article" and "hypothesis-card" in classes:
            self.card = attrs["id"].removeprefix("assessment-")
            self.cards.append(self.card)
        if tag == "details":
            earlier = "data-earlier-bounds" in attrs
            if earlier and self.card is None:
                raise ValueError("Earlier bounds must be inside their hypothesis card")
            self.disclosures.append(earlier)
        if "bound-row" in classes:
            self.bound_locations[attrs["id"]] = (self.card, any(self.disclosures), attrs.get("data-superseded-by"))
        if attrs.get("id"):
            if attrs["id"] in self.ids:
                raise ValueError(f"Duplicate HTML ID {attrs['id']}")
            self.ids.add(attrs["id"])
        for key in ("href", "src"):
            if attrs.get(key):
                self.links.append(attrs[key])

    def handle_endtag(self, tag):
        if tag == "article":
            self.card = None
            self.problem_group = False
        if tag == "h3":
            self.problem_heading = False
        if tag == "details":
            self.disclosures.pop()


def check():
    pages = {path: Page(path) for path in SITE.rglob("*.html")}
    if SITE / "index.html" not in pages:
        raise ValueError("Build the reader first with npm run site.")
    edges = {path: set() for path in pages}
    for path, page in pages.items():
        for link in page.links:
            url = urlsplit(link)
            if url.scheme in {"https", "mailto"}:
                continue
            if url.scheme or url.netloc or url.path.startswith("/"):
                raise ValueError(f"{path}: link cannot be opened under a project subpath: {link}")
            target = (path.parent / unquote(url.path)).resolve() if url.path else path
            if target.is_dir():
                target = target / "index.html"
            if not target.is_relative_to(SITE) or not target.is_file():
                raise ValueError(f"{path}: missing or out-of-edition target: {link}")
            fragment = unquote(url.fragment)
            if target in pages and fragment and fragment not in pages[target].ids:
                raise ValueError(f"{path}: missing HTML destination: {link}")
            edges[path].add(target)
    seen = set()
    queue = [SITE / "index.html"]
    while queue:
        path = queue.pop()
        if path in seen:
            continue
        seen.add(path)
        queue.extend(edges.get(path, set()) - seen)
    unreachable = pages.keys() - seen
    if unreachable:
        raise ValueError(f"Pages unreachable from catalogue: {unreachable}")
    data = json.loads((SITE / "api/v1/atlas.json").read_text(encoding="utf-8"))
    catalogue = pages[SITE / "index.html"]
    for record in data.get("problems", []):
        problem_path = f"problems/{record['id']}/index.html"
        siblings = [c["id"] for c in data["cases"] if c["problemId"] == record["id"]]
        for case_id in siblings:
            if catalogue.heading_by_case.get(case_id) != problem_path:
                raise ValueError(f"Wrong problem destination for {case_id}")
            if SITE / "cases" / case_id / "index.html" not in edges[SITE / problem_path]:
                raise ValueError(f"Problem {record['id']} omits parameterization {case_id}")
    for paper in data["papers"]:
        paper_page = pages[SITE / "papers" / paper["id"] / "index.html"]
        for edition in paper["editions"]:
            primary = edition.get("preferredUrl")
            if primary and primary not in paper_page.links:
                raise ValueError(f"Missing primary link for {paper['id']}/{edition['id']}")
    for case in data["cases"]:
        problem = pages[SITE / "cases" / case["id"] / "index.html"]
        ids = [h["id"] for h in data["assumptions"]]
        expected = [h for h in data.get("releaseHypotheses", ids) if h in ids]
        expected += [h for h in ids if h not in expected]
        if problem.cards != expected:
            raise ValueError(f"Missing or misordered hypothesis cards on {case['id']}")
        for bound in case["bounds"]:
            owner = bound["assumptions"][0]["id"]
            location = problem.bound_locations.get(bound["id"])
            if not location or location[0] != owner or location[1] != bool(location[2]):
                raise ValueError(f"Misplaced bound on {case['id']}: {bound['id']}")
            if location[1] and problem.bound_locations.get(location[2]) != (owner, False, None):
                raise ValueError(f"Earlier bound {bound['id']} lacks a current superseding bound under {owner}")
            detail = SITE / "bounds" / case["id"] / bound["id"] / "index.html"
            if detail not in pages:
                raise ValueError(f"Missing current statement page for {case['id']}/{bound['id']}")
            sections = {"statement", "cite"}
            if bound["proofs"]:
                sections.add("proof")
            for hypothesis, assessment in bound["assessments"].items():
                if assessment.get("verdict") == "established-equivalent":
                    sections.add(hypothesis)
            for formulation in data.get("formulations", []):
                if bound["supported"] and bound["status"] == "established" and any(
                    e["caseId"] == case["id"] and e["boundId"] == bound["id"]
                    and e["boundRevision"] == bound["revision"] for e in formulation["equivalences"]
                ):
                    sections.add(formulation["id"])
            missing = sections - pages[detail].ids
            if missing:
                raise ValueError(f"Missing statement sections on {detail}: {missing}")
    digest = lambda p: hashlib.sha256(p.read_bytes()).digest()
    linked_artifacts = {digest(path) for path in seen if path.suffix in {".pdf", ".tex"}}
    for proof in data["proofs"]:
        for revision in proof["revisions"]:
            for key in ("source", "pdf"):
                if digest(ROOT / revision[key]) not in linked_artifacts:
                    raise ValueError(f"Missing or altered {key} for {proof['id']}")
    print(f"Checked {len(pages)} HTML pages, plus all registered proof PDFs and sources.")


if __name__ == "__main__":
    check()
