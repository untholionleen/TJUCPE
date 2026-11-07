const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("experiment-engine.js", "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { timeout: 5000 });
const engine = sandbox.window.TJUCPE_EXPERIMENT_ENGINE;
assert.ok(engine, "dedicated engine must expose its public API");
assert.equal(engine.definitions.length, 14, "all fourteen experiment workspaces must be registered");

const bySlug = Object.fromEntries(engine.definitions.map(x => [x.slug, x]));
const run = (slug, tables, settings = {}, selection = []) => {
  const result = engine.analyze(slug, tables, settings, selection);
  assert.ok(Array.isArray(result.series) && result.series.length > 0, slug + " should return plot series");
  assert.ok(Array.isArray(result.metrics), slug + " should return metric summary");
  return result;
};

const close = (actual, expected, tolerance = 1e-4) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, "expected " + expected + ", got " + actual);

// PC-01: Szyszkowski pressure calibration, Gibbs excess and Langmuir linearisation.
const conc = [0, .05, .1, .15, .2, .25, .3];
const gamma = conc.map(c => 73.02 - 20 * Math.log(1 + 5 * c));
const pRows = conc.map((c,i) => {
  const dp = gamma[i] / 73.02 * 1000;
  return [c, dp - .1, dp, dp + .1].join("\t");
}).join("\n");
const r1 = run("surface-tension", {main:pRows}, {T_C:20.7,water_gamma:73.02,dp_water:1000});
assert.ok(r1.metrics.some(x => x[0] === "分子截面积"));
assert.ok(r1.series.some(x => x.name.includes("Szyszkowski") || x.name.includes("表面张力")));

// PC-02: conductivity kinetics and Arrhenius two-temperature calculation.
const sap = [
"0\t2.18\t2.45","1\t2.07\t2.29","2\t1.98\t2.15","3\t1.90\t2.03",
"4\t1.82\t1.92","5\t1.76\t1.83","6\t1.70\t1.75"
].join("\n");
const r2 = run("saponification",{main:sap},{T1_C:30,T2_C:35,kappa0_1:2.18,kappaInf_1:.81,kappa0_2:2.45,kappaInf_2:.75,c0:.005});
assert.ok(r2.metrics.some(x => x[0] === "Ea"));

// PC-03: calibration curve, source workbook's delta-C adsorption ordinates.
const cal = "0\t0\n1\t.129\n2\t.345\n3\t.489\n4\t.740\n5\t.939\n6\t1.082";
const ads = "40\t.0270\t.014\t1\n80\t.0265\t.016\t1\n120\t.0271\t.620\t1\n160\t.0273\t.327\t10\n200\t.0273\t.856\t10\n240\t.0263\t.193\t100";
const r3 = run("rectorite-adsorption",{calibration:cal,samples:ads},{});
assert.ok(r3.warnings.some(x => x.includes("未提供吸附液体积")) || r3.warnings.length > 0);
assert.equal(r3.rawRows.length,6);

// PC-04: Smoluchowski zeta potential and coagulation thresholds.
const r4 = run("zeta-potential",{main:"1800\t50\t.074\t.079\t.074\t.071\t.0025\t.0025\t.0001"},{gap_m:.357,eta_Pa_s:.001,epsilon_r:78.3});
assert.ok(Number.isFinite(r4.metrics[0][1]));

// PC-05: galvanic cell E-T slope and thermodynamic functions.
const r5 = run("galvanic-cell",{main:"25\t5.2444\t5.2440\n30\t5.2260\t5.2210\n35\t5.2014\t5.2014\n40\t5.1707\t5.1727\n45\t5.1423\t5.1412"},{n_e:2});
assert.ok(r5.metrics.some(x => x[0] === "ΔrHm（首个温度）"));

// PC-06: Sn-Pb cooling curves with the 61.9 wt% Sn eutectic reference.
const phase = [
"10\t243.7\t260.8\t204.8\t218.2\t351.3",
"20\t238.1\t257.0\t202.2\t214.9\t345.7",
"30\t235.7\t253.4\t199.3\t211.3\t338.3",
"40\t234.7\t250.4\t196.8\t208.1\t333.8",
"50\t234.0\t247.3\t194.6\t205.8\t330.9",
"60\t233.4\t244.5\t192.3\t203.4\t329.1",
"70\t233.0\t241.6\t190.5\t201.4\t327.9",
"80\t232.7\t238.3\t188.7\t199.7\t327.0",
"90\t232.5\t235.1\t187.3\t198.2\t326.3",
"100\t232.4\t232.8\t186.0\t198.0\t325.5"
].join("\n");
const r6 = run("phase-diagram",{main:phase},{eutectic_C:183,eutecticSn_pct:61.9});
assert.ok(r6.series.length >= 5);

// PC-07: ethanol-propanol refractive index calibration and T-x-y.
const refr = "0\t1.3619\n10\t1.3638\n20\t1.3665\n30\t1.3688\n40\t1.3711\n50\t1.3735\n60\t1.3760\n70\t1.3781\n80\t1.3808\n90\t1.3831\n100\t1.3854";
const bp = "81.23\t1.3637\t1.3661\n83.90\t1.3666\t1.3695\n85.62\t1.3691\t1.3734\n88.00\t1.3740\t1.3780";
const r7 = run("boiling-composition",{calibration:refr,samples:bp},{});
assert.equal(r7.series.length,3);

// PC-08: calorimeter K calibration and ZnO-HCl corrected enthalpy.
const beforeK="1\t5.70\n2\t5.71\n3\t5.72\n4\t5.73";
const afterK="7\t5.50\n8\t5.49\n9\t5.48\n10\t5.47";
const beforeR="1\t4.55\n2\t4.56\n3\t4.57\n4\t4.58";
const afterR="7\t6.20\n8\t6.21\n9\t6.22\n10\t6.23";
const r8 = run("reaction-enthalpy",{kclBefore:beforeK,kclAfter:afterK,rxnBefore:beforeR,rxnAfter:afterR},{
  eventKCl:6,eventRxn:6,massKCl_g:10.7207,water_g:500,deltaH_KCl_kJmol:17.2,cpWater:4.184,cpKCl:.69,
  massZnO_g:1.0683,massHCl_g:498.3,cpZnO:.46,cpHCl:4.134
});
assert.ok(r8.metrics.some(x => x[0] === "量热计热容 K"));

// PC-09: source workbook has three time segments for each run, not one shared X column.
const solv = [
"10\t.662\t110\t.095\t210\t.103\t.823\t.126\t.101",
"20\t.610\t120\t.091\t220\t.105\t.761\t.108\t.103",
"30\t.522\t130\t.089\t230\t.107\t.668\t.090\t.104",
"40\t.449\t140\t.090\t240\t.102\t.603\t.088\t.103",
"50\t.382\t150\t.093\t250\t.104\t.561\t.087\t.102",
"60\t.350\t160\t.097\t260\t.105\t.456\t.090\t.102"
].join("\n");
const soln = [
"10\t.663\t110\t-.431\t210\t-.942\t.844\t-.538\t-.942",
"20\t.539\t120\t-.541\t220\t-.945\t.483\t-.660\t-.948",
"30\t.427\t130\t-.664\t230\t-.950\t.322\t-.741\t-.955",
"40\t.295\t140\t-.751\t240\t-.956\t.240\t-.835\t-.959",
"50\t.194\t150\t-.835\t250\t-.962\t.100\t-.910\t-.965",
"60\t.098\t160\t-.923\t260\t-.967\t-.102\t-.982\t-.968"
].join("\n");
const r9 = run("freezing-point",{solvent:solv,solution:soln},{Kf:20,mSolvent_g:19.32,mSolute_g:.1264,TfSolvent: .103,TfSolution:-.902});
assert.ok(r9.metrics.some(x => x[0] === "萘摩尔质量"));

// PC-10: ammonium carbamate equilibrium and van't Hoff relation.
const r10 = run("equilibrium-constant",{main:"30\t-85.5\t102.1\n35\t-78.1\t102.1\n40\t-68.9\t102.1\n45\t-56.3\t102.1\n50\t-39.6\t102.1"},{pStandard_kPa:100});
assert.ok(r10.warnings.some(x => x.includes("核对上传 Excel")));

// PC-11: ethanol vapour pressure and Clausius-Clapeyron slope.
const r11 = run("vapour-pressure",{main:"60\t-80\t101.3\n65\t-70\t101.3\n70\t-55\t101.3\n75\t-30\t101.3\n78\t-10\t101.3"},{normalPressure_kPa:101.325});
assert.ok(r11.metrics.some(x => x[0] === "平均汽化焓"));

// PC-12: separate 220 V, 110 V and viscometer data blocks.
const w220="30\t35.10\n60\t34.98\n90\t34.91\n120\t34.82\n150\t34.98";
const w110="30\t35.14\n60\t35.09\n90\t35.03\n120\t34.98\n150\t34.95";
const visc="170.53\t170.42\t170.59\t108.83\t108.90\t108.52";
const r12 = run("thermostat-viscosity",{wave220:w220,wave110:w110,viscosity:visc},{rhoEthanol:776.7,rhoWater:993.9,etaWater_mPa_s:.7225});
assert.ok(r12.metrics.some(x => x[0] === "乙醇黏度"));

// PC-13: first-order catalytic peroxide decomposition using V-infinity inputs.
const r13 = run("hydrogen-peroxide",{main:"0\t0\t0\t0\n1\t2.0\t2.5\t1.4\n2\t3.6\t4.2\t2.7\n3\t4.8\t5.4\t3.9\n4\t5.7\t6.2\t4.8"},{Vinf1:10,Vinf2:11,Vinf3:9});
assert.ok(r13.metrics.some(x => x[0] === "k' 条件 1"));

// PC-14: selectable Tafel interval; fit the selected points only.
const pass = [
"-1500\t-0.15\t-1500\t-0.10\t-1500\t-0.12\t-1500\t-0.08",
"-1490\t-0.20\t-1490\t-0.16\t-1490\t-0.17\t-1490\t-0.12",
"-1480\t-0.25\t-1480\t-0.22\t-1480\t-0.23\t-1480\t-0.18",
"-1470\t-0.30\t-1470\t-0.28\t-1470\t-0.29\t-1470\t-0.24",
"-1460\t-0.35\t-1460\t-0.34\t-1460\t-0.35\t-1460\t-0.30",
"-1450\t-0.40\t-1450\t-0.40\t-1450\t-0.41\t-1450\t-0.36"
].join("\n");
const r14 = run("passivation",{main:pass},{condition:1},[0,1,2,3]);
assert.ok(r14.fit && r14.metrics.some(x => x[0] === "Tafel 斜率"));

console.log("TJUCPE dedicated experiment smoke tests passed: 14 experiment workflows.");
