// This file contains SSM parameters logic for OTel traces.
package com.cloudops.otel.traces;

import java.util.Objects;

public final class SsmParameters {
  public BackendConfig otel;

  // Checks whether empty.
  public boolean isEmpty() {
    return otel == null || otel.trace == null || (!hasValue(otel.trace.url) && !hasValue(otel.trace.apiKey));
  }

  // Handles has value.
  private static boolean hasValue(String value) {
    return value != null && !value.isBlank();
  }

  // Handles backend.
  public BackendConfig backend(String name) {
    if (Objects.equals(name, "otel")) return otel;
    return null;
  }
}
