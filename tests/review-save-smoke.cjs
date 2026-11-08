const fs = require("node:fs");
const assert = require("node:assert/strict");

const source = fs.readFileSync("app.js", "utf8");
const start = source.indexOf("  async function buildAnnotatedPdf(){");
const end = source.indexOf("\n  function undoPdfAnnotation()", start);
assert(start >= 0 && end > start, "PDF annotation builder must exist");
const builder = source.slice(start, end);

assert.match(source, /let gradingPdfBlob = null/, "canonical PDF source must be an immutable Blob");
assert.doesNotMatch(source, /gradingPdfBytes/, "detached typed-array state must not be retained across PDF.js worker transfers");
assert.match(builder, /new Uint8Array\(await gradingPdfBlob\.arrayBuffer\(\)\)/, "PDF-Lib must receive a fresh ArrayBuffer from the canonical Blob on each save");
assert.match(builder, /ignoreEncryption:\s*true/, "encrypted PDFs should be handled with an explicit compatibility option");
assert.match(builder, /%PDF-/, "generated PDF must be signature-validated");
assert.match(builder, /Number\.isFinite\(p\?\.x\).*Number\.isFinite\(p\?\.y\)/s, "invalid annotation coordinates must be filtered");

const renderStart = source.indexOf("  async function renderPdfAnnotation(pdfBlob){");
const renderEnd = source.indexOf("\n  async function buildAnnotatedPdf(){", renderStart);
assert(renderStart >= 0 && renderEnd > renderStart, "PDF preview renderer must exist");
const renderer = source.slice(renderStart, renderEnd);
assert.match(renderer, /const previewBuffer=await pdfBlob\.arrayBuffer\(\)/,
  "PDF.js must receive a disposable ArrayBuffer from the canonical Blob");
assert.match(source, /gradingPdfBlob=data/, "the original downloaded Blob must remain canonical");

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

// Each Blob.arrayBuffer() call yields an independent buffer; transferring the preview
// buffer must not detach the Blob or the buffer created later for PDF-Lib.
(async () => {
  const canonicalBlob = new Blob([Uint8Array.from([37, 80, 68, 70, 45, 49])], { type: "application/pdf" });
  const previewBuffer = await canonicalBlob.arrayBuffer();
  structuredClone(previewBuffer, { transfer: [previewBuffer] });
  assert.equal(previewBuffer.byteLength, 0, "transferred PDF.js preview buffer should be detached");
  const saveBuffer = await canonicalBlob.arrayBuffer();
  assert.equal(saveBuffer.byteLength, 6, "fresh PDF-Lib save buffer must remain attached");
  assert.deepEqual(Array.from(new Uint8Array(saveBuffer)), [37, 80, 68, 70, 45, 49]);
  console.log("PDF review-save safety smoke test passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
