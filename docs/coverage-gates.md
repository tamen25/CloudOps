# Coverage Gates

Source of truth for backlog #65, #67, #68, #69. Each implemented package has
an explicit, locally runnable coverage command, an explicit covered scope,
and a CI threshold that fails the job when coverage drops below it. There is
no SonarQube — these gates are the contract.

## Per-package matrix

| Package | Command | Scope | Excluded | Lines | Branches | Functions |
|---------|---------|-------|----------|-------|----------|-----------|
| `apps/order-api` | `npm run test:coverage` | `src/**/*.ts` | `src/server.ts`, `src/migrate.ts`, `src/tracing.ts` (process-bootstrap entrypoints) | 100 | 85 | 90 |
| `libraries/nodejs/logs` | `npm run test:coverage` | `dist/**/*.js` (compiled from `src/`) | `dist/index.js` (re-export only) | 68 | 60 | 75 |
| `libraries/python/logs` | `python -m coverage run --source=src/cloudops_otel_logs -m unittest discover -s tests` then `python -m coverage report --fail-under=70` | `src/cloudops_otel_logs/` | `tests/`, `__init__.py` (re-export) | 70 | — | — |
| `libraries/go/logs` | `go test -coverprofile coverage.out -covermode atomic -coverpkg github.com/cloudops/otel-logs ./...` then `go tool cover -func` ≥ 75% | the package itself | `examples/` (excluded via `-coverpkg` scope) | 75 | — | — |
| `libraries/java/logs` | `mvn -q verify` (Jacoco rule on `coverage.line.minimum`) | `src/main/java/...` | `src/test/java/` | 40 (#69 lift pending) | — | — |
| `libraries/dotnet/logs` | `dotnet test ... /p:Threshold=40 /p:ThresholdType=line` (Coverlet) | `src/CloudOps.Otel.Logs.csproj` | `tests/` | 40 (#69 lift pending) | — | — |
| `libraries/cpp/logs` | `cmake -B build -DCLOUDOPS_LOGS_ENABLE_COVERAGE=ON; cmake --build build; ctest --test-dir build; gcovr --fail-under-line 50` | `src/`, `include/` | `tests/`, `examples/` | 50 | — | — |

Branch and function thresholds are only enforced where the language tooling
exposes them as discrete numbers. For the libraries, raising the line gate is
the lowest-friction lever; branch/function lifts are tracked under the
follow-up backlog rows.

## CI wiring

`.github/workflows/libraries.yml` runs each library job on every PR + push to
`main` and uploads its coverage report as an artifact (`coverage-<lang>-logs`,
14-day retention). `.github/workflows/app.yml` `test` job runs the order-api
coverage gate on every PR + push.

## How to lift a gate

1. Add tests for an uncovered branch/path. Prefer testing the public API
   (env-var contract, exporter fallback, sampler edges).
2. Run the package's coverage command locally to confirm the lift is real.
3. Bump the threshold in the file referenced in the matrix above.
4. Update this matrix in the same PR.

Never relax a gate without an accompanying explanation in the commit
message — coverage drops compound silently.
