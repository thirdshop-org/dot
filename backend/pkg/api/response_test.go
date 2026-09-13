package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func setupRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/ok", func(c *gin.Context) { OK(c, gin.H{"id": "abc"}) })
	r.GET("/list", func(c *gin.Context) { OKList(c, []int{1, 2}, 3, 50, 123) })
	r.GET("/err", func(c *gin.Context) { Error(c, 400, "BAD_REQUEST", "some message") })
	r.GET("/nope", func(c *gin.Context) { NotImplemented(c) })
	return r
}

func TestEnvelopeShapes(t *testing.T) {
	r := setupRouter()

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ok", nil))
	if rec.Code != 200 {
		t.Fatalf("status: %d", rec.Code)
	}
	var okBody struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &okBody); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if okBody.Data.ID != "abc" {
		t.Errorf("data inattendu: %s", rec.Body.String())
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/list", nil))
	var listBody struct {
		Data []int `json:"data"`
		Meta struct {
			Page     int `json:"page"`
			PageSize int `json:"pageSize"`
			Total    int `json:"total"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listBody); err != nil {
		t.Fatalf("unmarshal list: %v", err)
	}
	if len(listBody.Data) != 2 || listBody.Meta.Page != 3 || listBody.Meta.PageSize != 50 || listBody.Meta.Total != 123 {
		t.Errorf("enveloppe list inattendue: %s", rec.Body.String())
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/err", nil))
	if rec.Code != 400 {
		t.Fatalf("status err: %d", rec.Code)
	}
	var errBody struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &errBody); err != nil {
		t.Fatalf("unmarshal err: %v", err)
	}
	if errBody.Error.Code != "BAD_REQUEST" || errBody.Error.Message != "some message" {
		t.Errorf("enveloppe erreur inattendue: %s", rec.Body.String())
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/nope", nil))
	if rec.Code != 501 || errorCodeOf(rec) != NotImplementedCode {
		t.Errorf("not implemented: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func errorCodeOf(rec *httptest.ResponseRecorder) string {
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return body.Error.Code
}
