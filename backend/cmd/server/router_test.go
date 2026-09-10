package main

import (
	"testing"
)

// expectedRoutes mirrors the endpoints in mobile/api/client.ts (the contract).
// Paths are full (under /api/v1), methods match the client calls exactly.
var expectedRoutes = []string{
	"GET /api/v1/health",
	"POST /api/v1/devices",

	"GET /api/v1/files",
	"GET /api/v1/files/:id",
	"DELETE /api/v1/files/:id",
	"GET /api/v1/files/search",
	"GET /api/v1/files/folders",
	"POST /api/v1/files/upload",

	"POST /api/v1/ocr/jobs",
	"GET /api/v1/ocr/jobs/:id",

	"POST /api/v1/sync/ops",
	"GET /api/v1/sync/permissions",
}

func TestRoutesMatchClientContract(t *testing.T) {

	registered := map[string]bool{}
	for _, route := range newRouter().Routes() {
		registered[route.Method+" "+route.Path] = true
	}

	for _, want := range expectedRoutes {
		if !registered[want] {
			t.Errorf("missing route %q — must mirror mobile/api/client.ts", want)
		}
	}

}
