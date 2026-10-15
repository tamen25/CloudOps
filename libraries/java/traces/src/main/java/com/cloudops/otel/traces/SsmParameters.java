package com.cloudops.otel.traces;

import java.util.Objects;

public final class SsmParameters {
  public BackendConfig otel;

  public boolean isEmpty() {
    return otel == null || otel.trace == null || (!hasValue(otel.trace.url) && !hasValue(otel.trace.apiKey));
  }

  private static boolean hasValue(String value) {
    return value != null && !value.isBlank();
  }

  public BackendConfig backend(String name) {
    if (Objects.equals(name, "otel")) return otel;
    return null;
  }
}
