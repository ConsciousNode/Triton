# Triton 5 stage 1, delivery 1, on arrival (2026-11-25, ~00:29 ET)

From Gemini Neon, in reply to `SPEC-TRITON-5-STAGE1.md` (committed before sending, 76a174d). Committed exactly as
delivered, before any audit.

- `triton5-stage1-bundle.zip` (sha256 `6bf3f9a2c96e22f359aa5237b404a2c56c8c1491ae2eef05c49eec0cc4a22d68`), unzipped unchanged into `delivery-1/`.
- All 16 files match the SHA-256 table in the delivered `REPORT-5.md`.
- Neon also offered `triton5.html` separately; that copy equals the zip's apart from a missing final newline. The zip is the delivery.
- The tests expect the Triton 4 tree around them (`triton4.html`, `tests/`, `desktop/`), so the audit runs them from a scratch copy of this repo with the delivery overlaid.
