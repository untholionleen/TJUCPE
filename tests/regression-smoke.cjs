const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("app.js", "utf8");
const start = source.indexOf("  function solveLinearSystem");
const end = source.indexOf("  function clearAnalysis", start);
assert.ok(start >= 0 && end > start, "calculation engine functions must remain in app.js");
const polyFit = new Function(source.slice(start, end) + "; return polyFit;")();

function close(actual, expected, epsilon = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${expected}, received ${actual}`);
}

const linear = polyFit([{x:0,y:2},{x:1,y:5},{x:2,y:8},{x:3,y:11}], 1);
close(linear.coefficients[0], 2);
close(linear.coefficients[1], 3);
close(linear.r2, 1);

const quadratic = polyFit([0,1,2,3,4].map(x => ({x,y:1+2*x+3*x*x})), 2);
close(quadratic.coefficients[0], 1);
close(quadratic.coefficients[1], 2);
close(quadratic.coefficients[2], 3);
close(quadratic.r2, 1);

const cubic = polyFit([0,1,2,3,4,5].map(x => ({x,y:1-2*x+0.5*x*x+0.25*x*x*x})), 3);
close(cubic.coefficients[0], 1);
close(cubic.coefficients[1], -2);
close(cubic.coefficients[2], 0.5);
close(cubic.coefficients[3], 0.25);
close(cubic.r2, 1);

assert.throws(() => polyFit([{x:0,y:1},{x:1,y:2}], 2), /至少/);
assert.ok(source.includes("function mapExcelTable"), "experiment-specific Excel workbook importer must be present");
for (const slug of ["surface-tension","saponification","rectorite-adsorption","galvanic-cell","phase-diagram","boiling-composition","reaction-enthalpy","freezing-point","equilibrium-constant","thermostat-viscosity","passivation"]) {
  assert.ok(source.includes('slug==="' + slug + '"'), "Excel mapping must include " + slug);
}

assert.ok(source.includes('queryParams.get("token_hash")'), "email recovery must support token_hash links to avoid scanner-prefetched ConfirmationURL links");
assert.ok(source.includes("async function confirmPendingEmailToken"), "email verification must wait for an explicit user click to avoid email link prefetch scanners");
assert.ok(source.includes("db.auth.verifyOtp({token_hash:pending.tokenHash,type:pending.type})"), "email token hash must be verified through Auth verifyOtp on explicit confirmation");
assert.ok(source.includes('$("confirmEmailToken").addEventListener("click",confirmPendingEmailToken)'), "email confirmation button must be wired");
assert.ok(source.includes("async function generatePythonPlot"), "Matplotlib runtime must be explicit/optional, not auto-started for every run");
assert.ok(!source.includes("renderPythonMatplotlib(def,result).catch"), "analysis must not download Pyodide automatically");
assert.ok(source.includes('$("renderPythonPlot").addEventListener'), "Python plot button must be wired");
console.log("TJUCPE regression smoke tests passed (linear, quadratic, cubic, insufficient sample guard).");

const html = fs.readFileSync("index.html", "utf8");
assert.ok(html.includes('id="savePdfAnnotations"'), "PDF annotation toolbar must expose an explicit save action");
assert.ok(source.includes('$("savePdfAnnotations").addEventListener("click",saveGrade)'), "PDF annotation save action must be wired");
assert.ok(source.includes('.select("id,storage_path,file_name,status,submission_version,review_annotations,score,feedback,reviewed_at,reviewed_by")'), "PDF save must request the persisted report row");
assert.ok(source.includes(".single();"), "PDF save must confirm exactly one updated report row");
assert.ok(source.includes("confirmedRow?.storage_path===newPath"), "ambiguous network responses must re-check the current report path before cleanup");
