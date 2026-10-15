// This file contains traces configuration test logic for OTel traces.
package com.cloudops.otel.traces;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TracesConfigurationTest {
  @Test
  void parseStringArrayReadsJsonAndCommaSeparatedValues() {
    assertArrayEquals(
        new String[] {"console", "otel"},
        TracesConfiguration.parseStringArray("[\"console\", \" otel \"]", new String[] {"fallback"}));
    assertArrayEquals(
        new String[] {"console", "otel"},
        TracesConfiguration.parseStringArray("console, otel", new String[] {"fallback"}));
  }

  @Test
  void parseStringArrayCopiesFallback() {
    String[] fallback = {"console"};
    String[] parsed = TracesConfiguration.parseStringArray("", fallback);

    parsed[0] = "otel";
    assertArrayEquals(new String[] {"console"}, fallback);
    assertNotSame(fallback, parsed);
  }

  @Test
  void normalizeEndpointAppendsTracesPath() {
    assertEquals(
        "https://collector.example.com/v1/traces",
        TracesConfiguration.normalizeEndpoint("https://collector.example.com/"));
    assertEquals(
        "https://collector.example.com/v1/traces",
        TracesConfiguration.normalizeEndpoint("https://collector.example.com/v1/traces"));
  }

  @Test
  void firstValueSkipsBlankValues() {
    assertEquals(
        "https://collector.example.com",
        TracesConfiguration.firstValue(null, " ", "https://collector.example.com"));
  }

  @Test
  void readSsmParametersFileReadsParamsFile(@TempDir Path tempDir) throws IOException {
    Path paramsFile = tempDir.resolve("otelExporterParams.json");
    Files.writeString(
        paramsFile,
        "{\"otel\":{\"trace\":{\"url\":\"https://file.example.com/v1/traces\",\"api_key\":\"file-secret\"}}}");

    SsmParameters parsed = TracesConfiguration.readSsmParametersFile(paramsFile);

    assertFalse(parsed.isEmpty());
    assertEquals("https://file.example.com/v1/traces", parsed.otel.trace.url);
    assertEquals("file-secret", parsed.otel.trace.apiKey);
  }

  @Test
  void readSsmParametersFileReturnsEmptyForInvalidFile(@TempDir Path tempDir) throws IOException {
    Path paramsFile = tempDir.resolve("otelExporterParams.json");
    Files.writeString(paramsFile, "{not-json");

    SsmParameters parsed = TracesConfiguration.readSsmParametersFile(paramsFile);

    assertTrue(parsed.isEmpty());
  }
}
