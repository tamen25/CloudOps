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
        // An amount that is missing or not a number is refused: it used to be
        // read as 0 and approved. A missing item count counts as none.
        Long amount = toLong(body.get("amount_cents"));
        Object itemsObj = body.get("item_count");
        Long items = itemsObj == null ? Long.valueOf(0) : toLong(itemsObj);
        Object tenantObj = body.get("tenant_id");
        String tenant = tenantObj == null ? null : tenantObj.toString();

        if (amount == null || items == null || amount < 0 || items < 0 || items > Integer.MAX_VALUE) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid_order"));
        }

        RiskScorer.Risk risk = RiskScorer.score(new RiskScorer.Order(amount, items.intValue(), tenant));
        return ResponseEntity.ok(Map.of("score", risk.score(), "decision", risk.decision()));
    }

    /** The value as a whole number, or null when it is missing or not one. */
    private static Long toLong(Object o) {
        if (o instanceof Number n) {
            return n.longValue();
        }
        if (o instanceof String s && !s.isBlank()) {
            try {
                return Long.parseLong(s.trim());
            } catch (NumberFormatException notANumber) {
                return null;
            }
        }
        return null;
    }
}
