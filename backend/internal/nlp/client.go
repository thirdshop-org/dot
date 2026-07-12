package nlp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	endpoint   string
	httpClient *http.Client
}

func NewClient(endpoint string) *Client {
	return &Client{
		endpoint: endpoint,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

func (c *Client) Analyze(text string) (*AnalyzedFile, error) {
	reqBody, err := json.Marshal(NLPRequest{Text: text})
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(
		c.endpoint+"/nlp",
		"application/json",
		bytes.NewReader(reqBody),
	)
	if err != nil {
		return nil, fmt.Errorf("call nlp server: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nlp server returned %d: %s", resp.StatusCode, string(body))
	}

	var nlpResp NLPResponse
	if err := json.Unmarshal(body, &nlpResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if nlpResp.ErrorCode != 0 {
		return nil, fmt.Errorf("nlp error %d: %s", nlpResp.ErrorCode, nlpResp.Message)
	}

	result := &AnalyzedFile{
		Entities:   nlpResp.Result.Entities,
		NounChunks: nlpResp.Result.NounChunks,
		Sentences:  nlpResp.Result.Sentences,
	}

	return result, nil
}

func (c *Client) HealthCheck() error {
	resp, err := c.httpClient.Get(c.endpoint + "/health")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check failed: status %d", resp.StatusCode)
	}
	return nil
}
