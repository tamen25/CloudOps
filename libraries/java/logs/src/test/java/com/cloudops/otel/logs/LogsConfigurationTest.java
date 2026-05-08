package com.cloudops.otel.logs;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;

import org.junit.jupiter.api.Test;

class LogsConfigurationTest {
  @Test
  void parseStringArrayReadsJsonAndCommaSeparatedValues() {
    assertArrayEquals(
        new String[] {"console", "otel"},
        LogsConfiguration.parseStringArray("[\"console\", \" otel \"]", new String[] {"fallback"}));
    assertArrayEquals(
        new String[] {"console", "otel"},
        LogsConfiguration.parseStringArray("console, otel", new String[] {"fallback"}));
  }

  @Test
  void parseStringArrayCopiesFallback() {
    String[] fallback = {"console"};
    String[] parsed = LogsConfiguration.parseStringArray("", fallback);

    parsed[0] = "otel";
    assertArrayEquals(new String[] {"console"}, fallback);
    assertNotSame(fallback, parsed);
  }

  @Test
  void firstValueSkipsBlankValues() {
    assertEquals(
        "https://collector.example.com",
        LogsConfiguration.firstValue(null, " ", "https://collector.example.com"));
  }
}
