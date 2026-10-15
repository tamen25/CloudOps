#!/usr/bin/env python3
"""Generate AWS architecture diagrams for CloudOps.

Source of truth: architecture/data-flows.md (verified 2026-06-07). Each diagram
below mirrors one verified flow. Regenerate after data-flows.md changes:

    # Windows (Graphviz on PATH):
    set "PATH=C:\\Program Files\\Graphviz\\bin;%PATH%"
    python architecture/generate_diagrams.py

Outputs PNGs into architecture/diagrams/. Requires: graphviz + `pip install diagrams`.
"""

import os

from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import EKS, Lambda, EC2
from diagrams.aws.database import RDS, Dynamodb
from diagrams.aws.analytics import KinesisDataStreams
from diagrams.aws.integration import StepFunctions, SQS, Eventbridge
from diagrams.aws.engagement import SimpleEmailServiceSes
from diagrams.aws.security import Cognito, WAF, IAMRole, KMS, Guardduty, SecretsManager
from diagrams.aws.network import (
    ELB, CloudFront, VPC, NATGateway, InternetGateway,
    PrivateSubnet, PublicSubnet, Route53, APIGateway,
)
from diagrams.aws.management import Cloudwatch
from diagrams.aws.devtools import Codeartifact
from diagrams.onprem.client import Users
from diagrams.onprem.monitoring import Grafana, Mimir, Prometheus
from diagrams.onprem.logging import Loki
from diagrams.onprem.tracing import Tempo
from diagrams.onprem.ci import GithubActions
from diagrams.onprem.vcs import Github
from diagrams.onprem.container import Docker
from diagrams.aws.compute import ECR
from diagrams.aws.security import Inspector
from diagrams.custom import Custom

OUT_DIR = os.path.join(os.path.dirname(__file__), "diagrams")
ICON_DIR = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(OUT_DIR, exist_ok=True)

OTEL_ICON = os.path.join(ICON_DIR, "opentelemetry.png")


def OTel(label):
    """OpenTelemetry Collector node using the official OTel icon."""
    return Custom(label, OTEL_ICON)

# Dark theme to match the storefront (bg #0d1117 / raised #161b22). Bold sans,
# light high-contrast text + lines, high DPI for crisp PNG text. Cluster boxes
# use a faint light stroke so they read on the dark canvas.
FONT = "Helvetica-Bold"
BG = "#161b22"       # site bg-raised — diagram canvas
INK = "#e6edf3"      # near-white label text
LINE = "#8b98a8"     # light, high-contrast edge color
CLUSTER_BORDER = "#30363d"
GRAPH_ATTR = {
    "fontsize": "24",
    "fontname": FONT,
    "fontcolor": INK,
    "bgcolor": BG,
    "color": CLUSTER_BORDER,   # cluster box outline
    "pencolor": CLUSTER_BORDER,
    "pad": "0.6",
    "dpi": "150",
    "splines": "spline",
}
NODE_ATTR = {
    "fontname": FONT,
    "fontsize": "15",
    "fontcolor": INK,
    "penwidth": "1.6",
}
EDGE_ATTR = {
    "fontname": FONT,
    "fontsize": "13",
    "fontcolor": INK,
    "color": LINE,
    "penwidth": "2.0",
    "arrowsize": "0.9",
}

# Dark cluster boxes (override the diagrams lib default light-blue fill).
CLUSTER_ATTR = {
    "bgcolor": "#0d1117",
    "pencolor": CLUSTER_BORDER,
    "fontname": FONT,
    "fontcolor": INK,
    "fontsize": "14",
    "penwidth": "1.4",
    "style": "rounded",
}


def _path(name: str) -> str:
    return os.path.join(OUT_DIR, name)


# ── 1. Mesh fan-out ──────────────────────────────────────────────────────────
# loadgen → api-gateway → pricing(Go) → inventory(Py) → fraud(Java)
#         → payment(Node) → ledger(Go)   [api-gateway/src/app.ts, payment/src/app.ts]
with Diagram(
    "CloudOps — Mesh Fan-out (polyglot place-order)",
    filename=_path("01_mesh_fanout"),
    show=False,
    direction="LR",
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    loadgen = EC2("loadgen\n(synthetic)")
    with Cluster("EKS · polyglot mesh", graph_attr=CLUSTER_ATTR):
        gw = EKS("api-gateway\nNode · BFF+HMAC")
        pricing = EKS("pricing\nGo · /quote")
        inventory = EKS("inventory\nPython · /reserve")
        fraud = EKS("fraud\nJava · /score")
        payment = EKS("payment\nNode · /authorize")
        ledger = EKS("ledger\nGo · /entries")

    loadgen >> Edge(label="/place-order") >> gw
    gw >> Edge(label="1") >> pricing
    gw >> Edge(label="2") >> inventory
    gw >> Edge(label="3") >> fraud
    gw >> Edge(label="4") >> payment
    payment >> Edge(label="HMAC post") >> ledger


# ── 2. Async events (post-commit fan-out) ────────────────────────────────────
# order-api → Kinesis → enrichment lambda → EventBridge → analytics lambda (EMF metrics)
with Diagram(
    "CloudOps — Async Events (post-commit)",
    filename=_path("02_async_events"),
    show=False,
    direction="LR",
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    order_api = EKS("order-api\nPOST /order")
    kinesis = KinesisDataStreams("Kinesis\ntenant-partitioned")
    enrich = Lambda("enrichment lambda")
    bus = Eventbridge("EventBridge\nmesh bus")
    analytics = Lambda("analytics lambda\nEMF metrics")
    cw = Cloudwatch("CloudWatch\nmetrics")

    order_api >> Edge(label="PutRecord") >> kinesis >> enrich >> bus >> analytics >> cw


# ── 3. Projection read (CQRS-style) ──────────────────────────────────────────
# Kinesis → projection-worker (Python) → in-memory read model
with Diagram(
    "CloudOps — Projection Read (CQRS)",
    filename=_path("03_projection_read"),
    show=False,
    direction="LR",
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    kinesis = KinesisDataStreams("Kinesis\n(same stream)")
    worker = EKS("projection-worker\nPython · poller")
    readmodel = EC2("read model\nper-tenant · in-mem")

    kinesis >> Edge(label="GetRecords") >> worker >> Edge(label="apply") >> readmodel


# ── 4. Checkout saga ─────────────────────────────────────────────────────────
# storefront /api/checkout → order-api /order (create) → Step Functions (EnqueueEmail)
#   → SQS email → email lambda → SES
with Diagram(
    "CloudOps — Checkout Saga",
    filename=_path("04_checkout_saga"),
    show=False,
    direction="LR",
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    storefront = EKS("storefront\n/api/checkout")
    order_api = EKS("order-api\n/order · RLS write")
    sfn = StepFunctions("Step Functions\nStandard · EnqueueEmail")
    sqs = SQS("SQS · email\n+ DLQ")
    email = Lambda("email lambda")
    ses = SimpleEmailServiceSes("SES (v2)")

    storefront >> Edge(label="create order") >> order_api
    order_api >> Edge(label="StartExecution") >> sfn
    sfn >> Edge(label="sendMessage") >> sqs >> email >> ses


# ── 5. Observability ─────────────────────────────────────────────────────────
# apps → OTel → Mimir/Loki/Tempo ;  CloudWatch → yace → Prometheus ; all → Grafana
with Diagram(
    "CloudOps — Observability",
    filename=_path("05_observability"),
    show=False,
    direction="LR",
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    with Cluster("EKS workloads", graph_attr=CLUSTER_ATTR):
        apps = EKS("storefront · order-api\napi-gateway · mesh")
    cw = Cloudwatch("CloudWatch\nAWS/RDS,ALB,Lambda…")

    with Cluster("monitoring ns", graph_attr=CLUSTER_ATTR):
        otel = OTel("OTel Collector\nOTLP")
        yace = Prometheus("yace\nCW exporter")
        mimir = Mimir("Mimir\nmetrics")
        loki = Loki("Loki\nlogs")
        tempo = Tempo("Tempo\ntraces · svc graph")
        grafana = Grafana("Grafana\ndashboards · alerts")

    apps >> Edge(label="OTLP") >> otel
    otel >> mimir
    otel >> loki
    otel >> tempo
    cw >> Edge(label="scrape") >> yace >> Edge(label="metrics") >> mimir
    mimir >> grafana
    loki >> grafana
    tempo >> grafana


# ── 6. Full picture ──────────────────────────────────────────────────────────
# Full picture: give it room to breathe. Generous rank/node spacing + curved
# splines keep the many crossings legible instead of the cramped ortho look.
FULL_ATTR = {
    **GRAPH_ATTR,
    "ranksep": "1.3",
    "nodesep": "0.85",
    "compound": "true",
    "splines": "spline",  # clean curves — ortho looked dirty with this many edges
    "concentrate": "false",
}

with Diagram(
    "CloudOps — Full Architecture",
    filename=_path("06_full_architecture"),
    show=False,
    direction="TB",
    graph_attr=FULL_ATTR,
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    users = Users("Browser · Mobile")
    edge = ELB("ALB + WAF")
    cdn = CloudFront("CloudFront\nassets")

    with Cluster("EKS · Kubernetes", graph_attr=CLUSTER_ATTR):
        storefront = EKS("storefront")
        order_api = EKS("order-api")
        with Cluster("polyglot mesh", graph_attr=CLUSTER_ATTR):
            gw = EKS("api-gateway")
            pricing = EKS("pricing · Go")
            inventory = EKS("inventory · Py")
            fraud = EKS("fraud · Java")
            payment = EKS("payment · Node")
            ledger = EKS("ledger · Go")
            # Force a 2-row grid for the mesh (invisible edges) so 6 services
            # don't stretch the whole diagram into one wide rank.
            pricing >> Edge(style="invis") >> fraud
            inventory >> Edge(style="invis") >> payment

    with Cluster("Data", graph_attr=CLUSTER_ATTR):
        cognito = Cognito("Cognito")
        rds = RDS("RDS Postgres\nRLS FORCE")
        cart = Dynamodb("DynamoDB cart")
        kinesis = KinesisDataStreams("Kinesis")
        sfn = StepFunctions("Step Functions")
        sqs = SQS("SQS email")
        bus = Eventbridge("EventBridge")

    with Cluster("Serverless", graph_attr=CLUSTER_ATTR):
        enrich = Lambda("enrichment lambda")
        analytics = Lambda("analytics lambda")
        email = Lambda("email lambda")

    with Cluster("Observability", graph_attr=CLUSTER_ATTR):
        cw = Cloudwatch("CloudWatch")
        otel = OTel("OTel Collector")
        yace = Prometheus("yace")
        mimir = Mimir("Mimir")
        loki = Loki("Loki")
        tempo = Tempo("Tempo")
        grafana = Grafana("Grafana")

    with Cluster("CI/CD", graph_attr=CLUSTER_ATTR):
        gha = GithubActions("GitHub Actions\nOIDC")
        build = Docker("build + Cosign")
        ecr = ECR("ECR\nsigned image")
        scan = Inspector("Trivy scan")

    libs = Codeartifact("client libraries\n(published, not runtime)")

    users >> edge
    edge >> storefront
    edge >> order_api
    edge >> gw
    cdn >> storefront
    storefront >> cognito
    order_api >> rds
    order_api >> kinesis
    storefront >> cart
    storefront >> sfn >> sqs >> email
    # mesh
    gw >> pricing
    gw >> inventory
    gw >> fraud
    gw >> payment >> ledger
    # async
    kinesis >> enrich >> bus >> analytics
    # observability
    [storefront, order_api, gw] >> Edge(style="dashed") >> otel
    otel >> mimir
    otel >> loki
    otel >> tempo
    cw >> yace >> mimir
    [mimir, loki, tempo] >> Edge(style="dashed") >> grafana
    # ci/cd: self-contained pipeline shown to the side (like client libraries) —
    # the deploy target is the EKS cluster above; we omit the cross-diagram edge
    # to keep the runtime graph clean.
    gha >> build >> ecr >> scan


# ── 7. Networking / VPC ──────────────────────────────────────────────────────
# Source: architecture/networking-architecture.md + complete-architecture.md.
# VPC 10.0.0.0/16, 2 AZs, public/private/db subnets. (Platform runs EKS, not the
# legacy "ECS" wording in the older doc.)
with Diagram(
    "CloudOps — Networking (VPC · 2 AZs)",
    filename=_path("07_networking"),
    show=False,
    direction="TB",
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    dns = Route53("Route 53")
    igw = InternetGateway("Internet Gateway")

    with Cluster("VPC 10.0.0.0/16", graph_attr=CLUSTER_ATTR):
        with Cluster("Public subnets (10.0.0.0/24, 10.0.1.0/24)", graph_attr=CLUSTER_ATTR):
            alb = ELB("ALB + WAF")
            nat = NATGateway("NAT GW ×2")
        with Cluster("Private subnets (10.0.10.0/24, 10.0.11.0/24)", graph_attr=CLUSTER_ATTR):
            eks = EKS("EKS nodes\n(pods)")
        with Cluster("DB subnets (10.0.20.0/24, 10.0.21.0/24)", graph_attr=CLUSTER_ATTR):
            rds = RDS("RDS Postgres\nMulti-AZ")

    dns >> igw >> alb >> Edge(label="SG: ALB→pods") >> eks
    eks >> Edge(label="SG: pods→5432") >> rds
    eks >> Edge(label="egress") >> nat >> igw


# ── 8. Security ───────────────────────────────────────────────────────────────
# Source: data-flows.md (auth, RLS, HMAC), modules/{auth,security,bootstrap}.
with Diagram(
    "CloudOps — Security",
    filename=_path("08_security"),
    show=False,
    direction="LR",
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    users = Users("Users")
    waf = WAF("WAF\n5 managed rules")
    cognito = Cognito("Cognito\nPKCE · JWT")

    with Cluster("EKS", graph_attr=CLUSTER_ATTR):
        apps = EKS("storefront · order-api\napi-gateway · mesh")

    with Cluster("Secrets & keys", graph_attr=CLUSTER_ATTR):
        secrets = SecretsManager("Secrets Manager")
        kms = KMS("KMS")
        iam = IAMRole("IRSA roles")

    rds = RDS("RDS\nRLS FORCE")
    gd = Guardduty("GuardDuty")

    users >> waf >> apps
    apps >> Edge(label="OIDC") >> cognito
    apps >> Edge(label="IRSA") >> iam >> secrets
    secrets >> Edge(label="encrypt") >> kms
    apps >> Edge(label="tenant RLS / HMAC") >> rds
    gd >> Edge(style="dashed", label="threat detection") >> apps


# ── 9. Data layer ─────────────────────────────────────────────────────────────
with Diagram(
    "CloudOps — Data Layer",
    filename=_path("09_data_layer"),
    show=False,
    direction="LR",
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    with Cluster("EKS producers", graph_attr=CLUSTER_ATTR):
        order_api = EKS("order-api")
        storefront = EKS("storefront")

    rds = RDS("RDS Postgres\norders · audit · idempotency")
    cart = Dynamodb("DynamoDB\ncart")
    kinesis = KinesisDataStreams("Kinesis\norder events")

    with Cluster("Consumers", graph_attr=CLUSTER_ATTR):
        enrich = Lambda("enrichment lambda")
        projection = EKS("projection-worker")

    order_api >> Edge(label="RLS write") >> rds
    order_api >> Edge(label="PutRecord") >> kinesis
    storefront >> Edge(label="cart ops") >> cart
    kinesis >> enrich
    kinesis >> projection


# ── 10. CI/CD — app deploy pipeline ───────────────────────────────────────────
# .github/workflows/app.yml job graph:
# test → manifest-validation → build-and-push (buildx + Cosign keyless → ECR)
#   → image-scan (Trivy) → budget-check → deploy (Cosign verify → kubectl → EKS)
#   → integration-test → notify
with Diagram(
    "CloudOps — CI/CD: App Deploy (app.yml)",
    filename=_path("10_cicd_app"),
    show=False,
    direction="LR",
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    gh = Github("push / PR / dispatch")
    actions = GithubActions("GitHub Actions\nOIDC → AWS")

    with Cluster("pipeline (app.yml)", graph_attr=CLUSTER_ATTR):
        test = GithubActions("test\nlint · unit · openapi")
        manifest = GithubActions("manifest-validation\nkubeconform")
        build = Docker("build-and-push\nbuildx + Cosign sign")
        ecr = ECR("ECR\nsigned image")
        scan = Inspector("image-scan\nTrivy HIGH+")
        budget = GithubActions("budget-check")
        deploy = GithubActions("deploy\nCosign verify · kubectl")
        integ = GithubActions("integration-test")
        notify = GithubActions("notify")

    target = EKS("EKS\nrollout")

    gh >> actions >> test >> manifest >> build
    build >> Edge(label="push digest") >> ecr
    build >> scan >> budget >> deploy
    deploy >> Edge(label="apply + rollout") >> target
    deploy >> integ >> notify


# ── 11. CI/CD — infra pipeline ────────────────────────────────────────────────
# .github/workflows/infra.yml:
# quality → plan → security-scan → approve (prod env gate) → apply → compliance-scan
with Diagram(
    "CloudOps — CI/CD: Infra (infra.yml)",
    filename=_path("11_cicd_infra"),
    show=False,
    direction="LR",
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    gh = Github("push / PR / dispatch")

    with Cluster("pipeline (infra.yml)", graph_attr=CLUSTER_ATTR):
        quality = GithubActions("quality\nfmt · validate · tflint")
        plan = GithubActions("plan\nterraform plan")
        sec = Inspector("security-scan\ntfsec · trivy · checkov")
        approve = GithubActions("approve\nprod env gate")
        apply = GithubActions("apply\nterraform apply")
        compliance = Inspector("compliance-scan")

    aws = Cloudwatch("AWS\n(layered stacks)")

    gh >> quality >> plan >> sec >> approve >> apply
    apply >> Edge(label="provision") >> aws
    apply >> compliance


print("Generated diagrams in:", OUT_DIR)
for f in sorted(os.listdir(OUT_DIR)):
    print("  -", f)
