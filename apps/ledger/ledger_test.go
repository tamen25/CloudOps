package main

import "testing"

func fixedID() func() string {
	n := 0
	return func() string {
		n++
		return "entry-" + string(rune('0'+n))
	}
}

func TestPostAppendsBalancedEntry(t *testing.T) {
	b := NewBook()
	e, err := b.Post(PostRequest{AuthID: "auth-1", TenantID: "t1", AmountCents: 500}, fixedID())
	if err != nil {
		t.Fatalf("Post err = %v", err)
	}
	if e.Debit != "customer:t1" || e.Credit != "merchant:t1" {
		t.Fatalf("unbalanced entry: debit=%s credit=%s", e.Debit, e.Credit)
	}
	if e.AmountCents != 500 || e.EntryID == "" {
		t.Fatalf("bad entry: %+v", e)
	}
	if b.Len() != 1 {
		t.Fatalf("Len = %d, want 1", b.Len())
	}
}

func TestPostDefaultsTenant(t *testing.T) {
	b := NewBook()
	e, _ := b.Post(PostRequest{AuthID: "auth-1", AmountCents: 100}, fixedID())
	if e.Debit != "customer:default" {
		t.Fatalf("tenant default not applied: %s", e.Debit)
	}
}

func TestPostRejectsNonPositive(t *testing.T) {
	b := NewBook()
	if _, err := b.Post(PostRequest{AuthID: "auth-1", AmountCents: 0}, fixedID()); err == nil {
		t.Fatal("expected error for zero amount")
	}
}

func TestPostRejectsMissingAuth(t *testing.T) {
	b := NewBook()
	if _, err := b.Post(PostRequest{AmountCents: 100}, fixedID()); err == nil {
		t.Fatal("expected error for missing auth_id")
	}
}
