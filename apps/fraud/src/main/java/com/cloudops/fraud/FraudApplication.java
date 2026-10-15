package com.cloudops.fraud;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Fraud service entrypoint. OTel is attached at runtime via the Java agent
 *  (see Dockerfile) when OTEL_EXPORTER_OTLP_ENDPOINT is set; no code wiring. */
@SpringBootApplication
public class FraudApplication {
    public static void main(String[] args) {
        SpringApplication.run(FraudApplication.class, args);
    }
}
