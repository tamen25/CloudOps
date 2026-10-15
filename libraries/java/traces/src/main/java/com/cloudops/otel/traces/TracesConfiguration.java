package com.cloudops.otel.traces;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Arrays;

final class TracesConfiguration {
  private static final String DEFAULT_SSM_PARAMETERS_FILE = "/tmp/otelExporterParams.json";
  private static final ObjectMapper MAPPER = new ObjectMapper()
      .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

  private TracesConfiguration() {}

  static SsmParameters readSsmParameters() {
    String configured = System.getenv("OTEL_SSM_PARAMETERS");
    if (hasValue(configured)) {
      try {
        SsmParameters parsed = MAPPER.readValue(configured, SsmParameters.class);
        if (parsed != null && !parsed.isEmpty()) return parsed;
      } catch (Exception ignored) {
        // Fall through to the params file and then direct OTEL env vars.
      }
    }

    SsmParameters fileParameters = readSsmParametersFile();
    if (!fileParameters.isEmpty()) return fileParameters;

    String tracesUrl = firstValue(
        System.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"),
        normalizeEndpoint(System.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")));
    String apiKey = firstValue(
        System.getenv("OTEL_API_KEY"),
        System.getenv("OTEL_EXPORTER_OTLP_HEADERS"));

    SsmParameters parameters = new SsmParameters();
    if (hasValue(tracesUrl) || hasValue(apiKey)) {
      TracesExporterConfig exporterConfig = new TracesExporterConfig();
      exporterConfig.url = tracesUrl;
      exporterConfig.apiKey = apiKey;

      BackendConfig backendConfig = new BackendConfig();
      backendConfig.trace = exporterConfig;
      parameters.otel = backendConfig;
    }

    return parameters;
  }

  static SsmParameters readSsmParametersFile() {
    String configuredPath = System.getenv("OTEL_SSM_PARAMETERS_FILE");
    String filePath = firstValue(configuredPath, DEFAULT_SSM_PARAMETERS_FILE);
    return readSsmParametersFile(Path.of(filePath));
  }

  static SsmParameters readSsmParametersFile(Path filePath) {
    try {
      SsmParameters parsed = MAPPER.readValue(filePath.toFile(), SsmParameters.class);
      return parsed == null ? new SsmParameters() : parsed;
    } catch (IOException ignored) {
      return new SsmParameters();
    }
  }

  // Parses string array.
  static String[] parseStringArray(String raw, String[] fallback) {
    if (!hasValue(raw)) return Arrays.copyOf(fallback, fallback.length);

    try {
      String[] parsed = MAPPER.readValue(raw, String[].class);
      String[] values = Arrays.stream(parsed)
          .map(String::trim)
          .filter(TracesConfiguration::hasValue)
          .toArray(String[]::new);
      if (values.length > 0) return values;
    } catch (Exception ignored) {
      // Fall back to comma-separated values.
    }

    String[] values = Arrays.stream(raw.split(","))
        .map(String::trim)
        .filter(TracesConfiguration::hasValue)
        .toArray(String[]::new);
    return values.length > 0 ? values : Arrays.copyOf(fallback, fallback.length);
  }

  static double samplerRatio() {
    try {
      return Double.parseDouble(firstValue(System.getenv("TRACEID_RATIO_BASED_SAMPLER"), "1"));
    } catch (NumberFormatException ignored) {
      return 1;
    }
  }

  // Normalizes endpoint.
  static String normalizeEndpoint(String endpoint) {
    if (!hasValue(endpoint)) return null;
    String normalized = endpoint.endsWith("/") ? endpoint.substring(0, endpoint.length() - 1) : endpoint;
    return normalized.endsWith("/v1/traces") ? normalized : normalized + "/v1/traces";
  }

  static boolean hasValue(String value) {
    return value != null && !value.isBlank();
  }

  // Finds first value.
  static String firstValue(String... values) {
    for (String value : values) {
      if (hasValue(value)) return value;
    }

    return null;
  }
}
