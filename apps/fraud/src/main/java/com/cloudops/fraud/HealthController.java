package com.cloudops.fraud;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Mesh-standard liveness/readiness endpoints, matching the other services
 *  (/healthz, /readyz) so the shared k8s probes + modules/mesh apply uniformly.
 *  Actuator stays available at /actuator/* for richer detail. */
@RestController
public class HealthController {

    @GetMapping("/healthz")
    public Map<String, String> healthz() {
        return Map.of("status", "ok");
    }

    @GetMapping("/readyz")
    public Map<String, String> readyz() {
        return Map.of("status", "ready");
    }
}
