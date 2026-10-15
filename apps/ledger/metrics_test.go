package main

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

// signedEntry builds an /entries request signed the way the payment service
// signs it.
func signedEntry(body string) *http.Request {
	ts := strconv.FormatInt(fixedNow(), 10)
	req := httptest.NewRequest("POST", "/entries", strings.NewReader(body))
	req.Header.Set("x-cloudops-timestamp", ts)
	req.Header.Set("x-cloudops-tenant", "t1")
	req.Header.Set("x-cloudops-hmac", computeHMAC(ts, "t1", body, "secret"))
	return req
}

// /metrics reports how many entries the book holds, so a scrape follows the
// postings.
func TestMetricsCountsEntries(t *testing.T) {
	book := NewBook()
	mux := NewMux(book, "secret", "", fixedNow)
	for i, body := range []string{
		`{"auth_id":"a1","tenant_id":"t1","amount_cents":100}`,
		`{"auth_id":"a2","tenant_id":"t1","amount_cents":200}`,
	} {
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, signedEntry(body))
		if rr.Code != http.StatusOK {
			t.Fatalf("entry %d = %d, want 200: %s", i, rr.Code, rr.Body.String())
		}
	}
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, httptest.NewRequest("GET", "/metrics", nil))
	if !strings.Contains(rr.Body.String(), "ledger_entries_total 2\n") {
		t.Fatalf("metrics = %q, want ledger_entries_total 2", rr.Body.String())
	}
}

// Only POST is accepted, and a signed request that is not a valid entry is
// rejected without being booked.
func TestEntriesRejectsWrongMethodAndInvalidEntries(t *testing.T) {
	book := NewBook()
	mux := NewMux(book, "secret", "", fixedNow)

	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, httptest.NewRequest("GET", "/entries", nil))
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET /entries = %d, want 405", rr.Code)
	}

	for name, body := range map[string]string{
		"bad json":        `{"auth_id":`,
		"negative amount": `{"auth_id":"a1","tenant_id":"t1","amount_cents":-5}`,
	} {
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, signedEntry(body))
		if rr.Code != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400: %s", name, rr.Code, rr.Body.String())
		}
	}
	if book.Len() != 0 {
		t.Errorf("book holds %d entries after rejected requests, want 0", book.Len())
	}
}
