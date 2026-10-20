#!/usr/bin/env python3
"""Fails when a helm_release pins a chart version its repository does not
publish. Terraform cannot see that until apply: the YACE release pinned
0.39.0, a version that was never published.

Reads every helm_release under modules/ with an https repository and a
version, and looks the version up in the repository's index.yaml. OCI
repositories are skipped (no index to read without a registry client).
"""

import pathlib
import re
import sys
import urllib.error
import urllib.request

# The largest index here (prometheus-community) is about 15 MB.
MAX_INDEX_BYTES = 64 * 1024 * 1024
ROOT = pathlib.Path(__file__).resolve().parent.parent
RELEASE = re.compile(r'resource "helm_release" "(\w+)" \{(.*?)\n\}', re.S)


def attr(body: str, key: str) -> str | None:
    m = re.search(rf'\n\s*{key}\s*=\s*"([^"]+)"', body)
    return m.group(1) if m else None


def published(index: str, chart: str) -> set[str]:
    m = re.search(rf"\n  {re.escape(chart)}:\n(.*?)(?=\n  [^\s-]|\Z)", index, re.S)
    return set(re.findall(r"\n\s+version: ['\"]?([^\s'\"]+)", m.group(1))) if m else set()


def fetch_index(repo: str) -> str:
    # Some chart hosts answer 403 to urllib's default User-Agent.
    url = repo.rstrip("/") + "/index.yaml"
    req = urllib.request.Request(url, headers={"User-Agent": "Helm/3.16"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read(MAX_INDEX_BYTES).decode("utf-8")
    except urllib.error.URLError as err:
        raise SystemExit(f"cannot read {url}: {err}") from err


def main() -> int:
    indexes: dict[str, str] = {}
    failures, checked = [], 0
    for tf in sorted(ROOT.glob("modules/**/*.tf")):
        if ".terraform" in tf.parts:
            continue
        for name, body in RELEASE.findall(tf.read_text(encoding="utf-8")):
            repo, chart, version = attr(body, "repository"), attr(body, "chart"), attr(body, "version")
            if not (repo and chart and version) or not repo.startswith("https://"):
                continue
            if repo not in indexes:
                indexes[repo] = fetch_index(repo)
            checked += 1
            if version not in published(indexes[repo], chart):
                failures.append(f"{tf.relative_to(ROOT).as_posix()}: helm_release.{name}: {chart} {version} is not published at {repo}")
    for line in failures:
        print(line)
    print(f"{checked} chart pins checked, {len(failures)} not published")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
