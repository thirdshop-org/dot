package nlp

type NLPRequest struct {
	Text string `json:"text"`
}

type NLPResponse struct {
	ErrorCode int        `json:"errorCode"`
	Result    NLPResult  `json:"result"`
	Message   string     `json:"message,omitempty"`
}

type NLPResult struct {
	Entities    []NLPEntity  `json:"entities"`
	Tokens      []NLPToken   `json:"tokens"`
	NounChunks  []string     `json:"noun_chunks"`
	Sentences   []string     `json:"sentences"`
}

type NLPEntity struct {
	Text       string  `json:"text"`
	Label      string  `json:"label"`
	Start      int     `json:"start"`
	End        int     `json:"end"`
	Confidence float64 `json:"confidence"`
}

type NLPToken struct {
	Text    string `json:"text"`
	Lemma   string `json:"lemma"`
	POS     string `json:"pos"`
	Tag     string `json:"tag"`
	Dep     string `json:"dep"`
	IsStop  bool   `json:"is_stop"`
}

type AnalyzedFile struct {
	Entities    []NLPEntity `json:"entities"`
	NounChunks  []string    `json:"noun_chunks"`
	Sentences   []string    `json:"sentences"`
}
