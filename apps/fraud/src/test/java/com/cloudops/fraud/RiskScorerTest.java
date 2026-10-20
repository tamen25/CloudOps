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

    // A tenant named "synthetic-…" used to be capped below deny. The tenant
    // comes from the request body, so anyone could name themselves that.
    @Test
    void aTenantsNameDoesNotLowerItsRisk() {
        RiskScorer.Risk risk = RiskScorer.score(new RiskScorer.Order(500_000, 25, "synthetic-1"));
        assertEquals("deny", risk.decision());
    }

    @Test
    void nullOrderThrows() {
        assertThrows(IllegalArgumentException.class, () -> RiskScorer.score(null));
    }
}
