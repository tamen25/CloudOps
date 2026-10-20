package com.cloudops.otel.logs;

public enum LogLevel {
  INFO,
  ERROR,
  DEBUG,
  WARN;

  public String value() {
    return name().toLowerCase();
  }
}
