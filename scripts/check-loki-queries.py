#!/usr/bin/env python3
"""Fail when a dashboard or alert selects Loki streams by a label Loki does
not have.

Logs reach Loki over OTLP, and Loki 3 turns a fixed set of resource
attributes into stream labels, dots to underscores (k8s.namespace.name ->
k8s_namespace_name). Everything else, severity included, is structured
metadata, filtered after the selector (`| severity_text=~...`). A selector
on any other label matches nothing, silently: the Logs Explorer dashboard
and the log-volume alert used `namespace` and `level` and were always empty.

Checks the stream selectors of every Loki query in
modules/observability/dashboards/*.json (by panel or target datasource) and
the LogQL expressions in modules/observability/grafana_native_alerts.tf.

    python3 scripts/check-loki-queries.py
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OBS = ROOT / "modules" / "observability"

# Loki 3's default otlp_config resource attributes indexed as labels.
OTLP_LABELS = {
    "service_name", "service_namespace", "service_instance_id",
    "deployment_environment", "deployment_environment_name",
    "cloud_region", "cloud_availability_zone",
    "k8s_cluster_name", "k8s_namespace_name", "k8s_pod_name", "k8s_container_name",
    "container_name", "k8s_replicaset_name", "k8s_deployment_name",
    "k8s_statefulset_name", "k8s_daemonset_name", "k8s_cronjob_name", "k8s_job_name",
}

# The stream selector is the first {...} of a LogQL expression.
SELECTOR = re.compile(r"\{([^{}]*)\}")
MATCHER = re.compile(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*(=~|!~|!=|=)")


def selector_labels(expr: str) -> list[str]:
    m = SELECTOR.search(expr)
    if not m:
        return []
    return [mm.group(1) for mm in MATCHER.finditer(m.group(1)) if mm.group(1)]


def is_loki(ds) -> bool:
    if isinstance(ds, dict):
        return "loki" in str(ds.get("type", "")).lower() or "loki" in str(ds.get("uid", "")).lower()
    return "loki" in str(ds).lower()


def dashboard_queries(path: pathlib.Path):
    doc = json.loads(path.read_text(encoding="utf-8"))

    def walk(node, inherited_loki: bool):
        if isinstance(node, dict):
            loki = is_loki(node["datasource"]) if "datasource" in node else inherited_loki
            if loki and isinstance(node.get("expr"), str):
                yield node["expr"]
            for value in node.values():
                yield from walk(value, loki)
        elif isinstance(node, list):
            for value in node:
                yield from walk(value, inherited_loki)

    yield from walk(doc.get("panels", []), False)
    for var in doc.get("templating", {}).get("list", []):
        q = var.get("query")
        if is_loki(var.get("datasource")) and isinstance(q, str):
            yield q


def alert_queries(path: pathlib.Path):
    # LogQL expressions in the alert file: those with a line filter or a
    # LogQL range aggregation over a stream selector.
    text = path.read_text(encoding="utf-8").replace('\\"', '"')
    for m in re.finditer(r'expr\s*=\s*"(.*)"\s*$', text, re.M):
        expr = m.group(1)
        if re.search(r"(count_over_time|rate|bytes_over_time)\(\{", expr) and re.search(r"\|[=~]", expr):
            yield expr


def main() -> int:
    problems = []
    sources = [(p, dashboard_queries(p)) for p in sorted((OBS / "dashboards").glob("*.json"))]
    alerts = OBS / "grafana_native_alerts.tf"
    if alerts.exists():
        sources.append((alerts, alert_queries(alerts)))
    checked = 0
    for path, queries in sources:
        for expr in queries:
            checked += 1
            for label in selector_labels(expr):
                if label not in OTLP_LABELS:
                    problems.append(f"{path.relative_to(ROOT)}: Loki has no `{label}` label: {expr}")
    for p in problems:
        print(p)
    print(f"{checked} Loki queries checked, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
