package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
)

// NewMux builds the ledger routes. The /entries route is HMAC-gated (called
// internally by the payment service); health/ready/metrics are open.
func NewMux(book *Book, hmacActive, hmacPrevious string, now func() int64) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	})
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		_, _ = w.Write([]byte("# TYPE ledger_entries_total counter\n"))
		_, _ = w.Write([]byte("ledger_entries_total " + itoa(int64(book.Len())) + "\n"))
	})

	mux.HandleFunc("/entries", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, 16*1024))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read_failed"})
			return
		}
		tenant, code, reason := verifyInternalHMAC(r, string(raw), hmacActive, hmacPrevious, now())
		if code != http.StatusOK {
			writeJSON(w, code, map[string]string{"error": reason})
			return
		}
		var req PostRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_json"})
			return
		}
		if req.TenantID == "" {
			req.TenantID = tenant
		}
		entry, err := book.Post(req, uuidV4)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_entry"})
			return
		}
		writeJSON(w, http.StatusOK, entry)
	})

	return mux
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	book := NewBook()
	hmacActive := os.Getenv("INTERNAL_HMAC_SECRET")
	hmacPrevious := os.Getenv("INTERNAL_HMAC_SECRET_PREVIOUS")

	shutdown := initTracer("ledger")
	defer shutdown()

	handler := withTracing("ledger", NewMux(book, hmacActive, hmacPrevious, nowMillis))
	log.Printf("ledger listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}
