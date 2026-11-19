"""Rebuild the edition's registered LaTeX proofs and verify their theorem links."""

import json
import hashlib
import os
import re
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(*args, cwd=None, env=None):
    return subprocess.run(
        args, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, check=True, timeout=120,
    ).stdout


def destinations(pdf):
    table = run("pdfinfo", "-dests", pdf)
    return set(re.findall(r'^\s*\d+\s+\[.*?\]\s+"([^"]+)"', table, re.MULTILINE))


def pages(pdf):
    return int(re.search(r"^Pages:\s+(\d+)", run("pdfinfo", pdf), re.MULTILINE)[1])


def inside(path):
    target = (ROOT / path).resolve(strict=True)
    if not target.is_relative_to(ROOT):
        raise ValueError(f"Artifact outside checkout: {path}")
    return target


def check(proof_id, version):
    source = inside(version["source"])
    original = inside(version["pdf"])
    if source.suffix != ".tex":
        raise ValueError(f"{proof_id}: expected a LaTeX proof")
    env = dict(os.environ, SOURCE_DATE_EPOCH="1794960000", FORCE_SOURCE_DATE="1")
    with tempfile.TemporaryDirectory() as scratch:
        for _ in range(2):
            run("pdflatex", "-no-shell-escape", "-halt-on-error", "-interaction=nonstopmode",
                f"-output-directory={scratch}", source.name, cwd=source.parent, env=env)
        built = Path(scratch) / (source.stem + ".pdf")
        log = built.with_suffix(".log").read_text(errors="replace")
        if re.search(r"(undefined references|Citation .* undefined|Reference .* undefined)", log):
            raise ValueError(f"{proof_id}: unresolved LaTeX references")
        if run("pdftotext", "-layout", original, "-") != run("pdftotext", "-layout", built, "-"):
            raise ValueError(f"{proof_id}: committed PDF text differs from the rebuilt proof")
        for pdf in (original, built):
            named = destinations(pdf)
            for theorem in version["theorems"]:
                anchor = theorem["destination"]
                if anchor.startswith("page=") and 1 <= int(anchor[5:]) <= pages(pdf):
                    continue
                if anchor not in named:
                    raise ValueError(f"{proof_id}: missing PDF destination {anchor}")
    print(f"{proof_id} revision {version['revision']}: source, PDF text and theorem links checked")


def check_review_digest(review, sources):
    target = review["object"]
    if target["type"] != "proof" or review["verdict"] != "verified":
        return
    path = inside(sources[target["id"], target["revision"]])
    actual = hashlib.sha256(path.read_text(encoding="utf-8").encode("utf-8")).hexdigest()
    if review.get("sourceSha256") != actual:
        raise ValueError(f"{review['id']}: reviewed revision differs from the proof source")
    if review["evidence"].startswith("https://"):
        return
    note = inside(review["evidence"]).read_text(encoding="utf-8")
    if actual not in note:
        raise ValueError(f"{review['id']}: signed-off digest missing from the local review report")


if __name__ == "__main__":
    files = [ROOT / "data/atlas.json", *sorted((ROOT / "data/cases").glob("*.json"))]
    sources = {}
    reviews = []
    for file in files:
        packet = json.loads(file.read_text(encoding="utf-8"))
        for record in [packet, *packet.get("cases", [])]:
            reviews.extend(record.get("reviews", []))
            for proof in record.get("proofs", []):
                for revision in proof["revisions"]:
                    sources[proof["id"], revision["revision"]] = revision["source"]
                    if revision.get("pdf"):
                        check(proof["id"], revision)
    for review in reviews:
        check_review_digest(review, sources)
