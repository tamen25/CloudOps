package main

import "errors"

// LineItem is one SKU at a unit price and quantity.
type LineItem struct {
	SKU        string `json:"sku"`
	PriceCents int64  `json:"price_cents"`
	Qty        int64  `json:"qty"`
}

// QuoteResult is the priced set of line items plus the order total.
type QuoteResult struct {
	Lines      []LineItem `json:"lines"`
	TotalCents int64      `json:"total_cents"`
}

// Quote sums price_cents*qty across items. Assumes validated input.
func Quote(items []LineItem) QuoteResult {
	var total int64
	for _, it := range items {
		total += it.PriceCents * it.Qty
	}
	return QuoteResult{Lines: items, TotalCents: total}
}

// QuoteChecked validates each line (no negative price or qty) then quotes.
func QuoteChecked(items []LineItem) (QuoteResult, error) {
	for _, it := range items {
		if it.Qty < 0 || it.PriceCents < 0 {
			return QuoteResult{}, errors.New("negative qty or price")
		}
	}
	return Quote(items), nil
}
