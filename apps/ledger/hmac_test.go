package main

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

func signedRequest(t *testing.T, body, tenant, secret string, tsMillis int64) *http.Request {
	t.Helper()
	ts := strconv.FormatInt(tsMillis, 10)
	req := httptest.NewRequest("POST", "/entries", nil)
	req.Header.Set("x-cloudops-timestamp", ts)
	req.Header.Set("x-cloudops-tenant", tenant)
	req.Header.Set("x-cloudops-hmac", computeHMAC(ts, tenant, body, secret))
	return req
}

func TestVerifyInternalHMACAccepts(t *testing.T) {
	now := int64(1_000_000)
	req := signedRequest(t, `{"a":1}`, "t1", "secret", now)
	tenant, code, _ := verifyInternalHMAC(req, `{"a":1}`, "secret", "", now)
	if code != http.StatusOK || tenant != "t1" {
		t.Fatalf("verify = (%q,%d), want (t1,200)", tenant, code)
	}
}

func TestVerifyInternalHMACRejectsWrongSecret(t *testing.T) {
	now := int64(1_000_000)
	req := signedRequest(t, `{}`, "t1", "wrong", now)
	_, code, reason := verifyInternalHMAC(req, `{}`, "secret", "", now)
	if code != http.StatusUnauthorized || reason != "hmac_invalid" {
		t.Fatalf("verify = (%d,%s), want (401,hmac_invalid)", code, reason)
	}
}

func TestVerifyInternalHMACRejectsStale(t *testing.T) {
	now := int64(10_000_000)
	req := signedRequest(t, `{}`, "t1", "secret", now-6*60*1000)
	_, code, reason := verifyInternalHMAC(req, `{}`, "secret", "", now)
	if code != http.StatusUnauthorized || reason != "hmac_stale" {
		t.Fatalf("verify = (%d,%s), want (401,hmac_stale)", code, reason)
	}
}

func TestVerifyInternalHMACPreviousSecret(t *testing.T) {
	now := int64(1_000_000)
	req := signedRequest(t, `{}`, "t1", "oldsecret", now)
	tenant, code, _ := verifyInternalHMAC(req, `{}`, "newsecret", "oldsecret", now)
	if code != http.StatusOK || tenant != "t1" {
		t.Fatalf("previous-secret accept = (%q,%d), want (t1,200)", tenant, code)
	}
}

func TestVerifyInternalHMACUnconfigured(t *testing.T) {
	_, code, reason := verifyInternalHMAC(httptest.NewRequest("POST", "/entries", nil), "", "", "", 0)
	if code != http.StatusServiceUnavailable || reason != "internal_hmac_not_configured" {
		t.Fatalf("unconfigured = (%d,%s)", code, reason)
	}
}
