# syntax=docker/dockerfile:1.7
# fraud (Spring Boot). Multi-stage: build the jar with Maven, run on a non-root
# JRE with the OpenTelemetry Java agent attached (auto-instruments Spring MVC
# when OTEL_EXPORTER_OTLP_ENDPOINT is set; harmless otherwise).

FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml ./
# Pre-fetch dependencies for better layer caching.
RUN mvn -B -q dependency:go-offline || true
COPY src ./src
RUN mvn -B -q clean package -DskipTests

FROM eclipse-temurin:17-jre
# Non-root user.
RUN groupadd -g 1001 app && useradd -u 1001 -g app -s /usr/sbin/nologin app
WORKDIR /app

# OpenTelemetry Java agent (no-op without OTEL_EXPORTER_OTLP_ENDPOINT).
# The release publishes no checksum file; this is the SHA-256 of the jar,
# equal to the digest GitHub reports for the release asset (2026-11-06). A
# build fails if the bytes behind the URL change.
ADD --checksum=sha256:e43a270df53c6f423e0ab157be9c27ccc01d5dc3232e162fe54777573db2f149 --chown=app:app https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.33.1/opentelemetry-javaagent.jar /app/otel-javaagent.jar

COPY --from=builder --chown=app:app /app/target/fraud-1.0.0.jar /app/app.jar
USER app
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-javaagent:/app/otel-javaagent.jar"
# The SDK's own exporter and processor metrics in their semantic-convention
# form (otel.sdk.*, each with a unit). The default, LEGACY, sends
# otlp.exporter.seen/exported without a unit (Argus MET-002).
ENV OTEL_EXPERIMENTAL_SDK_TELEMETRY_VERSION=latest
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz >/dev/null 2>&1 || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
