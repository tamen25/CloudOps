<!-- This document explains library publishing for CloudOps. -->
# Library Publishing

CloudOps client libraries are published to AWS CodeArtifact.

## Infrastructure

The foundation stack owns CodeArtifact:

- `enable_codeartifact`
- `codeartifact_domain_name`
- `codeartifact_repository_names`
- `codeartifact_kms_key_arn`

The default domain is `<project_name>-<environment>`, and the default
repositories are:

- `cloudops-nodejs` for npm
- `cloudops-java` for Maven
- `cloudops-dotnet` for NuGet
- `cloudops-python` for PyPI/Twine

Apply the foundation stack after enabling CodeArtifact:

```bash
STACK=foundation ./scripts/tf-init.sh
terraform -chdir=stacks/foundation apply -var-file=../../environments/dev.tfvars
```

## Node.js Libraries

Current library roots:

- `libraries/nodejs/logs` -> `@cloudops/otel-logs`
- `libraries/nodejs/metrics` -> `@cloudops/otel-metrics`
- `libraries/nodejs/traces` -> `@cloudops/otel-traces`

The publish workflow skips a package until it contains `src/index.ts` or
`src/index.js`.

## Java Libraries

Current library roots:

- `libraries/java/logs` -> `com.cloudops:otel-logs`

The publish workflow deploys Maven packages to the `cloudops-java`
CodeArtifact repository.

## .NET Libraries

Current library roots:

- `libraries/dotnet/logs` -> `CloudOps.Otel.Logs`

The publish workflow packs NuGet packages and pushes them to the
`cloudops-dotnet` CodeArtifact repository.

## Python Libraries

Current library roots:

- `libraries/python/logs` -> `cloudops-otel-logs`

The publish workflow builds Python distributions and uploads them to the
`cloudops-python` CodeArtifact repository with Twine.

## Go Libraries

Current library roots:

- `libraries/go/logs` -> `github.com/cloudops/otel-logs`

The PR workflow runs `go test ./...` for the Go logs module.

## C++ Libraries

Current library roots:

- `libraries/cpp/logs` -> `cloudops_otel_logs`

The PR workflow configures the CMake project, builds it, and runs CTest.

## Consuming Node Packages From Lambda

Lambda code imports packages normally:

```js
const { logger } = require('@cloudops/otel-logs');
```

Add the package to the Lambda `package.json`:

```json
{
  "dependencies": {
    "@cloudops/otel-logs": "^0.1.0"
  }
}
```

Then log npm into CodeArtifact before installing dependencies:

```bash
export AWS_REGION=us-east-1
export CODEARTIFACT_DOMAIN=cloudops-dev
export CODEARTIFACT_REPOSITORY=cloudops-nodejs

aws codeartifact login \
  --tool npm \
  --domain "$CODEARTIFACT_DOMAIN" \
  --repository "$CODEARTIFACT_REPOSITORY" \
  --region "$AWS_REGION"

npm ci --omit=dev
```

For the in-repo Lambda modules, `scripts/build-lambdas.sh` performs the
CodeArtifact login automatically when `CODEARTIFACT_DOMAIN` and
`CODEARTIFACT_REPOSITORY` are set. Terraform does not download npm packages;
it zips each Lambda directory after this script has installed `node_modules`.

The Lambda runtime itself never reaches CodeArtifact. Dependencies must be
installed during build and packaged into the Lambda zip or container image.

## CI

`.github/workflows/libraries.yml` validates package manifests, builds the
implemented libraries, and runs tests with coverage gates on PRs.
On push to `main` or manual dispatch, it assumes the GitHub Actions AWS role,
logs in to CodeArtifact, and runs the language publish scripts:

```bash
bash scripts/publish-node-packages.sh
bash scripts/publish-java-packages.sh
bash scripts/publish-dotnet-packages.sh
bash scripts/publish-python-packages.sh
```

To control which language packages are published, set the optional
`publish_languages` input when running the workflow manually. Leave it blank to
use the repository default. Accepted values are comma-separated and
case-insensitive:

- `all`
- `none`
- `nodejs`
- `java`
- `dotnet`
- `python`

Aliases such as `node`, `npm`, `.net`, `nuget`, `py`, and `pypi` are accepted.
For example, `nodejs,python` publishes only npm and PyPI packages. Go and C++
are validation-only for now, so they are not publish selector options yet.

Current library quality gates:

- Node.js logs: Node test runner with built-in V8 coverage, minimum 60% lines.
- Java logs: JUnit 5 with JaCoCo, minimum 40% lines.
- .NET logs: xUnit with coverlet, minimum 40% lines.
- Python logs: `coverage.py`, minimum 70% lines.
- Go logs: `go test` with coverprofile, minimum 65% statements.
- C++ logs: CTest plus gcovr in CI, minimum 35% lines.

Set these GitHub Actions variables only if the defaults are not right:

- `CODEARTIFACT_DOMAIN`
- `CODEARTIFACT_REPOSITORY` for backward-compatible Node.js override
- `CODEARTIFACT_NODEJS_REPOSITORY`
- `CODEARTIFACT_JAVA_REPOSITORY`
- `CODEARTIFACT_DOTNET_REPOSITORY`
- `CODEARTIFACT_PYTHON_REPOSITORY`
- `CODEARTIFACT_DOMAIN_OWNER`
- `LIBRARY_PUBLISH_LANGUAGES` for the default publish list on non-PR runs

The workflow default assumes `project_name = "cloudops"` and publishes to
`cloudops-<environment>`. Set `CODEARTIFACT_DOMAIN` if your project name differs.
