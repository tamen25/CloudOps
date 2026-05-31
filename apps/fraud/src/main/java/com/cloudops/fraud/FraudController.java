package com.cloudops.fraud;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** HTTP layer for the fraud service. Thin wrapper over {@link RiskScorer}. */
@RestController
public class FraudController {

    @PostMapping("/score")
    public ResponseEntity<Map<String, Object>> score(@RequestBody Map<String, Object> body) {
        long amount = toLong(body.get("amount_cents"));
        int items = (int) toLong(body.get("item_count"));
        Object tenantObj = body.get("tenant_id");
        String tenant = tenantObj == null ? null : tenantObj.toString();

        if (amount < 0 || items < 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid_order"));
        }

        RiskScorer.Risk risk = RiskScorer.score(new RiskScorer.Order(amount, items, tenant));
        return ResponseEntity.ok(Map.of("score", risk.score(), "decision", risk.decision()));
    }

    private static long toLong(Object o) {
        if (o instanceof Number n) {
            return n.longValue();
        }
        if (o instanceof String s && !s.isBlank()) {
            try {
                return Long.parseLong(s.trim());
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        return 0;
    }
}
