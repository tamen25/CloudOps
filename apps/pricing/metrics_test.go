package main

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

// /metrics counts successful quotes only: a rejected request does not move
// the counter.
func TestMetricsCountsSuccessfulQuotes(t *testing.T) {
	mux := NewMux()
	before := quoteCount.Load()

	ok := httptest.NewRecorder()
	mux.ServeHTTP(ok, httptest.NewRequest("POST", "/quote",
		strings.NewReader(`{"items":[{"sku":"A","qty":2,"price_cents":500}]}`)))
	if ok.Code != http.StatusOK {
		t.Fatalf("quote = %d, want 200: %s", ok.Code, ok.Body.String())
	}
	bad := httptest.NewRecorder()
	mux.ServeHTTP(bad, httptest.NewRequest("POST", "/quote", strings.NewReader(`{`)))

	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, httptest.NewRequest("GET", "/metrics", nil))
	want := "pricing_quote_total " + strconv.FormatInt(before+1, 10) + "\n"
	if !strings.Contains(rr.Body.String(), want) {
		t.Fatalf("metrics = %q, want %q", rr.Body.String(), want)
	}
}
