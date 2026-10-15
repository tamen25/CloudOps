package com.cloudops.otel.logs;

import com.fasterxml.jackson.annotation.JsonProperty;

public final class LogsExporterConfig {
  public String url;

  @JsonProperty("api_key")
  public String apiKey;
}
