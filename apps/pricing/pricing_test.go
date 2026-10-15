package main

import "testing"

func TestQuoteSumsLineItems(t *testing.T) {
	items := []LineItem{{SKU: "A", PriceCents: 100, Qty: 2}, {SKU: "B", PriceCents: 50, Qty: 1}}
	got := Quote(items)
	if got.TotalCents != 250 {
		t.Fatalf("TotalCents = %d, want 250", got.TotalCents)
	}
	if len(got.Lines) != 2 {
		t.Fatalf("Lines = %d, want 2", len(got.Lines))
	}
}

func TestQuoteRejectsNegativeQty(t *testing.T) {
	_, err := QuoteChecked([]LineItem{{SKU: "A", PriceCents: 100, Qty: -1}})
	if err == nil {
		t.Fatal("expected error for negative qty")
	}
}

func TestQuoteRejectsNegativePrice(t *testing.T) {
	_, err := QuoteChecked([]LineItem{{SKU: "A", PriceCents: -100, Qty: 1}})
	if err == nil {
		t.Fatal("expected error for negative price")
	}
}
