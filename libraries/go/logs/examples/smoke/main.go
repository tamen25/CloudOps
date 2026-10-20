// Smoke test consumer for the cloudops-otel-logs Go library. Exercises every
// public surface and exits 0 when the library is wired correctly.
package main

import (
	"errors"
	"fmt"
	"os"

	logs "github.com/cloudops/otel-logs"
)

func main() {
	os.Setenv("OTEL_SERVICE_NAME", "smoke-test")
	os.Setenv("OTEL_LOGS_SAMPLING_RATE", "0") // process every entry

	logger := logs.NewCloudOpsLogger("smoke-test")

	logger.Info("info line", map[string]any{"k": "v"})
	logger.Warn("warn line")
	logger.Debug("debug line")
	logger.Error(errors.New("boom"))

	if err := logger.ExportLogs(); err != nil {
		fmt.Fprintln(os.Stderr, "ExportLogs failed:", err)
		os.Exit(1)
	}

	if logger.ResourceAttributes["service.name"] != "smoke-test" {
		fmt.Fprintln(os.Stderr, "service.name not propagated")
		os.Exit(1)
	}
	if !logger.EnabledLevels[logs.LevelError] {
		fmt.Fprintln(os.Stderr, "error level not enabled by default")
		os.Exit(1)
	}

	fmt.Println("ok — go smoke")
}
