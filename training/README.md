# Training Jimsa

Jimsa is Jimsabz Agent's friendly identity. The welcome greeting is scripted.
Its local model learns which supported task a request describes, and learns code-token frequencies. Parameterized code builders create the Jimsabz source; the real compiler checks it before the editor reveals each line. This is not a fine-tuned code LLM.

The current corpus has 497 compiler-validated Jimsabz targets: 380 training requests and 117 held-out requests. Raw intent-classification accuracy is 100/117 (85.5%) on the expanded curated set. This score measures the classifier alone: grounded language help and explicit marks/statistics/range routing are separate. It does not measure arbitrary programming ability. English, Roman Urdu/Sindhi, variable counts and selected native-script requests are included. Many targets share builders; no large language model was fine-tuned.

## Add examples and retrain

You need Node.js and Python only for training. Running the included app needs neither.

1. Open `tests/make-curriculum.mjs`. Add natural-language requests under a supported intent. Put new independent evaluation phrasings in `test`; keep them out of `train`. All code targets must be Jimsabz.
2. Run `node tests/make-curriculum.mjs`. It builds every target and checks it with the compiler before writing `training/curriculum.jsonl`.
3. Run `python3 training/train.py` (Windows: `py training/train.py`). Training revalidates every target and rejects requests shared between training and evaluation. Invalid data stops training before the model is replaced.
4. Inspect `training/evaluation.json`, including incorrect predictions. Do not copy held-out evaluation requests into training to improve the score.
5. Run `node tests/browser.test.mjs` in the desktop download, or `node tests/core.test.mjs` in the hosted source checkout. Also run `node tests/agent-writing.test.mjs`.
6. Reload Studio to load the new model. Check a few new requests in the agent and run its generated code.

`training/train.py` writes `studio/agent/model.json` in the download (`dist/agent/model.json` in the hosted source). It also updates the evaluation report and records the dataset SHA-256 in the model.

For a new capability, first implement and verify its code builder in `studio/agent/builders.mjs` (or `dist/agent/builders.mjs`), add it to `tasks`, and add training and independent evaluation examples. More paraphrases alone cannot teach a builder new program logic.

Chat prompts do not automatically retrain Jimsa. No chats or source files are sent to an external AI service. Every generated program goes into a new file; Stop writing keeps a clearly identified partial draft.

Marks generation uses a parsed program specification, not a fixed number of inputs: positive subject counts or runtime counts, decimal maxima, names, custom questions, average, per-subject percentages and data-driven grading rules. The compiler checks each generated target. `statistics` supports general totals/averages over a requested or runtime array size. Grounded Q&A is maintained in `studio/agent/knowledge.mjs` (`dist/agent/knowledge.mjs` in hosted source). It is reference content, not learned model memory.

Number words come from a canonical JSON vocabulary, shared by browser and native builds through `scripts/sync-sindhi-numbers.mjs`. Editing word spellings changes the language vocabulary; add round-trip and interoperability checks in `tests/features-v5.test.mjs`. Uploaded reports choose supported builders and record remaining requirements in a coverage plan.

The request planner also normalizes common prose spelling and polite command wrappers, distinguishes simple percentages from grade reports, and composes local login/hub projects. These deterministic requirements rules are separate from raw intent classification. Login outputs are temporary local demos; they do not implement a production authentication service.
