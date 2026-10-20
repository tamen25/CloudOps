#!/usr/bin/env python3
"""Checks the GitHub Actions workflows for mistakes actionlint does not see.
Each rule is one that a workflow here broke, unnoticed until read:

  oidc        a job that assumes an AWS role needs `id-token: write`
              (infra.yml's apply had only `contents: read`)
  wrapper     setup-terraform must run with `terraform_wrapper: false`; the
              wrapper adds its own lines to stdout, which then end up in
              every `$(terraform output -raw ...)` (app.yml's deploy)
  kubeconfig  kubectl runs only after `aws eks update-kubeconfig` in the
              same job (app.yml's deploy never had one)
  injection   free-text inputs and PR fields never go into a `run:` script
              as `${{ ... }}`; pass them through env instead
  var-file    a direct `terraform -chdir=stacks/... plan` passes -var-file
              (drift detection planned against variable defaults)

Usage: scripts/check-workflows.py [workflow.yml ...]   (default: all)
"""

import pathlib
import re
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
# kubectl as a command (line start, or after ; && || | $( then do if !), not
# mentioned in a message; `kubectl version --client` needs no cluster.
KUBECTL_COMMAND = re.compile(r"(^|[;&|(!]|\bthen|\bdo|\bif)\s*kubectl\s+(?!version --client)")
UNTRUSTED_EVENT_FIELDS = re.compile(
    r"\$\{\{\s*github\.(head_ref|event\.pull_request\.(title|body|head\.ref|head\.label))\b"
)


def triggers(doc: dict) -> dict:
    # PyYAML reads the bare key `on` as the boolean True.
    on = doc.get("on", doc.get(True)) or {}
    return on if isinstance(on, dict) else {}


def free_text_inputs(doc: dict) -> set[str]:
    names = set()
    for event in ("workflow_dispatch", "workflow_call"):
        spec = triggers(doc).get(event) or {}
        for name, attrs in (spec.get("inputs") or {}).items():
            if (attrs or {}).get("type", "string") == "string":
                names.add(name)
    return names


def has_id_token_write(permissions) -> bool:
    if permissions == "write-all":
        return True
    return isinstance(permissions, dict) and permissions.get("id-token") == "write"


def script_lines(run: str) -> list[str]:
    joined = re.sub(r"\\\n\s*", " ", run)
    return [line for line in joined.splitlines() if not line.strip().startswith("#")]


def check(path: pathlib.Path) -> list[str]:
    doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    problems = []
    free_text = free_text_inputs(doc)
    input_ref = re.compile(
        r"\$\{\{\s*(?:github\.event\.)?inputs\.(" + "|".join(map(re.escape, sorted(free_text))) + r")\b"
    ) if free_text else None

    for job_name, job in (doc.get("jobs") or {}).items():
        steps = job.get("steps") or []
        permissions = job.get("permissions", doc.get("permissions"))
        kubeconfig_seen = False
        for i, step in enumerate(steps):
            where = f"{path.name}: {job_name}: {step.get('name') or step.get('uses') or f'step {i + 1}'}"
            uses = step.get("uses", "")
            with_ = step.get("with") or {}

            if uses.startswith("aws-actions/configure-aws-credentials") and "role-to-assume" in with_:
                if not has_id_token_write(permissions):
                    problems.append(f"{where}: [oidc] assumes an AWS role without `id-token: write`")

            if uses.startswith("hashicorp/setup-terraform"):
                if str(with_.get("terraform_wrapper", "true")).lower() != "false":
                    problems.append(f"{where}: [wrapper] set `terraform_wrapper: false`")

            run = step.get("run")
            if not isinstance(run, str):
                continue
            for line in script_lines(run):
                if "aws eks update-kubeconfig" in line:
                    kubeconfig_seen = True
                elif KUBECTL_COMMAND.search(line) and not kubeconfig_seen:
                    problems.append(f"{where}: [kubeconfig] kubectl before `aws eks update-kubeconfig`")
                    kubeconfig_seen = True  # one report per job
                if re.search(r"terraform\s+-chdir=\S*stacks/(?:\$\{\{.*?\}\}|\S)+\s+plan\b", line) and "-var-file" not in line:
                    problems.append(f"{where}: [var-file] terraform plan without -var-file")
            if input_ref and input_ref.search(run):
                problems.append(f"{where}: [injection] free-text input in run:; pass it through env")
            if UNTRUSTED_EVENT_FIELDS.search(run):
                problems.append(f"{where}: [injection] pull request field in run:; pass it through env")
    return problems


def main() -> int:
    paths = [pathlib.Path(p) for p in sys.argv[1:]] or sorted((ROOT / ".github/workflows").glob("*.yml"))
    problems = [p for path in paths for p in check(path)]
    for p in problems:
        print(p)
    print(f"{len(paths)} workflows checked, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
