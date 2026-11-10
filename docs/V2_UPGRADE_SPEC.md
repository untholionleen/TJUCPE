# TJUCPE 2.0 — Upgrade specification and implementation plan

Status: foundation branch; not production-deployed.
Base: `main` (v1.0.0 acceptance baseline).
Branch: `release/v2.0-foundation`.

## 1. Product direction

Version 2 changes the teaching workflow from student-side guided computation to teacher-supervised independent analysis. Preserve v1 accounts, roles, classes, assignments, catalog, reports, review history, RLS, private Storage, and all existing experiment definitions.

### 1.1 Student workflow

1. Student opens only an assignment published to an active class membership.
2. Student downloads the assignment's exact teacher-published workbook template (XLSX; TXT/CSV fallback).
3. Student independently enters raw observations and completes calculations/charts in Excel/Origin/MATLAB or other approved tools.
4. Student submits one workbook plus a report (PDF initially; DOCX/DOC enabled as an explicit assignment policy).
5. The platform stores immutable original uploads, submission versions, timestamps, and file checksums.
6. No automatic student-facing answer key or reference dataset is exposed.

### 1.2 Teacher workflow

1. Teacher creates an experiment workbook template using a column/sheet designer.
2. Teacher defines sheet names, columns, units, data types, required/optional status, validation rules, allowed file types, and template version.
3. Teacher uploads a private reference workbook and optionally defines a reference dataset version.
4. Teacher creates teacher-only reference plots and fit summaries. Fit method and selected data range are explicit, reproducible settings.
5. Teacher publishes the assignment with a specific template version and allowed report formats.
6. Teacher reviews student workbook and report side-by-side, compares data/plots with teacher reference, and annotates the report.
7. Teacher records rubric-based feedback, requests correction, or confirms the grade.

### 1.3 Administrator workflow

Administrators have final oversight across templates, reference data, assignments, teachers, students, audit logs, retention policies, and system health. Admin role remains database-appointed only.

## 2. PDF editor 2.0

The current v1 editor is an annotation canvas merged into a new PDF revision. V2 should provide a document toolbar with:
- Select / pan / text insertion / text box / freehand pen / highlighter / underline / strike-through / rectangle / ellipse / arrow / comment / eraser.
- Text insertion at page coordinates, font family/size/color, alignment, rotation, and multi-line layout.
- Undo/redo, delete selected object, duplicate, zoom, page navigation, fit width/page, and keyboard shortcuts.
- Explicit distinction between overlay annotations and destructive source-text editing. PDF source text editing is not universally reliable; if a PDF uses embedded/subset fonts or scanned pages, offer a clearly labelled overlay/replacement workflow rather than claiming native text reconstruction.
- Chinese font embedding (for example, a properly licensed Noto CJK font) must be tested in browser-generated PDFs. Never rely on standard Helvetica for Chinese glyphs.
- Save creates a new immutable reviewed PDF object; never overwrite the student's original object. Only after successful upload and database confirmation should the current report revision pointer advance.
- Reopening the report must reproduce the same saved content. Student and teacher views resolve the same current revision.

Acceptance: add Chinese and Latin text on multiple pages, draw and erase annotations, undo/redo, save, close, reopen in a fresh session, download, and verify the exported PDF contains the same edits. Simulate upload failure and database failure; original object and current pointer must remain intact.

## 3. Workbook template designer

Template schema (logical model):
- Template: id, experiment_id, owner_teacher_id, title, version, status (draft/published/retired), instructions, allowed_file_types, created_at, published_at.
- Sheet: stable key, display name, order, description.
- Column: stable key, label, unit, data type (number/text/date/category), required, precision, min/max, allowed values, replicate group, formula visibility, order.
- Validation: row-level and cross-column rules, duplicate policy, missing-value policy, decimal separator, accepted encodings.
- Asset: private XLSX/TXT examples and checksums.

Designer must support creating and editing sheets and columns, previewing an empty template, sample rows, downloading XLSX, and exporting a plain-text fallback. Published template versions are immutable; editing creates a new version so existing assignments remain reproducible.

XLSX export must be tested for multi-sheet workbooks, Chinese headers, units, frozen header rows, widths, sample/instruction sheet, and correct import round-trip. TXT export must be a real downloadable Blob with correct UTF-8 BOM/line endings and round-trip parser support.

## 4. Teacher reference-data and comparison workbench

Reference datasets are private teacher/admin assets and are never returned by student-facing queries or Storage policies. Each reference package includes:
- Original teacher workbook and checksum.
- Normalized raw rows, units, column mapping and import warnings.
- Plot definitions: x/y fields, series, labels, axis units, ranges and rendering options.
- Fit model (linear or experiment-specific validated model), fit scope = entire accepted dataset for the default slope calculation, coefficients, units, R², residuals, and excluded-row rationale.
- Provenance: author, version, source document, validation status and timestamps.

Teacher comparison view displays student raw data, student chart/report, teacher reference chart and discrepancy indicators side-by-side. Differences are teaching prompts, not automatic grades. Do not assume a single universal tolerance; tolerance is experiment-specific and teacher-configured.

## 5. Fit policy change

Remove interactive range-selection as a required workflow in v2. Default linear slope uses all valid points in the dataset after transparent validation. Display included/excluded row counts and reasons. If the scientific method requires a restricted interval (e.g. a validated linear region), that interval must be configured and documented by the teacher for that experiment, not guessed by the student UI. Do not use arbitrary polynomial fits as substitutes for physical models.

## 6. Submission contract and stuck-upload prevention

Submission consists of an atomic logical package: workbook + report + metadata. Upload each object to a unique temporary path, verify upload response, persist a submission row with both paths/checksums, then mark the package submitted. If any stage fails, keep the draft state and show the exact failed stage; do not create a phantom submission or invent parsed values.

Requirements:
- Show progress and per-file status; disable duplicate submit only while the request is active.
- Validate extension, MIME, file size, workbook readability, expected template version, sheet names and headers before upload.
- Never silently map unknown columns to numeric data. Import preview must show recognized sheets/columns and rejected rows before acceptance.
- Keep original workbook bytes unchanged. Store parsed normalized data as a derived snapshot with parser version, not as a replacement for the original.
- Idempotency key prevents duplicate submission on retry.
- Retry resumes only missing upload stages.

## 7. Safe class deletion and mandatory export

Class deletion with any linked membership, assignment, submission, workbook or reference:
1. Display a dependency summary (students, assignments, reports, workbook files, reference packages).
2. Require a complete export package before destructive action: CSV roster, assignment list, report metadata, original workbook/report files, reviewed PDFs, revision manifest, grades/feedback and audit metadata, as authorized.
3. Export is generated in a private archive with checksum manifest and a short-lived download link.
4. Require user to download and explicitly confirm the archive. The server records export completion acknowledgement and checksum.
5. Default action is archive/deactivate class, not hard-delete.
6. Hard-delete is a separate admin-only retention action after export and policy checks. Never cascade-delete files merely because a class is removed from the UI.

## 8. Data model additions (proposed; not yet migrated)

Proposed entities:
- `experiment_templates`, `experiment_template_versions`
- `experiment_template_sheets`, `experiment_template_columns`
- `teacher_reference_packages`, `teacher_reference_files`, `teacher_reference_series`, `teacher_reference_fits`
- `submission_packages`, `submission_files`, `submission_validation_results`
- `report_editor_revisions` (if existing report_revisions cannot represent editor state)
- `class_export_jobs`, `class_export_manifests`

Use existing profile/class/assignment/report identifiers where possible. All new tables require RLS, owner/teacher/admin policy tests, audit events, FK/index review, and private Storage policies. No production migration should be applied until the existing live schema and migration history are inspected and the migration passes a disposable Supabase project.

## 9. Security and privacy

- Reference data, template drafts and class export archives are private.
- Students can read only published template versions assigned to their active class tasks; never teacher reference files or teacher-only fit outputs.
- Teachers can manage only their own teaching scope; administrators can inspect all.
- Public frontend contains publishable key only. Secret/service_role credentials remain server-side.
- Audit template publication, reference replacement, grades, report revision changes, exports, archive/delete operations and role changes.
- Do not expose student names, reports, grades, or class exports in GitHub.

## 10. Release phases

### Phase A — compatibility and safety
Inventory live schema, Storage policies, edge functions and v1 flows. Snapshot/backup. Create disposable staging Supabase. Add regression tests before schema changes.

### Phase B — PDF editor
Build object-based editor with text, shapes, pen, highlight, undo/redo and immutable revision save. Test Chinese font embedding and reopen consistency.

### Phase C — template designer
Build teacher/admin workbook designer and deterministic XLSX/TXT exporter/importer with round-trip tests.

### Phase D — reference-data workbench
Private teacher reference upload, validation, plot/fit configuration, teacher comparison view and rubric feedback.

### Phase E — student submission
Download assigned template, upload workbook + report as a package, preview parsed workbook and chart, save immutable submission versions and clear failure/retry states.

### Phase F — class export/archive
Mandatory export manifest and confirmation before archive/delete. Add restore and retention documentation.

### Phase G — acceptance and rollout
Run multi-role RLS tests, file access tests, PDF editor persistence tests, Excel round-trip tests, failed-upload simulations, class export/restore tests, mobile browser tests and full v1 regression suite. Deploy to staging first, then production after owner approval.

## 11. Version and deployment rule

This specification is being added on a separate branch `release/v2.0-foundation`. It does not change the production `main` branch or the currently deployed v1 site. No live database migration or production deployment is performed by this foundation commit. Merge and production rollout require passing CI, staging acceptance, and explicit release approval.

## 12. Immediate acceptance checklist

- [ ] Existing v1 auth, role assignment, classes, assignments, reports, grades and revision history still work.
- [ ] Teacher can create and publish a versioned multi-sheet XLSX template.
- [ ] Student can download the exact assigned template and re-upload it without column corruption.
- [ ] TXT template downloads and round-trips reliably.
- [ ] Student submission requires workbook + configured report format and does not hang.
- [ ] Invalid/unknown data never becomes fabricated numeric rows.
- [ ] Teacher-only reference data is inaccessible to student role at both database and Storage layers.
- [ ] Teacher sees student data and reference plots side-by-side; all-point fit is reproducible.
- [ ] PDF supports Chinese text overlay, edit/delete, undo/redo, save/reopen and immutable versioning.
- [ ] Class export is downloaded and confirmed before archive/delete.
- [ ] All existing v1 regression tests pass.
