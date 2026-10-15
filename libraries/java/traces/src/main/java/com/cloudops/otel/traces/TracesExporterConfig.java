// This file contains traces exporter config logic for OTel traces.
package com.cloudops.otel.traces;

import com.fasterxml.jackson.annotation.JsonProperty;

public final class TracesExporterConfig {
  public String url;

  @JsonProperty("api_key")
  public String apiKey;
}
