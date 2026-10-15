package main

import (
	"errors"
	"sync"

	"github.com/google/uuid"
)

// Entry is one double-entry record: a debit and a credit of equal magnitude.
// For a payment authorization we debit the customer's account and credit the
// merchant's, keeping the books balanced.
type Entry struct {
	EntryID     string `json:"entry_id"`
	AuthID      string `json:"auth_id"`
	TenantID    string `json:"tenant_id"`
	AmountCents int64  `json:"amount_cents"`
	Debit       string `json:"debit"`
	Credit      string `json:"credit"`
}

// PostRequest is the incoming append request.
type PostRequest struct {
	AuthID      string `json:"auth_id"`
	TenantID    string `json:"tenant_id"`
	AmountCents int64  `json:"amount_cents"`
}

var errInvalidEntry = errors.New("invalid ledger entry: amount must be positive and auth_id required")

// Book is an in-memory append-only ledger. The dev/test tier does not need a
// durable store; the read model (projection-worker) is the queryable view.
type Book struct {
	mu      sync.Mutex
	entries []Entry
}

// NewBook returns an empty ledger.
func NewBook() *Book {
	return &Book{}
}

// Post validates and appends a balanced double-entry record, returning it.
func (b *Book) Post(req PostRequest, newID func() string) (Entry, error) {
	if req.AmountCents <= 0 || req.AuthID == "" {
		return Entry{}, errInvalidEntry
	}
	tenant := req.TenantID
	if tenant == "" {
		tenant = "default"
	}
	entry := Entry{
		EntryID:     newID(),
		AuthID:      req.AuthID,
		TenantID:    tenant,
		AmountCents: req.AmountCents,
		Debit:       "customer:" + tenant,
		Credit:      "merchant:" + tenant,
	}
	b.mu.Lock()
	b.entries = append(b.entries, entry)
	b.mu.Unlock()
	return entry, nil
}

// Len returns the number of posted entries (used by /metrics + tests).
func (b *Book) Len() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.entries)
}

// uuidV4 is the production ID generator; tests inject a deterministic one.
func uuidV4() string {
	return uuid.NewString()
}
