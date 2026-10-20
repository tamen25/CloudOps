# Runner image for the in-VPC runner set (modules/ci-runner, ADR 025).
#
# The GitHub runner image already has git, jq, unzip, curl and python3;
# setup-terraform and setup-node download their own binaries per job. This
# adds what the cluster jobs call directly: the AWS CLI, kubectl and envsubst.
# Every download is pinned by checksum, so a rebuild cannot pick up
# different bytes under the same version.
#
# Built, scanned and pushed by .github/workflows/runner-image.yml.

FROM ghcr.io/actions/actions-runner:2.338.0@sha256:4ffadc0002b2581327e06101fc8c06cd189232baf79fe561fac9caeb76f5e807

ARG AWS_CLI_VERSION=2.38.2
# sha256 of awscli-exe-linux-x86_64-2.38.2.zip; its PGP signature was
# checked against the AWS CLI team key (FB5D B77F D5C1 18B8 0511 ADA8 A631
# 0ACC 4672 475C) when this was pinned.
ARG AWS_CLI_SHA256=16a4d39d60b631d884f1260fd7755b72daef15baf6cac21131c6c71676164b37
# Same minor as the cluster (stacks/cluster kubernetes_version).
ARG KUBECTL_VERSION=v1.35.9
# Published at dl.k8s.io/release/v1.35.9/bin/linux/amd64/kubectl.sha256
ARG KUBECTL_SHA256=3cfeaf80be482b435b0aa214aff6e0b2c312ee23c0ff20810c75517b6004c6eb

USER root
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
 && apt-get install -y --no-install-recommends gettext-base \
 && rm -rf /var/lib/apt/lists/*

# The runner runs JavaScript actions with its bundled node and never calls
# the npm bundled beside it. node20's npm carries tar 6.2.1 (CVE-2026-59873,
# critical), which fails the image scan; jobs that need npm install their own
# with setup-node.
RUN rm -rf /home/runner/externals/node20/lib/node_modules/npm \
           /home/runner/externals/node20/bin/npm \
           /home/runner/externals/node20/bin/npx

RUN curl -fsSL -o /tmp/awscli.zip "https://awscli.amazonaws.com/awscli-exe-linux-x86_64-${AWS_CLI_VERSION}.zip" \
 && echo "${AWS_CLI_SHA256}  /tmp/awscli.zip" | sha256sum -c - \
 && unzip -q /tmp/awscli.zip -d /tmp \
 && /tmp/aws/install \
 && rm -rf /tmp/aws /tmp/awscli.zip \
 && aws --version

RUN curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
 && echo "${KUBECTL_SHA256}  /usr/local/bin/kubectl" | sha256sum -c - \
 && chmod 0755 /usr/local/bin/kubectl \
 && kubectl version --client

USER runner
