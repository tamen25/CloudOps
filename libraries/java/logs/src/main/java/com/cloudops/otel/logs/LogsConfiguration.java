package com.cloudops.otel.logs;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Arrays;

final class LogsConfiguration {
  private static final ObjectMapper MAPPER = new ObjectMapper()
      .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

  private LogsConfiguration() {}

  static SsmParameters readSsmParameters() {
    String configured = System.getenv("OTEL_SSM_PARAMETERS");
    if (hasValue(configured)) {
      try {
        SsmParameters parsed = MAPPER.readValue(configured, SsmParameters.class);
        if (parsed != null && !parsed.isEmpty()) return parsed;
      } catch (Exception ignored) {
        // Fall through to direct OTEL env vars.
      }
    }

    String logsUrl = firstValue(
        System.getenv("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"),
        normalizeEndpoint(System.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")));
    String apiKey = firstValue(
        System.getenv("OTEL_API_KEY"),
        System.getenv("OTEL_EXPORTER_OTLP_HEADERS"));

    SsmParameters parameters = new SsmParameters();
    if (hasValue(logsUrl) || hasValue(apiKey)) {
      LogsExporterConfig exporterConfig = new LogsExporterConfig();
      exporterConfig.url = logsUrl;
      exporterConfig.apiKey = apiKey;

      BackendConfig backendConfig = new BackendConfig();
      backendConfig.logs = exporterConfig;
      parameters.otel = backendConfig;
    }

    return parameters;
  }

  static String[] parseStringArray(String raw, String[] fallback) {
    if (!hasValue(raw)) return Arrays.copyOf(fallback, fallback.length);

    try {
      String[] parsed = MAPPER.readValue(raw, String[].class);
      String[] values = Arrays.stream(parsed)
          .map(String::trim)
          .filter(LogsConfiguration::hasValue)
          .toArray(String[]::new);
      if (values.length > 0) return values;
    } catch (Exception ignored) {
      // Fall back to comma-separated values.
    }

    String[] values = Arrays.stream(raw.split(","))
        .map(String::trim)
        .filter(LogsConfiguration::hasValue)
        .toArray(String[]::new);
    return values.length > 0 ? values : Arrays.copyOf(fallback, fallback.length);
  }

  static double samplingRate() {
    try {
      return Double.parseDouble(firstValue(System.getenv("OTEL_LOGS_SAMPLING_RATE"), "100"));
    } catch (NumberFormatException ignored) {
      return 100;
    }
  }

  private static String normalizeEndpoint(String endpoint) {
    if (!hasValue(endpoint)) return null;
    String normalized = endpoint.endsWith("/") ? endpoint.substring(0, endpoint.length() - 1) : endpoint;
    return normalized.endsWith("/v1/logs") ? normalized : normalized + "/v1/logs";
  }

  static boolean hasValue(String value) {
    return value != null && !value.isBlank();
  }

  static String firstValue(String... values) {
    for (String value : values) {
      if (hasValue(value)) return value;
    }

    return null;
  }
}
