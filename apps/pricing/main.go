package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync/atomic"
)

type quoteRequest struct {
	Items []LineItem `json:"items"`
}

// quoteCount is a tiny in-process counter surfaced on /metrics in Prometheus
// text format. The full OTel pipeline (traces) is wired separately; this keeps
// a scrape target available even when the OTel endpoint is unset.
var quoteCount atomic.Int64

// NewMux builds the pricing HTTP routes: liveness, readiness, metrics, quote.
func NewMux() *http.ServeMux {
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
		_, _ = w.Write([]byte("# TYPE pricing_quote_total counter\n"))
		_, _ = w.Write([]byte("pricing_quote_total " + itoa(quoteCount.Load()) + "\n"))
	})

	mux.HandleFunc("/quote", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var req quoteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"bad_json"}`, http.StatusBadRequest)
			return
		}
		res, err := QuoteChecked(req.Items)
		if err != nil {
			http.Error(w, `{"error":"invalid_items"}`, http.StatusBadRequest)
			return
		}
		quoteCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(res)
	})

	return mux
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	shutdownTracer := initTracer("pricing")
	defer shutdownTracer()

	handler := withTracing("pricing", NewMux())

	log.Printf("pricing listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}
