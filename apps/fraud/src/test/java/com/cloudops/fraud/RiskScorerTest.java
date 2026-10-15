package com.cloudops.fraud;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class RiskScorerTest {

    @Test
    void smallOrderApproves() {
        RiskScorer.Risk risk = RiskScorer.score(new RiskScorer.Order(5_000, 1, "t1"));
        assertEquals("approve", risk.decision());
        assertTrue(risk.score() < 40);
    }

    @Test
    void largeOrderDenies() {
        RiskScorer.Risk risk = RiskScorer.score(new RiskScorer.Order(500_000, 25, "t1"));
        assertEquals("deny", risk.decision());
        assertTrue(risk.score() >= 70);
    }

    @Test
    void mediumOrderReviews() {
        RiskScorer.Risk risk = RiskScorer.score(new RiskScorer.Order(100_000, 10, "t1"));
        assertEquals("review", risk.decision());
    }

    @Test
    void syntheticTenantCappedBelowDeny() {
        RiskScorer.Risk risk = RiskScorer.score(new RiskScorer.Order(500_000, 25, "synthetic-1"));
        assertTrue(risk.score() <= 40);
        assertTrue(!"deny".equals(risk.decision()));
    }

    @Test
    void nullOrderThrows() {
        assertThrows(IllegalArgumentException.class, () -> RiskScorer.score(null));
    }
}
