package com.cloudops.otel.logs;

import java.util.Objects;

public final class SsmParameters {
  public BackendConfig otel;

  public boolean isEmpty() {
    return otel == null || otel.logs == null || (!hasValue(otel.logs.url) && !hasValue(otel.logs.apiKey));
  }

  private static boolean hasValue(String value) {
    return value != null && !value.isBlank();
  }

  public BackendConfig backend(String name) {
    if (Objects.equals(name, "otel")) return otel;
    return null;
  }
}
