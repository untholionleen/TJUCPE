const fs = require("node:fs");
const assert = require("node:assert/strict");

const source = fs.readFileSync("app.js", "utf8");
const start = source.indexOf("  async function buildAnnotatedPdf(){");
const end = source.indexOf("\n  function undoPdfAnnotation()", start);
assert(start >= 0 && end > start, "PDF annotation builder must exist");
const builder = source.slice(start, end);

assert.match(builder, /const sourceBytes=gradingPdfBytes\.slice\(\)/, "PDF-Lib must receive a detached copy of the canonical Uint8Array");
assert.match(builder, /ignoreEncryption:\s*true/, "encrypted PDFs should be handled with an explicit compatibility option");
assert.match(builder, /%PDF-/, "generated PDF must be signature-validated");
assert.match(builder, /Number\.isFinite\(p\?\.x\).*Number\.isFinite\(p\?\.y\)/s, "invalid annotation coordinates must be filtered");

const renderStart = source.indexOf("  async function renderPdfAnnotation(bytes){");
const renderEnd = source.indexOf("\n  async function buildAnnotatedPdf(){", renderStart);
assert(renderStart >= 0 && renderEnd > renderStart, "PDF preview renderer must exist");
const renderer = source.slice(renderStart, renderEnd);
assert.match(renderer, /bytes instanceof Uint8Array\?bytes\.slice\(\):new Uint8Array\(bytes\)\.slice\(\)/,
  "PDF.js must receive its own disposable copy, not the canonical save buffer");
assert.match(source, /gradingPdfBytes=new Uint8Array\(await data\.arrayBuffer\(\)\)/,
  "the canonical save bytes must be kept as a Uint8Array when the report is loaded");

// Simulate the transferable-buffer behavior used by PDF.js workers.
const canonical = Uint8Array.from([37, 80, 68, 70, 45, 49]);
const previewCopy = canonical.slice();
structuredClone(previewCopy.buffer, { transfer: [previewCopy.buffer] });
assert.equal(previewCopy.byteLength, 0, "transferred preview copy should be detached");
assert.equal(canonical.byteLength, 6, "canonical save bytes must remain attached");
assert.deepEqual(Array.from(canonical), [37, 80, 68, 70, 45, 49]);

const saveStart = source.indexOf("  async function saveGrade(){");
const saveEnd = source.indexOf("\n  let adminUsersCache=[];", saveStart);
assert(saveStart >= 0 && saveEnd > saveStart, "PDF review save handler must exist");
const save = source.slice(saveStart, saveEnd);
for (const stage of ["生成带批注的 PDF", "上传批阅版 PDF", "写入批阅记录与版本历史", "确认数据库是否已经接收批阅版"]) {
  assert(save.includes(stage), `missing save stage: ${stage}`);
}
assert.match(save, /if\(!confirmError&&confirmedRow&&confirmedRow\.storage_path!==newPath\)/, "cleanup is allowed only after a successful confirmation that the old path remains current");
assert.match(save, /if\(!confirmError&&confirmedRow\?\.storage_path===newPath\)/, "a committed PDF must be recognized after a lost response");
assert.match(save, /数据库确认请求也未成功，临时文件已保留/, "ambiguous commit must preserve the uploaded file");
assert.match(save, /失败阶段：\"\+failedStage/, "the user must see the stage that actually failed");

console.log("PDF review-save safety smoke test passed.");
