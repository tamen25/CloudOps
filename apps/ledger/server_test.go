package main

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func fixedNow() int64 { return 1_000_000 }

func TestHealthz(t *testing.T) {
	rr := httptest.NewRecorder()
	NewMux(NewBook(), "secret", "", fixedNow).ServeHTTP(rr, httptest.NewRequest("GET", "/healthz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("healthz = %d, want 200", rr.Code)
	}
}

func TestEntriesRequiresHMAC(t *testing.T) {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/entries", strings.NewReader(`{"auth_id":"a","amount_cents":100}`))
	NewMux(NewBook(), "secret", "", fixedNow).ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("unsigned /entries = %d, want 401", rr.Code)
	}
}

func TestEntriesAcceptsSigned(t *testing.T) {
	body := `{"auth_id":"auth-1","tenant_id":"t1","amount_cents":250}`
	ts := strconv.FormatInt(fixedNow(), 10)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/entries", strings.NewReader(body))
	req.Header.Set("x-cloudops-timestamp", ts)
	req.Header.Set("x-cloudops-tenant", "t1")
	req.Header.Set("x-cloudops-hmac", computeHMAC(ts, "t1", body, "secret"))

	book := NewBook()
	NewMux(book, "secret", "", fixedNow).ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("signed /entries = %d, want 200; body=%s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"entry_id"`) {
		t.Fatalf("missing entry_id: %s", rr.Body.String())
	}
	if book.Len() != 1 {
		t.Fatalf("book.Len = %d, want 1", book.Len())
	}
}
