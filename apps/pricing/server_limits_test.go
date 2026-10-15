package main

import (
	"testing"
	"time"
)

// The server main runs bounds how long a client can hold a connection.
func TestNewServerHasTimeouts(t *testing.T) {
	srv := newServer("9999", nil)
	if srv.Addr != ":9999" {
		t.Errorf("addr = %q, want :9999", srv.Addr)
	}
	for name, d := range map[string]time.Duration{
		"ReadHeaderTimeout": srv.ReadHeaderTimeout,
		"ReadTimeout":       srv.ReadTimeout,
		"WriteTimeout":      srv.WriteTimeout,
		"IdleTimeout":       srv.IdleTimeout,
	} {
		if d <= 0 {
			t.Errorf("%s is unset: a slow client could hold a connection forever", name)
		}
	}
}
