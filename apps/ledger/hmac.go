package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"regexp"
	"strconv"
	"time"
)

// Mirrors order-api's internal HMAC scheme (docs/adr/024, 029): the signature
// is hex(HMAC-SHA256(secret, timestamp.tenant.rawBody)), carried in
// x-cloudops-hmac, with
// x-cloudops-timestamp (5-minute skew window) and x-cloudops-tenant. Supports a
// PREVIOUS secret for zero-downtime rotation, same as order-api (#96).

var tenantRe = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

const hmacSkewMillis = 5 * 60 * 1000

func computeHMAC(timestamp, tenant, rawBody, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "." + tenant + "." + rawBody)) // hash.Hash's Write never returns an error
	return hex.EncodeToString(mac.Sum(nil))
}

func tryHMAC(timestamp, tenant, rawBody, given, secret string) bool {
	if secret == "" {
		return false
	}
	expected := computeHMAC(timestamp, tenant, rawBody, secret)
	return subtle.ConstantTimeCompare([]byte(given), []byte(expected)) == 1
}

// verifyInternalHMAC checks the request signature against the active and
// previous secrets. Returns the validated tenant and an HTTP status (200 on
// success). nowMillis is injectable for tests.
func verifyInternalHMAC(r *http.Request, rawBody string, active, previous string, nowMillis int64) (string, int, string) {
	if active == "" {
		return "", http.StatusServiceUnavailable, "internal_hmac_not_configured"
	}
	header := r.Header.Get("x-cloudops-hmac")
	timestamp := r.Header.Get("x-cloudops-timestamp")
	tenant := r.Header.Get("x-cloudops-tenant")
	if header == "" || timestamp == "" || tenant == "" {
		return "", http.StatusUnauthorized, "hmac_missing"
	}
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || abs64(nowMillis-ts) > hmacSkewMillis {
		return "", http.StatusUnauthorized, "hmac_stale"
	}
	if !tenantRe.MatchString(tenant) {
		return "", http.StatusUnauthorized, "invalid_tenant"
	}
	if tryHMAC(timestamp, tenant, rawBody, header, active) || tryHMAC(timestamp, tenant, rawBody, header, previous) {
		return tenant, http.StatusOK, ""
	}
	return "", http.StatusUnauthorized, "hmac_invalid"
}

func abs64(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}

func nowMillis() int64 {
	return time.Now().UnixMilli()
}
