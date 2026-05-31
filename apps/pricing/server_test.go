package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealthz(t *testing.T) {
	rr := httptest.NewRecorder()
	NewMux().ServeHTTP(rr, httptest.NewRequest("GET", "/healthz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("healthz = %d, want 200", rr.Code)
	}
}

func TestReadyz(t *testing.T) {
	rr := httptest.NewRecorder()
	NewMux().ServeHTTP(rr, httptest.NewRequest("GET", "/readyz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("readyz = %d, want 200", rr.Code)
	}
}

func TestQuoteEndpoint(t *testing.T) {
	body := `{"items":[{"sku":"A","price_cents":100,"qty":2}]}`
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/quote", strings.NewReader(body))
	NewMux().ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("quote = %d, want 200; body=%s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"total_cents":200`) {
		t.Fatalf("body = %s, want total_cents 200", rr.Body.String())
	}
}

func TestQuoteRejectsBadJSON(t *testing.T) {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/quote", strings.NewReader("{not json"))
	NewMux().ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("quote bad json = %d, want 400", rr.Code)
	}
}

func TestQuoteRejectsGET(t *testing.T) {
	rr := httptest.NewRecorder()
	NewMux().ServeHTTP(rr, httptest.NewRequest("GET", "/quote", nil))
	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("quote GET = %d, want 405", rr.Code)
	}
}
