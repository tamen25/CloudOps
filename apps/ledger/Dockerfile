# Build pricing (Go) — static binary, non-root distroless runtime.
# Multi-stage: compile a CGO-free static binary, ship only the binary on a
# distroless/nonroot base (no shell, runs as uid 65532).

FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download || true
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /ledger .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /ledger /ledger
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/ledger"]
