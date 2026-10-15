# Projection worker (Python). Builds a venv with the package, runs the poll
# loop. Non-root runtime.
FROM python:3.12-slim AS builder
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN python -m venv /venv && \
    /venv/bin/pip install --no-cache-dir --upgrade pip && \
    /venv/bin/pip install --no-cache-dir .

FROM python:3.12-slim
RUN groupadd -g 1001 app && useradd -u 1001 -g app -s /usr/sbin/nologin app
WORKDIR /app
COPY --from=builder --chown=app:app /venv /venv
ENV PATH="/venv/bin:$PATH"
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8080/healthz').status==200 else 1)"
CMD ["python", "-m", "projection.poller"]
