/* TJUCPE experiment-specific calculation engine.
 * Methods are derived from the uploaded TJU physical-chemistry experiment reports,
 * workbooks and the user's Python surface-tension script. Any unprovided constants
 * remain explicit inputs; no hidden teaching constants are silently assumed.
 */
(() => {
  "use strict";
  const R = 8.31446261815324, F = 96485.33212, EPS0 = 8.8541878128e-12, NA = 6.02214076e23;
  const num = (v, fallback = NaN) => {
    const raw = String(v ?? "").trim().replace(/,/g, "");
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const rowsOf = (text) => {
    const lines = String(text || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return [];
    const split = s => /[\t,，;；]/.test(s) ? s.split(/[\t,，;；]/).map(x => x.trim()) : s.split(/\s+/).map(x => x.trim());
    const first = split(lines[0]);
    const hasHeader = first.some(x => x && !Number.isFinite(Number(x)));
    return lines.slice(hasHeader ? 1 : 0).map(split).filter(x => x.length >= 2);
  };
  const parse = text => rowsOf(text);
  const matrix = (text, width) => rowsOf(text).map(r => r.slice(0,width).map(num)).filter(r => r.length === width && r.every(Number.isFinite));
  const solve = (A, b) => {
    const n=b.length, M=A.map((r,i)=>r.slice().concat(b[i]));
    for(let i=0;i<n;i++){
      let p=i; for(let j=i+1;j<n;j++) if(Math.abs(M[j][i])>Math.abs(M[p][i])) p=j;
      [M[i],M[p]]=[M[p],M[i]];
      if(Math.abs(M[i][i])<1e-14) throw new Error("拟合矩阵奇异，请检查所选数据区间。");
      const d=M[i][i]; for(let k=i;k<=n;k++) M[i][k]/=d;
      for(let j=0;j<n;j++) if(j!==i){const f=M[j][i];for(let k=i;k<=n;k++)M[j][k]-=f*M[i][k];}
    }
    return M.map(r=>r[n]);
  };
  const linear = points => {
    const p=points.filter(x=>Number.isFinite(x.x)&&Number.isFinite(x.y));
    if(p.length<2) throw new Error("线性拟合至少需要 2 个有效点。");
    const sx=p.reduce((s,x)=>s+x.x,0), sy=p.reduce((s,x)=>s+x.y,0);
    const sxx=p.reduce((s,x)=>s+x.x*x.x,0), sxy=p.reduce((s,x)=>s+x.x*x.y,0);
    const den=p.length*sxx-sx*sx;
    if(Math.abs(den)<1e-18) throw new Error("X 值没有变化，无法进行线性拟合。");
    const slope=(p.length*sxy-sx*sy)/den, intercept=(sy-slope*sx)/p.length;
    const mean=sy/p.length, residuals=p.map(x=>x.y-(intercept+slope*x.x));
    const sse=residuals.reduce((s,x)=>s+x*x,0), sst=p.reduce((s,x)=>s+(x.y-mean)**2,0);
    const r2=sst===0?1:1-sse/sst;
    return {slope,intercept,r2,sse,rmse:Math.sqrt(sse/Math.max(1,p.length-2)),n:p.length,residuals,predict:x=>intercept+slope*x};
  };
  const selectPoints = (points, selected) => {
    if(!Array.isArray(selected)||!selected.length) return points;
    const set=new Set(selected);
    return points.filter(p=>set.has(p.i));
  };
  const linearRange = (points, selected) => linear(selectPoints(points,selected));
  const curve = (fit, min, max, count=160) => Array.from({length:count},(_,i)=>{const x=min+(max-min)*i/(count-1);return{x,y:fit.predict(x)};});
  const stats = ys => {
    const a=ys.filter(Number.isFinite); if(!a.length) return {};
    const mean=a.reduce((s,x)=>s+x,0)/a.length;
    return {mean,sd:a.length>1?Math.sqrt(a.reduce((s,x)=>s+(x-mean)**2,0)/(a.length-1)):0};
  };
  const lm3 = (xs, ys, fn, initial, bounds) => {
    let p=initial.slice(), lambda=1e-3;
    const clamp=(v,i)=>Math.max(bounds[0][i],Math.min(bounds[1][i],v));
    const sse=q=>ys.reduce((s,y,i)=>s+(y-fn(xs[i],q))**2,0);
    let best=sse(p);
    for(let iter=0;iter<300;iter++){
      const J=xs.map(x=>p.map((v,j)=>{const h=Math.max(1e-7,Math.abs(v)*1e-5),q=p.slice();q[j]+=h;return(fn(x,q)-fn(x,p))/h;}));
      const residual=ys.map((y,i)=>y-fn(xs[i],p));
      const A=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>J.reduce((s,row)=>s+row[i]*row[j],0)+(i===j?lambda:0)));
      const b=Array.from({length:3},(_,i)=>J.reduce((s,row,k)=>s+row[i]*residual[k],0));
      let delta; try{delta=solve(A,b);}catch(_){break;}
      const q=p.map((v,i)=>clamp(v+delta[i],i)), value=sse(q);
      if(value<best){p=q;if(Math.abs(best-value)<1e-12*(1+best))break;best=value;lambda=Math.max(1e-10,lambda/3);}
      else lambda=Math.min(1e10,lambda*10);
    }
    return {params:p,sse:best};
  };
  const fitSzyszkowski = (c,gamma) => {
    if(c.length<4) throw new Error("Szyszkowski 三参数拟合至少需要 4 个有效浓度点。");
    const fn=(x,p)=>p[0]-p[1]*Math.log(1+p[2]*x);
    const g0=Math.max(...gamma), amp=Math.max(0.1,g0-Math.min(...gamma));
    const opt=lm3(c,gamma,fn,[g0,20,5],[ [50,0.1,1e-4],[100,200,1000] ]);
    const p=opt.params, mean=gamma.reduce((s,x)=>s+x,0)/gamma.length;
    const sst=gamma.reduce((s,x)=>s+(x-mean)**2,0), r2=sst?1-opt.sse/sst:1;
    return {gamma0:p[0],a:p[1],b:p[2],r2,sse:opt.sse,predict:x=>fn(x,p)};
  };
  const fitPlateau = (points, width=5) => {
    if(points.length<width) return null;
    let best=null;
    for(let i=0;i<=points.length-width;i++){
      const chunk=points.slice(i,i+width), f=linear(chunk);
      const score=Math.abs(f.slope);
      if(!best||score<best.score) best={start:i,end:i+width-1,score,temp:stats(chunk.map(p=>p.y)).mean,fit:f};
    }
    return best;
  };
  const makeSeries=(name,points,fit,labels={})=>({name,points,fitCurve:fit&&points.length?curve(fit,Math.min(...points.map(p=>p.x)),Math.max(...points.map(p=>p.x))):null,xLabel:labels.x||"X",yLabel:labels.y||"Y"});
  const readSettings = (s, fields) => Object.fromEntries(fields.map(f=>[f.key,num(s[f.key],f.defaultValue??NaN)]));
  const defs = [
    {
      slug:"surface-tension", code:"PC-01", name:"最大泡压法测定液体的表面张力", workflow:"surface_tension",
      tables:[{key:"main",title:"压力与浓度原始数据",columns:["c_mol_L","Δp_rep1_Pa","Δp_rep2_Pa","Δp_rep3_Pa"],headers:["浓度 c (mol/L)","Δp1 (Pa)","Δp2 (Pa)","Δp3 (Pa)"],example:"0\t...\t...\t...\n0.05\t...\t...\t...\n0.10\t...\t...\t...\n0.15\t...\t...\t...\n0.20\t...\t...\t...\n0.25\t...\t...\t...\n0.30\t...\t...\t..."}],
      settings:[{key:"T_C",label:"实验温度 T (℃)",defaultValue:20.7},{key:"water_gamma",label:"纯水表面张力 γ水 (mN/m)",defaultValue:73.02},{key:"dp_water",label:"纯水最大泡压 Δp水 (Pa)",defaultValue:""}],
      note:"依据上传 Python 脚本：γ=γ水·Δp/Δp水；Szyszkowski：γ=γ₀−a ln(1+bc)；Γ=−c/(RT)·dγ/dc。纯水校准读数必须由本次实验输入，不使用固定 72.75 自动换算。",
      analyze:(tables,s,sel)=>{
        const r=matrix(tables.main,4).filter(x=>x[0]>=0),T=s.T_C+273.15;
        if(r.length<4) throw new Error("至少输入 4 个浓度点（含平行压力读数）。");
        if(!(s.dp_water>0)) throw new Error("请填写同一仪器、同温度下纯水最大泡压 Δp水。");
        const c=r.map(x=>x[0]), dp=r.map(x=>x.slice(1).filter(v=>v>0).reduce((a,b)=>a+b,0)/x.slice(1).filter(v=>v>0).length);
        const gamma=dp.map(v=>s.water_gamma*v/s.dp_water), gPts=c.map((x,i)=>({x,y:gamma[i],i}));
        const selected=selectPoints(gPts,sel);
        const allGamma=fitSzyszkowski(selected.map(p=>p.x),selected.map(p=>p.y));
        const smooth=curve(allGamma.predict?{predict:allGamma.predict}:null,Math.min(...c),Math.max(...c));
        const gValues=c.map(x=> (x/(R*T))*(allGamma.a*allGamma.b/(1+allGamma.b*x))*1e-3);
        const cOver=gValues.map((g,i)=>({x:c[i],y:g>0?c[i]/g:NaN,i})).filter(p=>p.x>0&&Number.isFinite(p.y));
        const lang=linearRange(cOver,sel), gm=1/lang.slope, area=1/(NA*gm)*1e18;
        const series=[
          {name:"实验表面张力 γ-c",points:gPts,fitCurve:curve(allGamma,Math.min(...c),Math.max(...c)),xLabel:"浓度 c / mol·L⁻¹",yLabel:"γ / mN·m⁻¹"},
          {name:"Gibbs 过剩吸附量 Γ-c",points:c.map((x,i)=>({x,y:gValues[i]*1e6,i})),xLabel:"浓度 c / mol·L⁻¹",yLabel:"Γ × 10⁶ / mol·m⁻²"},
          {name:"Langmuir 线性化 c/Γ-c",points:cOver,fitCurve:curve(lang,Math.min(...cOver.map(x=>x.x)),Math.max(...cOver.map(x=>x.x))),xLabel:"浓度 c / mol·L⁻¹",yLabel:"c/Γ"}
        ];
        return {series,fit:{model:"Szyszkowski + Gibbs + Langmuir线性化",coefficients:[allGamma.gamma0,allGamma.a,allGamma.b],r2:allGamma.r2,sse:allGamma.sse},metrics:[["γ₀",allGamma.gamma0,"mN/m"],["a",allGamma.a,"mN/m"],["b",allGamma.b,"L/mol"],["Γm (Langmuir)",gm,"mol/m²"],["分子截面积",area,"nm²"],["R²",allGamma.r2,""]],warnings:["纯水压力校准必须来自同仪器、同温度测量；若原始读数未校准，不能套用固定水表面张力。","当前 c/Γ 线性拟合按已选点计算；Szyszkowski 参数使用所有可用点。"],rawRows:r,headers:["c_mol_L","dp1_Pa","dp2_Pa","dp3_Pa"],resultRows:c.map((x,i)=>[x,dp[i],gamma[i],gValues[i]*1e6,c[i]>0?c[i]/gValues[i]:null])};
      }
    },
    {
      slug:"saponification",code:"PC-02",name:"乙酸乙酯的皂化反应",workflow:"saponification",
      tables:[{key:"main",title:"不同时刻电导率数据",columns:["t_min","kappa_T1","kappa_T2"],headers:["t / min","κt(T1) / mS·cm⁻¹","κt(T2) / mS·cm⁻¹"],example:"0\t2.18\t2.45\n1\t2.07\t2.29\n2\t1.98\t2.15\n3\t1.90\t2.03"}],
      settings:[{key:"T1_C",label:"温度 T1 (℃)",defaultValue:30},{key:"T2_C",label:"温度 T2 (℃)",defaultValue:35},{key:"kappa0_1",label:"κ0(T1)",defaultValue:2.18},{key:"kappaInf_1",label:"κ∞(T1)",defaultValue:0.81},{key:"kappa0_2",label:"κ0(T2)",defaultValue:2.45},{key:"kappaInf_2",label:"κ∞(T2)",defaultValue:0.91},{key:"c0",label:"反应物初始浓度 c0 (mol/L)",defaultValue:0.005}],
      note:"上传报告式(12)–(15)：y=1/(κt−κ∞) 对 t 作图，k=m/(c0·b)，m 为斜率，b 为截距；不同温度的 k 用 Arrhenius 两点式求 Ea。请使用混合后体系实际 c0。",
      analyze:(tables,s,sel)=>{
        const rows=matrix(tables.main,3);if(rows.length<3)throw new Error("至少录入 3 个时间点。");
        const out=[],series=[];
        for(const [idx,T,k0,ki] of [[1,s.T1_C,s.kappa0_1,s.kappaInf_1],[2,s.T2_C,s.kappa0_2,s.kappaInf_2]]){
          const pts=rows.map((r,i)=>({x:r[0],y:r[idx]-ki>0?1/(r[idx]-ki):NaN,i})).filter(p=>Number.isFinite(p.y));
          const fit=linearRange(pts,sel);const k=fit.slope/(s.c0*fit.intercept);
          out.push({T,K:T+273.15,k,fit});series.push(makeSeries("1/(κt−κ∞) · "+T+"℃",pts,fit,{x:"t / min",y:"1/(κt−κ∞)"}));
        }
        const Ea=R*Math.log(out[1].k/out[0].k)/(1/out[0].K-1/out[1].K);
        series.push(makeSeries("Arrhenius ln k - 1/T",out.map(v=>({x:1/v.K,y:Math.log(v.k)})),linear(out.map(v=>({x:1/v.K,y:Math.log(v.k)}))),{x:"1/T / K⁻¹",y:"ln k"}));
        return {series,fit:out[0].fit,metrics:[["k(T1)",out[0].k,"L·mol⁻¹·min⁻¹"],["k(T2)",out[1].k,"L·mol⁻¹·min⁻¹"],["Ea",Ea/1000,"kJ/mol"],["R²(T1)",out[0].fit.r2,""],["R²(T2)",out[1].fit.r2,""]],warnings:["Excel 工作表给出 30℃、35℃数据；请确认各温度的 κ0、κ∞ 是否来自同一次实验。","如果每次混合总体积改变，必须按实际体积重新计算 c0。"],rawRows:rows,headers:["t_min","kappa_T1","kappa_T2"],resultRows:rows.map(r=>[r[0],r[1],r[2],r[1]>s.kappaInf_1?1/(r[1]-s.kappaInf_1):null,r[2]>s.kappaInf_2?1/(r[2]-s.kappaInf_2):null])};
      }
    },
    {
      slug:"rectorite-adsorption",code:"PC-03",name:"累托石吸附亚甲基蓝",workflow:"adsorption",
      tables:[
        {key:"calibration",title:"吸光度工作曲线",columns:["c_std_mg_L","absorbance"],headers:["标准浓度 / mg·L⁻¹","吸光度 A"],example:"0\t0\n1\t0.129\n2\t0.345\n3\t0.489\n4\t0.740\n5\t0.939\n6\t1.082"},
        {key:"samples",title:"吸附平衡样品数据",columns:["C0_mg_L","m_REC_g","A_eq","dilution"],headers:["初始浓度 C0 / mg·L⁻¹","REC 质量 / g","平衡吸光度 A","稀释倍数"],example:"40\t0.0270\t0.014\t1\n80\t0.0265\t0.016\t1\n120\t0.0271\t0.620\t1\n160\t0.0273\t0.327\t10"}
      ],
      settings:[{key:"V_mL",label:"每组吸附液体积 V (mL；按实验指导书填写)",defaultValue:""}],
      note:"按上传 Excel：先拟合 A-c 工作曲线，再按稀释倍数求平衡浓度。Excel 的 qe 列实际表现为 C0−Ce（mg/L）；本工作区同时输出该原表口径，以及按 V/m 换算的常规 qe（mg/g）。Langmuir：Ce/qe 对 Ce；Freundlich：ln qe 对 ln Ce。",
      analyze:(tables,s,sel)=>{
        const cal=matrix(tables.calibration,2),sam=matrix(tables.samples,4);
        if(cal.length<3||sam.length<2)throw new Error("请分别录入工作曲线（至少 3 点）和吸附平衡样品（至少 2 组）。");
        const cf=linear(cal.map((r,i)=>({x:r[0],y:r[1],i})));if(cf.slope<=0)throw new Error("工作曲线斜率应为正值，请检查浓度和吸光度列。");
        const data=sam.map((r,i)=>{
          const ceDil=(r[2]-cf.intercept)/cf.slope, ce=ceDil*r[3];
          const delta=r[0]-ce, qe=s.V_mL>0&&r[1]>0?delta*(s.V_mL/1000)/r[1]:NaN;
          return {C0:r[0],m:r[1],A:r[2],dil:r[3],Ce:ce,deltaC:delta,qe,i};
        });
        const qPts=data.filter(x=>x.Ce>0&&x.deltaC>0).map(x=>({x:x.Ce,y:x.deltaC,i:x.i}));
        const langPts=qPts.map(p=>({x:p.x,y:p.x/p.y,i:p.i})).filter(p=>p.x>0);
        const lang=linearRange(langPts,sel),qm=1/lang.slope,K=lang.slope/lang.intercept;
        const frPts=qPts.map(p=>({x:Math.log(p.x),y:Math.log(p.y),i:p.i}));
        const fr=linearRange(frPts,sel),n=1/fr.slope,Kf=Math.exp(fr.intercept);
        const allPts=data.map(x=>({x:x.Ce,y:x.deltaC,i:x.i}));
        return {series:[
          makeSeries("标准工作曲线 A-c",cal.map((r,i)=>({x:r[0],y:r[1],i})),cf,{x:"C / mg·L⁻¹",y:"A"}),
          makeSeries("吸附等温线（原表口径 C0−Ce）",qPts,null,{x:"Ce / mg·L⁻¹",y:"C0−Ce / mg·L⁻¹"}),
          makeSeries("Langmuir Ce/qe-Ce",langPts,lang,{x:"Ce / mg·L⁻¹",y:"Ce/qe"}),
          makeSeries("Freundlich ln qe-ln Ce",frPts,fr,{x:"ln Ce",y:"ln qe"})
        ],fit:lang,metrics:[["工作曲线斜率",cf.slope,"A·L/mg"],["工作曲线截距",cf.intercept,"A"],["Langmuir qm",qm,"mg/g"],["Langmuir KL",K,"L/mg"],["Freundlich KF",Kf,""],["Freundlich n",n,""],["Langmuir R²",lang.r2,""],["Freundlich R²",fr.r2,""]],warnings:["上传 Excel 的 qe 列标题为 mg/L，数值实际为 C0−Ce；Langmuir/Freundlich 按原表口径拟合。","原始工作表未提供吸附液体积 V；只有填写 V 后才计算标准 qe=ΔC·V/m（mg/g）。"],rawRows:sam,headers:["C0_mg_L","m_REC_g","A_eq","dilution"],resultRows:data.map(x=>[x.C0,x.m,x.A,x.dil,x.Ce,x.deltaC,x.qe])};
      }
    },
    {
      slug:"zeta-potential",code:"PC-04",name:"溶胶的制备、ζ 电势与电解质聚沉值的测定",workflow:"zeta",
      tables:[{key:"main",title:"电泳和聚沉原始数据",columns:["time_s","voltage_V","left_before_m","left_after_m","right_before_m","right_after_m","electrolyte_1_M","electrolyte_2_M","electrolyte_3_M"],headers:["时间 / s","电压 / V","左臂前 / m","左臂后 / m","右臂前 / m","右臂后 / m","KCl / M","K₂SO₄ / M","K₃[Fe(CN)₆] / M"],example:"1800\t50\t0.074\t0.079\t0.074\t0.071\t0.0025\t0.0025\t0.0001"}],
      settings:[{key:"gap_m",label:"电极间距 l (m)",defaultValue:0.357},{key:"eta_Pa_s",label:"介质黏度 η (Pa·s)",defaultValue:""},{key:"epsilon_r",label:"相对介电常数 εr",defaultValue:78.3}],
      note:"按上传报告 Smoluchowski 关系：ζ=ηu/(ε0εrE)，u=d/t，E=V/l；d 按左右臂界面移动距离的平均值计算。黏度需按实验温度查表输入。聚沉值记录各电解质使溶胶明显聚沉的最小浓度。",
      analyze:(tables,s)=>{
        const r=matrix(tables.main,9);if(!r.length)throw new Error("请录入电泳时间、电压、两臂界面刻度和电极间距。");
        if(!(s.eta_Pa_s>0&&s.epsilon_r>0&&s.gap_m>0))throw new Error("请填写正值的黏度、相对介电常数和电极间距。");
        const points=r.map((x,i)=>{
          const d=(Math.abs(x[3]-x[2])+Math.abs(x[5]-x[4]))/2, v=d/x[0], E=x[1]/s.gap_m;
          const zeta=s.eta_Pa_s*v/(EPS0*s.epsilon_r*E)*1000;
          return {x:i+1,y:zeta,i,d,v,E};
        });
        return {series:[makeSeries("电泳 ζ 电势",points,null,{x:"测量组",y:"ζ / mV"}),makeSeries("聚沉值比较",[{x:1,y:r[0][6],name:"KCl"},{x:2,y:r[0][7],name:"K₂SO₄"},{x:3,y:r[0][8],name:"K₃[Fe(CN)₆]"}],null,{x:"电解质编号",y:"聚沉浓度 / mol·L⁻¹"})],fit:null,metrics:[["ζ 电势",points[0].y,"mV"],["界面平均移动距离",points[0].d,"m"],["电泳速度",points[0].v,"m/s"],["电场强度",points[0].E,"V/m"],["KCl 聚沉值",r[0][6],"mol/L"],["K₂SO₄ 聚沉值",r[0][7],"mol/L"],["K₃[Fe(CN)₆] 聚沉值",r[0][8],"mol/L"]],warnings:["若两臂刻度变化方向不一致，请核对两臂移动距离的绝对值与平均方式。","电泳模型受颗粒尺寸、双电层和介质条件影响；此处依上传报告采用 Smoluchowski 近似。"],rawRows:r,headers:["time_s","voltage_V","left_before_m","left_after_m","right_before_m","right_after_m","KCl_M","K2SO4_M","K3FeCN6_M"],resultRows:points.map(p=>[p.x,p.d,p.v,p.E,p.y])};
      }
    },
    {
      slug:"galvanic-cell",code:"PC-05",name:"原电池热力学",workflow:"galvanic",
      tables:[{key:"main",title:"不同温度下的原电池电动势",columns:["t_C","E1_V","E2_V","E0_V"],headers:["温度 / ℃","E1 / V","E2 / V","E0（可选）/ V"],example:"25\t1.01867\t1.01870\t1.01867\n30\t1.01862\t1.01865\t1.01862\n35\t1.01862\t1.01860\t1.01862"}],
      settings:[{key:"n_e",label:"电池反应转移电子数 n",defaultValue:2}],
      note:"上传报告给出 ΔrGm=−nFE、ΔrSm=nF(∂E/∂T)p、ΔrHm=ΔrGm+TΔrSm。需确认 E1/E2 为同一电池的重复读数，电动势单位为 V，电子转移数依据电池反应方程式填写。",
      analyze:(tables,s)=>{
        const r=matrix(tables.main,4);if(r.length<2)throw new Error("至少需要两个温度下的电动势数据。");
        const avg=r.map((x,i)=>({x:x[0]+273.15,y:(x[1]+x[2])/2,i}));
        const f=linear(avg);const n=s.n_e;if(!(n>0))throw new Error("电子转移数 n 必须大于 0。");
        const values=avg.map(p=>({T:p.x,E:p.y,G:-n*F*p.y,S:n*F*f.slope,H:-n*F*p.y+p.x*n*F*f.slope}));
        return {series:[makeSeries("E-T 原始数据",avg,f,{x:"T / K",y:"E / V"})],fit:f,metrics:[["dE/dT",f.slope,"V/K"],["ΔrGm（首个温度）",values[0].G/1000,"kJ/mol"],["ΔrSm",values[0].S,"J/(K·mol)"],["ΔrHm（首个温度）",values[0].H/1000,"kJ/mol"],["E 的线性拟合 R²",f.r2,""]],warnings:["本次仅计算温度系数及 ΔrGm、ΔrSm、ΔrHm；标准电动势和难溶盐溶度积还需按报告中的 Nernst 方程、活度/浓度数据单独补充。","Excel 上传表中 E1/E2 个别值量级看起来可能是 mV 或仪器刻度；请确认单位确为 V 后再计算。"],rawRows:r,headers:["t_C","E1_V","E2_V","E0_V"],resultRows:values.map(v=>[v.T,v.E,v.G,v.S,v.H])};
      }
    },
    {
      slug:"phase-diagram",code:"PC-06",name:"二组分凝聚系统相图（Sn-Pb）",workflow:"phase_diagram",
      tables:[{key:"main",title:"不同组成样品冷却曲线",columns:["time_s","Sn_C","Sn30_C","Sn61_9_C","Sn80_C","Pb_C"],headers:["时间 / s","纯 Sn / ℃","30% Sn / ℃","61.9% Sn / ℃","80% Sn / ℃","纯 Pb / ℃"],example:"10\t243.7\t260.8\t204.8\t218.2\t351.3\n20\t238.1\t257.0\t202.2\t214.9\t345.7\n30\t235.7\t253.4\t199.3\t211.3\t338.3\n40\t234.7\t250.4\t196.8\t208.1\t333.8"}],
      settings:[{key:"eutectic_C",label:"参考低共熔温度 (℃)",defaultValue:183},{key:"eutecticSn_pct",label:"参考低共熔组成 Sn (%)",defaultValue:61.9}],
      note:"上传报告和 Excel 采用 Sn-Pb 固态部分互溶体系，冷却曲线的斜率变化对应相变转折，平台对应低共熔温度。默认参考线 183℃、61.9% Sn 来自上传材料；自动识别仅作辅助，最终应由教师/学生在曲线上选区确认。",
      analyze:(tables,s)=>{
        const r=matrix(tables.main,6);if(r.length<6)throw new Error("至少录入 6 个时间点以观察冷却曲线。");
        const cols=["Sn（纯）","30% Sn","61.9% Sn","80% Sn","Pb（纯）"],series=[],metrics=[];
        for(let j=1;j<6;j++){
          const pts=r.map((x,i)=>({x:x[0],y:x[j],i}));
          const plateau=fitPlateau(pts,Math.min(7,Math.max(3,Math.floor(pts.length/5))));
          series.push(makeSeries(cols[j-1],pts,null,{x:"时间 / s",y:"温度 / ℃"}));
          metrics.push([cols[j-1]+" 自动平台估计",plateau?.temp??NaN,"℃"],[cols[j-1]+" 平台区间",plateau?((plateau.start+1)+"–"+(plateau.end+1)):"—","数据点"]);
        }
        const phasePts=metrics.filter(x=>x[0].includes("自动平台估计")&&Number.isFinite(x[1])).map(x=>({x:parseFloat(x[0]),y:x[1]}));
        series.push({name:"参考低共熔水平线",points:[{x:r[0][0],y:s.eutectic_C},{x:r[r.length-1][0],y:s.eutectic_C}],fitCurve:null});
        return {series,fit:null,metrics:[["参考低共熔温度",s.eutectic_C,"℃"],["参考低共熔组成",s.eutecticSn_pct,"% Sn"],...metrics],warnings:["最小斜率窗口自动识别可能把普通缓慢冷却段误判为平台；请在图上手动选择平台区间，再核对均温值。","合金组成在原表为质量分数，不要与摩尔分数混用。"],rawRows:r,headers:["time_s","Sn_C","Sn30_C","Sn61_9_C","Sn80_C","Pb_C"],resultRows:r};
      }
    },
    {
      slug:"boiling-composition",code:"PC-07",name:"二组分液相完全互溶系统沸点–组成图",workflow:"boiling_composition",
      tables:[
        {key:"calibration",title:"乙醇–正丙醇折射率标准曲线",columns:["propanol_wt_pct","nD"],headers:["正丙醇质量分数 / %","折射率 nD"],example:"0\t1.3619\n10\t1.3638\n20\t1.3665\n30\t1.3688\n40\t1.3711\n50\t1.3735\n60\t1.3760\n70\t1.3781\n80\t1.3808\n90\t1.3831\n100\t1.3854"},
        {key:"samples",title:"沸点与气液两相折射率",columns:["boiling_C","vapor_nD","liquid_nD"],headers:["沸点 / ℃","气相冷凝液 nD","液相 nD"],example:"78.55\t\t\n81.23\t1.3637\t1.3661\n83.90\t1.3666\t1.3695\n85.62\t1.3691\t1.3734"}
      ],
      settings:[],
      note:"依据上传 Excel：折射率标准曲线采用丙醇质量分数对 nD 的标定；气相冷凝液和液相分别由各自 nD 反算组成，绘制 T-x-y。原报告要求折射率测量温度与波长一致。",
      analyze:(tables)=>{
        const c=matrix(tables.calibration,2),r=matrix(tables.samples,3);if(c.length<3||r.length<2)throw new Error("请录入折射率标准系列与沸点/气液折射率样品。");
        const f=linear(c.map((x,i)=>({x:x[0],y:x[1],i})));
        const inv=n=>{if(!Number.isFinite(n))return NaN;return Math.max(0,Math.min(100,(n-f.intercept)/f.slope));};
        const out=r.map((x,i)=>({T:x[0],y:inv(x[1]),x:inv(x[2]),i})).filter(x=>Number.isFinite(x.x));
        return {series:[makeSeries("标准曲线 nD-w",c.map((x,i)=>({x:x[0],y:x[1],i})),f,{x:"正丙醇质量分数 / %",y:"nD"}),makeSeries("T-x（液相）",out.map(o=>({x:o.x,y:o.T,i:o.i})),null,{x:"液相 w / %",y:"沸点 T / ℃"}),makeSeries("T-y（气相）",out.filter(o=>Number.isFinite(o.y)).map(o=>({x:o.y,y:o.T,i:o.i})),null,{x:"气相 w / %",y:"沸点 T / ℃"})],fit:f,metrics:[["标准曲线斜率",f.slope,"nD/%"],["标准曲线截距",f.intercept,"nD"],["标准曲线 R²",f.r2,""],["已换算气液样品数",out.length,"组"]],warnings:["样品 nD 为空的纯组分端点不参与折射率反算，应将其纯组分组成作为 0% 或 100% 的边界点另行录入。","若标准曲线存在非线性，应根据实验数据比较线性/二次拟合，而非强制线性外推。"],rawRows:r,headers:["boiling_C","vapor_nD","liquid_nD"],resultRows:out.map(x=>[x.T,x.y,x.x])};
      }
    },
    {
      slug:"reaction-enthalpy",code:"PC-08",name:"反应焓的测定（KCl 标定与 ZnO-HCl）",workflow:"reaction_enthalpy",
      tables:[
        {key:"kclBefore",title:"KCl 溶解前温度基线",columns:["time_min","T_C"],headers:["时间 / min","温度 / ℃"],example:"1\t5.721\n2\t5.723\n3\t5.726\n4\t5.729\n5\t5.730\n6\t5.731"},
        {key:"kclAfter",title:"KCl 溶解后温度基线",columns:["time_min","T_C"],headers:["时间 / min","温度 / ℃"],example:"7\t6.003\n8\t6.004\n9\t6.006\n10\t6.008\n11\t6.010\n12\t6.011"},
        {key:"rxnBefore",title:"ZnO-HCl 反应前温度基线",columns:["time_min","T_C"],headers:["时间 / min","温度 / ℃"],example:"1\t4.559\n2\t4.573\n3\t4.586\n4\t4.595\n5\t4.605\n6\t4.613"},
        {key:"rxnAfter",title:"ZnO-HCl 反应后温度基线",columns:["time_min","T_C"],headers:["时间 / min","温度 / ℃"],example:"7\t6.498\n8\t6.508\n9\t6.517\n10\t6.526\n11\t6.535\n12\t6.542"}
      ],
      settings:[{key:"eventKCl",label:"KCl 投入时刻 (min)",defaultValue:6.5},{key:"eventRxn",label:"ZnO 投入时刻 (min)",defaultValue:6.5},{key:"massKCl_g",label:"KCl 质量 (g)",defaultValue:10.7207},{key:"water_g",label:"水质量 (g)",defaultValue:500},{key:"deltaH_KCl_kJmol",label:"该组成 KCl 积分溶解焓 (kJ/mol，查表输入)",defaultValue:""},{key:"cpWater",label:"水比热 (J·g⁻¹·K⁻¹)",defaultValue:4.184},{key:"cpKCl",label:"KCl 固体比热 (J·g⁻¹·K⁻¹)",defaultValue:""},{key:"massZnO_g",label:"ZnO 质量 (g)",defaultValue:1.0683},{key:"massHCl_g",label:"HCl 溶液质量 (g)",defaultValue:498.3},{key:"cpZnO",label:"ZnO 比热 (J·g⁻¹·K⁻¹)",defaultValue:0.46},{key:"cpHCl",label:"HCl 溶液比热 (J·g⁻¹·K⁻¹)",defaultValue:4.134}],
      note:"按上传报告流程：分别对加料前后温度-时间基线拟合并外推到加料时刻，作温度修正；先由 KCl 溶解标定量热计 K，再由 ZnO 与 0.2 mol/L HCl 反应计算 ΔrHm。KCl 积分溶解焓和 KCl 固体比热必须按教材/数据表输入。",
      analyze:(t,s)=>{
        const getFit=(key)=>{const r=matrix(t[key],2);if(r.length<2)throw new Error("请完整录入四组量热温度基线："+key);return {r,fit:linear(r.map((x,i)=>({x:x[0],y:x[1],i})))};};
        const kb=getFit("kclBefore"),ka=getFit("kclAfter"),rb=getFit("rxnBefore"),ra=getFit("rxnAfter");
        const dtk=ka.fit.predict(s.eventKCl)-kb.fit.predict(s.eventKCl), dtr=ra.fit.predict(s.eventRxn)-rb.fit.predict(s.eventRxn);
        let K=NaN,dh=NaN;
        if(Number.isFinite(s.deltaH_KCl_kJmol)&&Number.isFinite(s.cpKCl)&&Math.abs(dtk)>1e-9){
          const nk=s.massKCl_g/74.5513, qsol=nk*s.deltaH_KCl_kJmol*1000;
          K=-qsol/dtk-s.water_g*s.cpWater-s.massKCl_g*s.cpKCl;
          const nZnO=s.massZnO_g/81.38;
          if(nZnO>0) dh=-(s.massZnO_g*s.cpZnO+s.massHCl_g*s.cpHCl+K)*dtr/nZnO/1000;
        }
        const series=[makeSeries("KCl 溶解前",kb.r.map((x,i)=>({x:x[0],y:x[1],i})),kb.fit,{x:"时间 / min",y:"温度 / ℃"}),makeSeries("KCl 溶解后",ka.r.map((x,i)=>({x:x[0],y:x[1],i})),ka.fit,{x:"时间 / min",y:"温度 / ℃"}),makeSeries("ZnO-HCl 反应前",rb.r.map((x,i)=>({x:x[0],y:x[1],i})),rb.fit,{x:"时间 / min",y:"温度 / ℃"}),makeSeries("ZnO-HCl 反应后",ra.r.map((x,i)=>({x:x[0],y:x[1],i})),ra.fit,{x:"时间 / min",y:"温度 / ℃"})];
        return {series,fit:rb.fit,metrics:[["校正 ΔT(KCl)",dtk,"℃"],["校正 ΔT(ZnO-HCl)",dtr,"℃"],["量热计热容 K",K,"J/K"],["ΔrHm",dh,"kJ/mol"]],warnings:["未填写 KCl 积分溶解焓或 KCl 固体比热时，不计算 K 与 ΔrHm；不得用经验默认值补齐。","HCl 溶液质量、比热和反应化学计量数需与实际实验用量一致。"],rawRows:rb.r,headers:["time_min","T_C"],resultRows:series.flatMap(x=>x.points.map(p=>[x.name,p.x,p.y]))};
      }
    },
    {
      slug:"freezing-point",code:"PC-09",name:"凝固点降低法测定摩尔质量",workflow:"freezing_point",
      tables:[{key:"main",title:"环己烷与萘溶液冷却曲线",columns:["t_10s","solvent_run1","solvent_run2","solution_run1","solution_run2"],headers:["t / 10 s","环己烷 ΔT1","环己烷 ΔT2","萘溶液 ΔT1","萘溶液 ΔT2"],example:"10\t0.662\t0.823\t0.663\t0.844\n20\t0.610\t0.761\t0.539\t0.483\n30\t0.522\t0.668\t0.427\t0.322\n40\t0.449\t0.603\t0.295\t0.240"}],
      settings:[{key:"Kf",label:"环己烷凝固点降低常数 Kf (K·kg/mol)",defaultValue:20},{key:"mSolvent_g",label:"环己烷质量 (g)",defaultValue:""},{key:"mSolute_g",label:"萘质量 (g)",defaultValue:0.1264},{key:"TfSolvent",label:"环己烷凝固点 (℃，自动平台估计可留空)",defaultValue:""},{key:"TfSolution",label:"萘溶液凝固点 (℃，自动平台估计可留空)",defaultValue:""}],
      note:"上传报告：ΔTf=Kf·b；由溶质质量、溶剂质量和凝固点降低计算摩尔质量。报告中 Kf(环己烷)=20.0 K·kg/mol；冷却曲线过冷后需结合平台/外推判定凝固点，自动平台仅辅助。",
      analyze:(t,s,sel)=>{
        const r=matrix(t.main,5);if(r.length<6)throw new Error("请录入冷却曲线的时间、溶剂和溶液数据。");
        const means=[1,2,3,4].map(j=>r.map((x,i)=>({x:x[0]*10,y:x[j],i})));
        const p1=fitPlateau(means[0]),p2=fitPlateau(means[1]),p3=fitPlateau(means[2]),p4=fitPlateau(means[3]);
        const tf0=Number.isFinite(s.TfSolvent)?s.TfSolvent:(p1.temp+p2.temp)/2;
        const tf1=Number.isFinite(s.TfSolution)?s.TfSolution:(p3.temp+p4.temp)/2;
        const delta=tf0-tf1, M=s.Kf*s.mSolute_g*1000/(delta*s.mSolvent_g);
        return {series:means.map((p,i)=>makeSeries(["环己烷第一次","环己烷第二次","萘溶液第一次","萘溶液第二次"][i],p,null,{x:"时间 / s",y:"温差仪读数 / ℃"})),fit:null,metrics:[["环己烷凝固点",tf0,"℃"],["萘溶液凝固点",tf1,"℃"],["凝固点降低 ΔTf",delta,"K"],["萘摩尔质量",M,"g/mol"],["自动平台估计范围(溶剂)",p1.start+1+"–"+(p1.end+1),"点"],["自动平台估计范围(溶液)",p3.start+1+"–"+(p3.end+1),"点"]],warnings:["自动识别的最小斜率区间仅用于辅助；如发生明显过冷，应按实验报告方法人工选择凝固平台/外推线。","溶剂质量必须以 g 输入；公式含 1000 是将 g 转换为 kg。"],rawRows:r,headers:["t_10s","solvent_run1","solvent_run2","solution_run1","solution_run2"],resultRows:r};
      }
    },
    {
      slug:"equilibrium-constant",code:"PC-10",name:"平衡常数的测定（氨基甲酸铵分解）",workflow:"equilibrium",
      tables:[{key:"main",title:"不同温度下平衡总压",columns:["t_C","gauge_kPa","atmosphere_kPa"],headers:["温度 / ℃","压力计示数 p' / kPa","大气压 p0 / kPa"],example:"30\t-85.5\t102.1\n30\t-85.4\t102.1\n35\t-78.1\t102.1\n40\t-68.9\t102.1\n45\t-56.3\t102.1\n50\t-39.6\t102.1"}],
      settings:[{key:"pStandard_kPa",label:"标准压力 pθ (kPa)",defaultValue:100}],
      note:"上传报告反应为 NH₂COONH₄(s) ⇌ NH₃(g)+CO₂(g)。两种气体由 1:1 计量关系生成，平衡总压 p 对应 p(NH₃)=p(CO₂)=p/2，Kθ=(p/2pθ)²；按 van’t Hoff 关系拟合 lnKθ 对 1/T 求 ΔrHm。",
      analyze:(t,s)=>{
        const r=matrix(t.main,3);if(r.length<3)throw new Error("至少需要 3 组温度与压力数据。");
        const values=r.map((x,i)=>{const T=x[0]+273.15,p=x[1]+x[2],K=(p/(2*s.pStandard_kPa))**2;return{T,p,K,lnK:Math.log(K),invT:1/T,i};});
        const f=linear(values.map(x=>({x:x.invT,y:x.lnK,i:x.i}))),dh=-f.slope*R;
        return {series:[makeSeries("ln Kθ - 1/T",values.map(x=>({x:x.invT,y:x.lnK,i:x.i})),f,{x:"1/T / K⁻¹",y:"ln Kθ"})],fit:f,metrics:[["ΔrHm",dh/1000,"kJ/mol"],["van’t Hoff R²",f.r2,""],["30℃ 平衡总压",values[0].p,"kPa"],["30℃ Kθ（按分压计量式）",values[0].K,""]],warnings:["请核对上传 Excel 的 Kθ 列：用 p_total=16.6 kPa、pθ=100 kPa 代入 Kθ=(p/2pθ)² 得到约 0.00689，与工作簿记录的 0.000678 不一致。当前按报告反应的 1:1 分压关系计算，需教师确认工作簿公式。"],rawRows:r,headers:["t_C","gauge_kPa","atmosphere_kPa"],resultRows:values.map(x=>[x.T,x.p,x.K,x.lnK,x.invT])};
      }
    },
    {
      slug:"vapour-pressure",code:"PC-11",name:"液体饱和蒸气压的测定（乙醇）",workflow:"vapour_pressure",
      tables:[{key:"main",title:"不同温度下的平衡压力",columns:["T_C","pGauge_kPa","pAtmosphere_kPa"],headers:["沸点温度 / ℃","压力计示数 / kPa","大气压 / kPa"],example:"78.4\t0\t101.3\n75\t-10\t101.3\n72\t-20\t101.3\n69\t-30\t101.3"}],
      settings:[{key:"normalPressure_kPa",label:"正常沸点标准压力 (kPa)",defaultValue:101.325}],
      note:"上传实验报告采用动态法：在不同外压下记录液体沸腾温度；平衡压力 p=p0+p'（按压力计示数正负约定核对）。克劳修斯–克拉佩龙：ln(p/Pa) 对 1/T 线性，斜率 m=−ΔvapHm/R，可外推正常沸点。",
      analyze:(t,s)=>{
        const r=matrix(t.main,3);if(r.length<3)throw new Error("至少需要 3 组温度和压力数据。");
        const values=r.map((x,i)=>{const T=x[0]+273.15,p=x[1]+x[2];return{T,p,invT:1/T,lnp:Math.log(p*1000),i};}).filter(x=>x.p>0);
        const f=linear(values.map(x=>({x:x.invT,y:x.lnp,i:x.i}))),dh=-f.slope*R;
        const boil=1/((Math.log(s.normalPressure_kPa*1000)-f.intercept)/f.slope)-273.15;
        return {series:[makeSeries("Clausius–Clapeyron ln p - 1/T",values.map(x=>({x:x.invT,y:x.lnp,i:x.i})),f,{x:"1/T / K⁻¹",y:"ln(p/Pa)"})],fit:f,metrics:[["平均汽化焓",dh/1000,"kJ/mol"],["拟合正常沸点",boil,"℃"],["R²",f.r2,""]],warnings:["请确认压力计是相对大气压的负压示数，且两液面平衡时 p_sat=p_atm+p_gauge。","拟合正常沸点属于区间外推时，需查看数据覆盖范围并谨慎解释。"],rawRows:r,headers:["T_C","pGauge_kPa","pAtmosphere_kPa"],resultRows:values.map(x=>[x.T,x.p,x.lnp,x.invT])};
      }
    },
    {
      slug:"thermostat-viscosity",code:"PC-12",name:"恒温槽的调节及黏度测定",workflow:"thermostat_viscosity",
      tables:[{key:"main",title:"恒温槽与黏度原始数据",columns:["time220_s","T220_C","time110_s","T110_C","ethanol_t1_s","ethanol_t2_s","ethanol_t3_s","water_t1_s","water_t2_s","water_t3_s"],headers:["220V 时间 / s","220V 温度 / ℃","110V 时间 / s","110V 温度 / ℃","乙醇 t1 / s","乙醇 t2 / s","乙醇 t3 / s","水 t1 / s","水 t2 / s","水 t3 / s"],example:"30\t35.10\t30\t35.14\t170.53\t170.42\t170.59\t108.83\t108.90\t108.52\n60\t34.98\t60\t35.09\t\t\t\t\t\t"}],
      settings:[{key:"rhoEthanol",label:"乙醇密度 ρ乙醇 (kg/m³)",defaultValue:776.7},{key:"rhoWater",label:"水密度 ρ水 (kg/m³)",defaultValue:993.9},{key:"etaWater_mPa_s",label:"水黏度 η水 (mPa·s)",defaultValue:0.7225}],
      note:"上传 Excel 分别记录 220V/110V 恒温槽波动以及乙醇/水三次流出时间。灵敏度 T=(tmax−tmin)/2（温度波动半幅）；乌氏黏度计相对法 η1/η2=(ρ1t1)/(ρ2t2)。",
      analyze:(t,s)=>{
        const r=parse(t.main);const nums=r.map(x=>x.map(v=>num(v)));
        const pair=col=>nums.map(x=>({x:x[col],y:x[col+1]})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
        const c220=pair(0),c110=pair(2),first=nums.find(x=>x.length>=10&&x.slice(4,10).filter(Number.isFinite).length>=6);
        if(!c220.length||!c110.length)throw new Error("请提供 220V 与 110V 两组时间-温度波动数据。");
        const stat=a=>({min:Math.min(...a.map(p=>p.y)),max:Math.max(...a.map(p=>p.y)),mean:stats(a.map(p=>p.y)).mean});
        const a=stat(c220),b=stat(c110),tE=first?stats(first.slice(4,7)).mean:NaN,tW=first?stats(first.slice(7,10)).mean:NaN;
        const eta=s.etaWater_mPa_s*(s.rhoEthanol*tE)/(s.rhoWater*tW);
        return {series:[makeSeries("恒温槽 220V",c220,null,{x:"时间 / s",y:"温度 / ℃"}),makeSeries("恒温槽 110V",c110,null,{x:"时间 / s",y:"温度 / ℃"})],fit:null,metrics:[["220V 温度波动半幅", (a.max-a.min)/2,"℃"],["110V 温度波动半幅",(b.max-b.min)/2,"℃"],["220V 平均温度",a.mean,"℃"],["110V 平均温度",b.mean,"℃"],["乙醇平均流出时间",tE,"s"],["水平均流出时间",tW,"s"],["乙醇黏度",eta,"mPa·s"]],warnings:["请把 Excel 中温度波动数据与黏度流出时间分开录入；同一工作表第一条数据行中含有六个流出时间才会计算黏度。","乙醇、水密度和水黏度必须使用测量温度对应的查表值。"],rawRows:nums,headers:["time220_s","T220_C","time110_s","T110_C","ethanol_t1_s","ethanol_t2_s","ethanol_t3_s","water_t1_s","water_t2_s","water_t3_s"],resultRows:nums};
      }
    },
    {
      slug:"hydrogen-peroxide",code:"PC-13",name:"过氧化氢的催化分解",workflow:"hydrogen_peroxide",
      tables:[{key:"main",title:"不同条件下产气体积-时间数据",columns:["time_min","V_t1_mL","V_t2_mL","V_t3_mL"],headers:["时间 / min","条件 1 Vt / mL","条件 2 Vt / mL","条件 3 Vt / mL"],example:"0\t0\t0\t0\n1\t...\t...\t...\n2\t...\t...\t...\n3\t...\t...\t..."}],
      settings:[{key:"Vinf1",label:"条件 1 完全分解总气体积 V∞ (mL)",defaultValue:""},{key:"Vinf2",label:"条件 2 完全分解总气体积 V∞ (mL)",defaultValue:""},{key:"Vinf3",label:"条件 3 完全分解总气体积 V∞ (mL)",defaultValue:""}],
      note:"上传实验原理：ln(V∞−Vt) 对 t 作图，一级反应应为直线，斜率为 −k'；t1/2=ln2/k'。报告中 V∞ 由滴定标定的 H₂O₂ 起始浓度、反应体积、气压和水蒸气压间接求得。",
      analyze:(t,s,sel)=>{
        const r=matrix(t.main,4);if(r.length<3)throw new Error("请录入至少 3 个时间点。");
        const inf=[s.Vinf1,s.Vinf2,s.Vinf3],series=[],metrics=[];
        for(let j=1;j<4;j++){
          if(!(inf[j-1]>0))continue;
          const pts=r.map((x,i)=>({x:x[0],y:x[j]<inf[j-1]?Math.log(inf[j-1]-x[j]):NaN,i})).filter(p=>Number.isFinite(p.y));
          const f=linearRange(pts,sel),k=-f.slope;
          series.push(makeSeries("条件 "+j+" ln(V∞−Vt)-t",pts,f,{x:"时间 / min",y:"ln(V∞−Vt)"}));
          metrics.push(["k' 条件 "+j,k,"min⁻¹"],["t1/2 条件 "+j,Math.log(2)/k,"min"],["R² 条件 "+j,f.r2,""]);
        }
        if(!series.length)throw new Error("请至少填写一个条件的 V∞ 完全分解体积。");
        return {series,fit:null,metrics,warnings:["V∞ 需根据报告的滴定与气体状态方程步骤求得；如输入气体总体积，应扣除水蒸气压并使用绝对温度。","若 3 个条件的 H₂O₂ 初始浓度或 KI 浓度不同，请按实验记录对应输入 V∞，不能将条件编号随意互换。"],rawRows:r,headers:["time_min","V_t1_mL","V_t2_mL","V_t3_mL"],resultRows:r};
      }
    },
    {
      slug:"passivation",code:"PC-14",name:"金属钝化行为和极化曲线的测定",workflow:"passivation",
      tables:[{key:"main",title:"不同介质下电位-电流数据",columns:["E_buffer_mV","logI_buffer","E_KCl005_mV","logI_KCl005","E_KCl010_mV","logI_KCl010","E_dichromate_mV","logI_dichromate"],headers:["缓冲液 E / mV","log i","KCl 0.005 E / mV","log i","KCl 0.010 E / mV","log i","重铬酸钾 E / mV","log i"],example:"-1500\t-0.1581\t-1500\t-0.0836\t-1500\t-0.1163\t-1500\t-0.0748\n-1499\t-0.1664\t-1499\t-0.0899\t-1499\t-0.1220\t-1499\t-0.0850"}],
      settings:[{key:"condition",label:"拟合条件列（1 缓冲液；2 KCl 0.005；3 KCl 0.010；4 重铬酸钾）",defaultValue:1}],
      note:"上传报告将极化曲线分为活化区、过渡钝化区、钝化区及过钝化区；Tafel 拟合只适用于活化区。请在图上框选阳极或阴极活化区，不能把整个钝化曲线强行线性拟合。",
      analyze:(t,s,sel)=>{
        const r=matrix(t.main,8);if(r.length<4)throw new Error("至少录入 4 个电位-电流点。");
        const c=Math.max(1,Math.min(4,Math.round(s.condition)))-1, j=c*2;
        const pts=r.map((x,i)=>({x:x[j]/1000,y:x[j+1],i})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
        const selected=selectPoints(pts,sel);const f=linear(selected);
        return {series:[makeSeries(["缓冲液","KCl 0.005","KCl 0.010","重铬酸钾"][c]+" 极化曲线",pts,null,{x:"电位 E / V",y:"log₁₀ i"}),makeSeries("当前选区 Tafel 拟合",selected,f,{x:"电位 E / V",y:"log₁₀ i"})],fit:f,metrics:[["Tafel 斜率",f.slope,"dec/V"],["Tafel 截距",f.intercept,""],["R²",f.r2,""],["所选区间点数",selected.length,"点"]],warnings:["当前拟合仅对所选点进行；请分别框选阳极/阴极活化区，再用两条 Tafel 直线交点估算 Ecorr 和 log icorr。","Excel 列名为电流对数，需确认是 log10(I/mA)、log10(I/A) 还是 log10 电流密度；单位未确认前不输出绝对腐蚀电流。"],rawRows:r,headers:["E_buffer_mV","logI_buffer","E_KCl005_mV","logI_KCl005","E_KCl010_mV","logI_KCl010","E_dichromate_mV","logI_dichromate"],resultRows:pts.map(p=>[p.x,p.y])};
      }
    }
  ];
  const map=Object.fromEntries(defs.map(d=>[d.slug,d]));
  function parseAll(tables, def) {
    const parsed={};
    for(const t of def.tables) parsed[t.key]=parse(tables[t.key]||"");
    return parsed;
  }
  function analyze(slug, tables, settings, selected) {
    const def=map[slug]; if(!def) throw new Error("未找到该实验的专属算法模块。");
    const parsed=parseAll(tables,def);
    return def.analyze(parsed,settings||{},selected||[]);
  }
  function renderSetup(slug, root, settingsRoot, values={}) {
    const def=map[slug];if(!def)return;
    root.innerHTML=def.tables.map((t,i)=>{
      const id="expData_"+t.key;
      const current=values[t.key]||"";
      return '<div class="experiment-data-block"><div class="experiment-data-title"><strong>'+t.title+'</strong><span>'+t.headers.join(" · ")+'</span></div><textarea class="data-editor experiment-specific-editor" id="'+id+'" spellcheck="false" placeholder="'+t.example.replace(/"/g,"&quot;")+'">'+current+'</textarea><small class="muted tiny">列顺序：'+t.columns.join(" / ")+'</small></div>';
    }).join("");
    settingsRoot.innerHTML=def.settings.map(f=>'<label>'+f.label+'<input type="number" step="any" id="expSetting_'+f.key+'" value="'+(values[f.key]??f.defaultValue??"")+'" placeholder="按实验指导书填写"></label>').join("");
    return def;
  }
  window.TJUCPE_EXPERIMENT_ENGINE={version:"2.0.0",definitions:defs,parse,analyze,renderSetup};
})();
