package com.cloudops.fraud;

/**
 * Pure risk-scoring logic, framework-free so it is unit-testable in isolation.
 * Produces a 0-100 score and an approve/review/deny decision. The heuristics
 * are deliberately simple — this service exists to deepen the trace, not to be
 * a real fraud engine.
 */
public final class RiskScorer {

    public record Order(long amountCents, int itemCount, String tenantId) {}

    public record Risk(int score, String decision) {}

    private RiskScorer() {}

    /** Score an order. Higher = riskier. */
    public static Risk score(Order order) {
        if (order == null) {
            throw new IllegalArgumentException("order required");
        }
        int score = 0;

        // Large orders are riskier.
        if (order.amountCents() >= 500_000) {
            score += 60;
        } else if (order.amountCents() >= 100_000) {
            score += 30;
        } else if (order.amountCents() >= 20_000) {
            score += 10;
        }

        // Unusually large baskets add risk.
        if (order.itemCount() >= 20) {
            score += 25;
        } else if (order.itemCount() >= 10) {
            score += 10;
        }

        // Synthetic-load tenants are trusted (keeps the happy path green under
        // traffic generation) but never below the structural amount risk.
        if (order.tenantId() != null && order.tenantId().startsWith("synthetic-")) {
            score = Math.min(score, 40);
        }

        score = Math.max(0, Math.min(100, score));
        return new Risk(score, decide(score));
    }

    private static String decide(int score) {
        if (score >= 70) {
            return "deny";
        }
        if (score >= 40) {
            return "review";
        }
        return "approve";
    }
}
