/* TJUCPE client application — no privileged keys or student files are stored in the repository. */
(() => {
  "use strict";
  const CONFIG = window.TJUCPE_CONFIG || {};
  const SUPABASE_URL = String(CONFIG.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const SUPABASE_PUBLISHABLE_KEY = String(CONFIG.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const hasConfig = !!(SUPABASE_URL && /^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_PUBLISHABLE_KEY));
  const db = hasConfig && window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;
  const ENGINE_VERSION = "tjucpe-webcalc-1.0.0";
  const $ = (id) => document.getElementById(id);
  const experiments = [
    {slug:"surface-tension",code:"PC-01",name:"最大泡压法测定液体的表面张力",group:"界面化学",desc:"整理不同浓度下的最大泡压测量结果，绘制表面张力–浓度关系曲线。",x:"浓度 c",y:"表面张力 γ",xu:"mol·L⁻¹",yu:"mN·m⁻¹",note:"建议先核对微压差测量仪读数与表面张力换算关系，再使用本页拟合。若采用 Szyszkowski 方程或 Gibbs 吸附公式，应按实验指导书确认浓度单位、温度和常数。"},
    {slug:"saponification",code:"PC-02",name:"乙酸乙酯的皂化反应",group:"化学动力学",desc:"按温度分组录入电导率–时间数据，比较线性化关系与反应速率常数。",x:"时间 t",y:"电导率 κ",xu:"min",yu:"mS·cm⁻¹",note:"可分别绘制 κ–t、(κt−κ∞)–t 与 1/(κt−κ∞)–t。κ∞ 的取值、温度分组和反应级数判定请按实验指导书核对。"},
    {slug:"rectorite-adsorption",code:"PC-03",name:"累托石吸附亚甲基蓝",group:"界面化学",desc:"绘制吸附等温线，比较 Langmuir / Freundlich 模型并输出 Origin 可用数据。",x:"平衡浓度 ce",y:"平衡吸附量 qe",xu:"mg·L⁻¹",yu:"mg·g⁻¹",note:"吸附量需依据初始浓度、平衡浓度、溶液体积和吸附剂质量计算。工作曲线及稀释倍数要保留来源和单位。"},
    {slug:"zeta-potential",code:"PC-04",name:"溶胶 ζ 电势与电解质聚沉值",group:"胶体化学",desc:"整理电泳时间、电压、界面移动距离及不同电解质聚沉浓度。",x:"实验条件",y:"ζ 电势",xu:"",yu:"mV",note:"ζ 电势计算需明确电泳迁移率、介电常数、黏度及所采用的电泳模型。聚沉值应区分电解质种类和离子价态。"},
    {slug:"galvanic-cell",code:"PC-05",name:"原电池热力学",group:"电化学",desc:"对不同温度下的电动势作图，分析温度系数与热力学函数。",x:"温度 T",y:"电动势 E",xu:"K",yu:"V",note:"ΔrGm = −nFE；ΔrSm = nF(∂E/∂T)p。电子转移数 n、符号和温度系数取值应按电池反应及原始读数审核。"},
    {slug:"phase-diagram",code:"PC-06",name:"二组分凝聚系统相图",group:"相平衡",desc:"整理不同组成样品的冷却曲线，识别转折区并绘制温度–组成图。",x:"组成 x",y:"温度 T",xu:"",yu:"℃",note:"冷却曲线特征温度的确定涉及平台/转折点识别。系统组成、质量分数与摩尔分数不得混用。"},
    {slug:"boiling-composition",code:"PC-07",name:"二组分液相完全互溶系统沸点–组成图",group:"相平衡",desc:"由折射率工作曲线换算气液相组成，绘制沸点–组成关系。",x:"液相组成 x",y:"沸点 T",xu:"",yu:"℃",note:"请区分气相冷凝液组成与液相组成，折射率标准曲线的插值区间和温度条件需保留。"},
    {slug:"reaction-enthalpy",code:"PC-08",name:"反应焓的测定",group:"热化学",desc:"整理量热数据、温度修正和物质的量，输出反应焓计算所需数据。",x:"时间 t",y:"温度 T",xu:"s",yu:"℃",note:"量热计算依赖量热计热容、溶液比热、质量、温度修正和反应方程式。请勿将不同反应体系数据混合。"},
    {slug:"freezing-point",code:"PC-09",name:"凝固点降低法测定摩尔质量",group:"相平衡",desc:"对冷却曲线进行分段观察，确定凝固点并计算凝固点降低。",x:"时间 t",y:"温度 T",xu:"s",yu:"℃",note:"过冷现象和平台外推会影响凝固点判读。Kf、溶剂质量和溶质质量的单位必须一致。"},
    {slug:"equilibrium-constant",code:"PC-10",name:"平衡常数的测定",group:"化学平衡",desc:"按温度整理平衡压力与 Kθ，绘制 lnKθ–1/T 关系。",x:"1/T",y:"ln Kθ",xu:"K⁻¹",yu:"",note:"需先核对平衡总压、分压、标准态和反应计量数。若使用 van ’t Hoff 关系，温度必须使用 K。"},
    {slug:"vapour-pressure",code:"PC-11",name:"液体饱和蒸气压的测定",group:"相平衡",desc:"整理温度与饱和蒸气压数据，分析 ln p–1/T 关系。",x:"1/T",y:"ln p",xu:"K⁻¹",yu:"",note:"压力单位、温度单位和气相近似条件必须一致。拟合斜率转化为汽化焓时要注明所用气体常数。"},
    {slug:"thermostat-viscosity",code:"PC-12",name:"恒温槽的调节及黏度测定",group:"传递性质",desc:"分析恒温槽温度随时间变化，并整理黏度测量结果。",x:"时间 t",y:"温度 T",xu:"s",yu:"℃",note:"温度波动与黏度测量是不同的数据任务，应分别记录；黏度计算需记录密度、流出时间和仪器常数。"},
    {slug:"hydrogen-peroxide",code:"PC-13",name:"过氧化氢的催化分解",group:"化学动力学",desc:"记录不同催化剂浓度下的反应过程，比较动力学拟合关系。",x:"时间 t",y:"反应量",xu:"min",yu:"mL",note:"需先确认实验测量量与反应进度之间的换算，以及所采用的速率方程和反应级数。"},
    {slug:"passivation",code:"PC-14",name:"金属钝化行为和极化曲线",group:"电化学",desc:"导入电位–电流数据，绘制极化曲线并观察钝化区间。",x:"电位 E",y:"电流对数 log i",xu:"mV",yu:"log(mA)",note:"需确认电位参比电极、扫描方向、电流密度换算和对数底数。原始数据与变换数据应同时保存。"}
  ];
  let authMode = "login", user = null, profile = null, currentExperiment = null;
  let chart = null, latestAnalysis = null, gradingRecord = null, lastRecords = [], activeClassId = null, classesCache = [], selectedFitIndices = [], dedicatedResult = null, dedicatedTables = {}, plotlyGraph = null;
  let gradingPdfBytes = null, gradingStrokes = {}, catalogEditingId = null, catalogOriginalSlug = null, classEditingId = null;
  const pageMap = {overview:"工作台",experiments:"实验与数据分析",analysis:"实验数据分析",reports:"我的实验报告",review:"报告批阅",users:"用户与权限",classes:"班级与任务",system:"系统管理"};
  const toast = (message, error=false) => {
    const el=$("toast"); el.textContent=message; el.classList.toggle("error",error); el.classList.add("show");
    clearTimeout(toast._timer); toast._timer=setTimeout(()=>el.classList.remove("show"),3600);
  };
  const showAuth = () => { $("authView").classList.remove("hidden"); $("appView").classList.add("hidden"); };
  const showApp = () => { $("authView").classList.add("hidden"); $("appView").classList.remove("hidden"); };
  function setAuthMode(mode) {
    authMode=mode; const register=mode==="register", recovery=mode==="recovery";
    $("authTitle").textContent=recovery?"设置新密码":(register?"创建学生账号":"登录平台");
    $("authSubtitle").textContent=recovery?"请设置一个至少 8 位的新密码。":(register?"注册后系统会自动创建普通学生身份。":"使用课程账号进入实验工作区。");
    $("registerFields").classList.toggle("hidden",!register);
    $("authForm").classList.toggle("hidden",recovery);
    $("resetPanel").classList.toggle("hidden",!recovery);
    $("authLinks").classList.toggle("hidden",recovery);
    $("authSubmit").textContent=register?"注册并创建账号":"登录";
    $("toggleAuth").textContent=register?"已有账号？返回登录":"还没有账号？立即注册";
    $("password").autocomplete=register?"new-password":"current-password";
  }
  function roleName(role){return ({student:"学生",teacher:"教师",admin:"管理员"})[role]||"学生";}
  function initials(name){return (name||"U").trim().slice(0,1).toUpperCase();}
  function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function experimentName(slug){return experiments.find(x=>x.slug===slug)?.name||slug||"未命名实验";}
  async function loadProfile() {
    const {data,error}=await db.from("profiles").select("*").eq("id",user.id).maybeSingle();
    if(error) throw error;
    if(!data) throw new Error("未找到用户资料。请先在 Supabase SQL Editor 执行仓库中的数据库迁移，再重新登录。");
    profile=data;
  }
  function updateUserChrome(){
    const name=profile?.full_name||user?.email?.split("@")[0]||"用户";
    $("profileName").textContent=name; $("profileRole").textContent=roleName(profile?.role);
    $("avatarInitial").textContent=initials(name); $("welcomeName").textContent=name;
    const isStaff=["teacher","admin"].includes(profile?.role);
    document.querySelectorAll(".staff-only").forEach(el=>el.classList.toggle("hidden",!isStaff));
    document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",profile?.role!=="admin"));
  }
  function go(page){
    const allowed=["overview","experiments","analysis","reports","review","users","classes","system"];
    if(!allowed.includes(page)) page="overview";
    if(page==="review"&&!["teacher","admin"].includes(profile?.role)) page="overview";
    if(page==="users"&&profile?.role!=="admin") page="overview";
    if(page==="system"&&profile?.role!=="admin") page="overview";
    document.querySelectorAll(".page").forEach(el=>el.classList.add("hidden"));
    const target=$(page+"Page"); if(target) target.classList.remove("hidden");
    document.querySelectorAll(".nav-item[data-page]").forEach(el=>el.classList.toggle("active",el.dataset.page===page||(page==="analysis"&&el.dataset.page==="experiments")));
    $("pageCrumb").textContent=pageMap[page]||"";
    if(page==="reports") loadReports();
    if(page==="review") loadReviews();
    if(page==="users") loadUsers();
    if(page==="classes") loadClasses();
    if(page==="system") loadSystemAdmin();
    if(page==="overview") loadOverview();
    window.scrollTo({top:0,behavior:"smooth"});
  }
  async function renderCatalog(){
    const {data,error}=await db.from("experiment_catalog").select("id,slug,code,name,category,description,config,is_active").order("code");
    if(!error&&Array.isArray(data)){
      const rows=data.filter(x=>x.is_active||["teacher","admin"].includes(profile?.role));
      const merged=rows.map(row=>{
        const base=experiments.find(x=>x.slug===row.slug)||{slug:row.slug,code:row.code,x:"X",y:"Y",xu:"",yu:"",note:"该项目尚无专属计算模板。可使用通用数据表；由教师审核后再发布专属算法。"};
        return {...base,slug:row.slug,code:row.code,name:row.name,group:row.category||"其他",desc:row.description||"",active:row.is_active,catalogId:row.id,config:row.config||{}};
      });
      experiments.splice(0,experiments.length,...merged);
    }
    const shown=experiments.filter(e=>e.active!==false);
    $("experimentCatalog").innerHTML=shown.map(e=>`
      <article class="experiment-card">
        <div class="experiment-top"><span class="experiment-code">${escapeHtml(e.code)}</span><span class="experiment-type">${escapeHtml(e.group)}</span></div>
        <h3>${escapeHtml(e.name)}</h3><p>${escapeHtml(e.desc)}</p>
        <button data-open-experiment="${escapeHtml(e.slug)}">打开数据工作区　→</button>
      </article>`).join("");
    $("taskExperiment").innerHTML=shown.map(e=>'<option value="'+escapeHtml(e.slug)+'">'+escapeHtml(e.code+" · "+e.name)+'</option>').join("");
    if(["teacher","admin"].includes(profile?.role)) await loadExperimentCatalogManager();
  }
  function openExperiment(slug){
    currentExperiment=experiments.find(e=>e.slug===slug)||experiments[0];
    $("analysisGroup").textContent=currentExperiment.code+" · "+currentExperiment.group;
    $("analysisTitle").textContent=currentExperiment.name;
    $("analysisDescription").textContent=currentExperiment.desc;
    $("xLabel").value=currentExperiment.x; $("yLabel").value=currentExperiment.y;
    $("xUnit").value=currentExperiment.xu; $("yUnit").value=currentExperiment.yu;
    $("dataInput").value=""; $("dataCount").textContent="等待输入数据";
    $("experimentMethodNote").textContent=currentExperiment.note;
    const engine=window.TJUCPE_EXPERIMENT_ENGINE;
    const def=engine?.definitions?.find(x=>x.slug===slug);
    if(def){
      selectedFitIndices=[];dedicatedResult=null;dedicatedTables={};
      $("dedicatedEnginePanel").classList.remove("hidden");
      $("genericRawPanel").classList.add("hidden");
      $("genericAnalysisPanel").classList.add("hidden");
      $("engineWorkflowTitle").textContent=def.code+" · "+def.name;
      $("engineWorkflowDescription").textContent=def.note;
      engine.renderSetup(slug,$("experimentSpecificInputs"),$("experimentSpecificSettings"));
      $("fitSelectionLabel").textContent="拟合范围：全部有效数据点（可在图上框选或套索选点）";
    }else{
      $("dedicatedEnginePanel").classList.add("hidden");
      $("genericRawPanel").classList.remove("hidden");
      $("genericAnalysisPanel").classList.remove("hidden");
    }
    clearAnalysis(); go("analysis");
  }
  function parseTable(text){
    const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    if(!lines.length)return {headers:[],rows:[]};
    const splitLine=line=>/[\t,，;；]/.test(line)?line.split(/[\t,，;；]/).map(s=>s.trim()):line.split(/\s+/).map(s=>s.trim());
    const first=splitLine(lines[0]);
    const hasHeader=first.some(v=>v!==""&&!Number.isFinite(Number(v)));
    const headers=hasHeader?first:first.map((_,i)=>i===0?$("xLabel").value:(i===1?$("yLabel").value:"系列 "+i));
    const body=hasHeader?lines.slice(1):lines;
    const width=Math.max(2,headers.length);
    const rows=body.map(line=>splitLine(line)).filter(cells=>cells.length>=width)
      .map(cells=>cells.slice(0,width).map(Number))
      .filter(cells=>cells.every(Number.isFinite));
    return {headers,rows};
  }
  function solveLinearSystem(A,b){
    const n=b.length, M=A.map((row,i)=>row.slice().concat(b[i]));
    for(let i=0;i<n;i++){
      let max=i; for(let k=i+1;k<n;k++) if(Math.abs(M[k][i])>Math.abs(M[max][i])) max=k;
      [M[i],M[max]]=[M[max],M[i]];
      if(Math.abs(M[i][i])<1e-12) throw new Error("拟合矩阵奇异，数据点可能不足或 X 值重复。");
      const pivot=M[i][i]; for(let j=i;j<=n;j++) M[i][j]/=pivot;
      for(let k=0;k<n;k++){if(k===i)continue;const f=M[k][i];for(let j=i;j<=n;j++)M[k][j]-=f*M[i][j];}
    }
    return M.map(row=>row[n]);
  }
  function polyFit(points,degree){
    if(points.length<=degree) throw new Error("当前拟合阶数需要至少 "+(degree+1)+" 个有效数据点。");
    const A=[],b=[];
    for(let row=0;row<=degree;row++){
      A[row]=[];for(let col=0;col<=degree;col++) A[row][col]=points.reduce((s,p)=>s+Math.pow(p.x,row+col),0);
      b[row]=points.reduce((s,p)=>s+p.y*Math.pow(p.x,row),0);
    }
    const coefficients=solveLinearSystem(A,b);
    const predict=x=>coefficients.reduce((s,c,i)=>s+c*Math.pow(x,i),0);
    const mean=points.reduce((s,p)=>s+p.y,0)/points.length;
    const residuals=points.map(p=>p.y-predict(p.x));
    const sse=residuals.reduce((s,r)=>s+r*r,0);
    const sst=points.reduce((s,p)=>s+Math.pow(p.y-mean,2),0);
    const r2=sst===0?1:1-sse/sst;
    return {coefficients,predict,residuals,sse,r2};
  }
  function clearAnalysis(){
    latestAnalysis=null;dedicatedResult=null;selectedFitIndices=[];
    if(chart){chart.destroy();chart=null;}
    if(window.Plotly&&$("analysisPlotly")){try{Plotly.purge($("analysisPlotly"));}catch(_){ }}
    if($("pythonPlotImage")){$("pythonPlotImage").src="";$("pythonPlotImage").classList.add("hidden");}
    if($("pythonPlotStatus"))$("pythonPlotStatus").textContent="等待运行实验计算";
    $("analysisResult").classList.add("hidden");$("chartPlaceholder").classList.remove("hidden");
    $("engineWarnings").classList.add("hidden");$("engineWarnings").innerHTML="";
    $("dataTableBody").innerHTML='<tr><td colspan="4" class="muted center">暂无数据</td></tr>';
    $("dataTableHead").innerHTML='<tr><th>#</th><th id="tableXHeader">X</th><th id="tableYHeader">Y</th><th>残差</th></tr>';
    ["statN","statMean","statSd","statR2","statSse"].forEach(id=>$(id).textContent="—");
    $("downloadChart").disabled=true;$("downloadCsv").disabled=true;$("saveRecord").disabled=false;
    $("chartCaption").textContent="当前没有图表";
    if($("fitSelectionLabel"))$("fitSelectionLabel").textContent="拟合范围：全部有效数据点";
  }
  function formatNum(n){return Number.isFinite(n)?Number(n).toPrecision(5):"—";}
  let pyodideRuntimePromise=null;
  async function getPythonPlotRuntime(){
    if(pyodideRuntimePromise)return pyodideRuntimePromise;
    pyodideRuntimePromise=(async()=>{
      if(typeof window.loadPyodide!=="function")throw new Error("Python 运行环境尚未加载，请检查网络后刷新页面。");
      const py=await window.loadPyodide({indexURL:"https://cdn.jsdelivr.net/pyodide/v0.27.7/full/"});
      await py.loadPackage(["numpy","matplotlib"]);
      await py.runPythonAsync("import matplotlib; matplotlib.use('agg')");
      return py;
    })();
    try{return await pyodideRuntimePromise;}catch(error){pyodideRuntimePromise=null;throw error;}
  }
  async function renderPythonMatplotlib(def,result){
    const status=$("pythonPlotStatus"),image=$("pythonPlotImage");
    if(status)status.textContent="正在启动浏览器内 Python / NumPy / Matplotlib…";
    const payload=(result.series||[]).map(series=>({
      name:series.name||"数据系列",xLabel:series.xLabel||"X",yLabel:series.yLabel||"Y",
      points:(series.points||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).map(p=>[p.x,p.y]),
      fit:(series.fitCurve||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).map(p=>[p.x,p.y])
    }));
    const py=await getPythonPlotRuntime();
    py.globals.set("tjucpe_plot_payload",JSON.stringify(payload));
    await py.runPythonAsync(`
import json, io, base64, numpy as np
import matplotlib
matplotlib.use("agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import AutoMinorLocator
data = json.loads(tjucpe_plot_payload)
fig, ax = plt.subplots(figsize=(10.5, 6.4), dpi=160, constrained_layout=True)
palette = ["#168b83","#5887b9","#c58b43","#8d78b8","#c65a4d","#4a9a70","#607d8b","#b56f91"]
for i, item in enumerate(data):
    color = palette[i % len(palette)]
    pts = np.asarray(item["points"], dtype=float)
    if pts.size:
        ax.scatter(pts[:,0], pts[:,1], s=34, color=color, edgecolors="white", linewidths=.55, alpha=.92, label=item["name"], zorder=3)
    fit = np.asarray(item["fit"], dtype=float)
    if fit.size:
        ax.plot(fit[:,0], fit[:,1], color=color, linewidth=2.15, linestyle="--", label=item["name"]+" · 拟合")
ax.set_xlabel(data[0]["xLabel"] if data else "X", fontsize=11)
ax.set_ylabel(data[0]["yLabel"] if data else "Y", fontsize=11)
ax.set_title(${JSON.stringify(def.name)}, fontsize=13, pad=14)
ax.grid(True, which="major", linestyle="-", linewidth=.65, alpha=.24)
ax.grid(True, which="minor", linestyle=":", linewidth=.4, alpha=.16)
ax.xaxis.set_minor_locator(AutoMinorLocator())
ax.yaxis.set_minor_locator(AutoMinorLocator())
ax.tick_params(direction="in", which="both", top=True, right=True)
for spine in ax.spines.values(): spine.set_color("#9aabb4")
handles, labels = ax.get_legend_handles_labels()
if handles: ax.legend(loc="best", frameon=True, framealpha=.92, fontsize=9)
buf = io.BytesIO()
fig.savefig(buf, format="png", dpi=240, bbox_inches="tight", facecolor="white")
plt.close(fig)
tjucpe_plot_png = base64.b64encode(buf.getvalue()).decode("ascii")
`);
    const png=py.globals.get("tjucpe_plot_png").toString();
    image.src="data:image/png;base64,"+png;
    image.classList.remove("hidden");
    if(status)status.textContent="Python 3 · NumPy · Matplotlib 已完成科研图形绘制（240 DPI）";
    return image.src;
  }
  function readDedicatedInputs(){
    const engine=window.TJUCPE_EXPERIMENT_ENGINE;
    const def=engine?.definitions?.find(x=>x.slug===currentExperiment?.slug);
    if(!def)throw new Error("当前实验没有专属计算流程。");
    const tables=Object.fromEntries(def.tables.map(t=>[t.key,$("expData_"+t.key)?.value||""]));
    const settings=Object.fromEntries(def.settings.map(f=>[f.key,$("expSetting_"+f.key)?.value??""]));
    return {def,tables,settings};
  }
  function runDedicatedAnalysis(){
    if(!window.TJUCPE_EXPERIMENT_ENGINE||!window.Plotly){toast("实验算法或绘图组件尚未加载，请刷新页面。",true);return;}
    try{
      const {def,tables,settings}=readDedicatedInputs();
      const result=window.TJUCPE_EXPERIMENT_ENGINE.analyze(def.slug,tables,settings,selectedFitIndices);
      dedicatedTables=tables;dedicatedResult=result;
      renderDedicatedResult(def,result,tables,settings);
    }catch(error){toast(error?.message||"实验计算失败。",true);}
  }
  function renderDedicatedResult(def,result,tables,settings){
    const firstSeries=result.series?.[0],basePoints=(firstSeries?.points||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    const yValues=basePoints.map(p=>p.y),summaryMean=yValues.length?yValues.reduce((a,b)=>a+b,0)/yValues.length:NaN;
    const summarySd=yValues.length>1?Math.sqrt(yValues.reduce((a,b)=>a+(b-summaryMean)**2,0)/(yValues.length-1)):NaN;
    const plotData=[];
    (result.series||[]).forEach((series,index)=>{
      const pts=(series.points||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
      plotData.push({
        type:"scatter",mode:"markers",name:series.name,
        x:pts.map(p=>p.x),y:pts.map(p=>p.y),
        customdata:pts.map((p,i)=>Number.isInteger(p.i)?p.i:i),
        marker:{size:7,color:["#168b83","#5887b9","#c58b43","#8d78b8","#c65a4d","#4a9a70","#607d8b","#b56f91"][index%8],opacity:0.88},
        hovertemplate:"%{x:.6g}, %{y:.6g}<extra>"+escapeHtml(series.name)+"</extra>"
      });
      if(series.fitCurve?.length){
        plotData.push({
          type:"scatter",mode:"lines",name:series.name+" · 拟合",
          x:series.fitCurve.map(p=>p.x),y:series.fitCurve.map(p=>p.y),
          line:{width:2.5,dash:"dash",color:["#b94f48","#346f9a","#b27a25","#7665a3"][index%4]},
          hovertemplate:"%{x:.6g}, %{y:.6g}<extra>拟合曲线</extra>"
        });
      }
    });
    $("chartPlaceholder").classList.add("hidden");
    const layout={
      autosize:true,paper_bgcolor:"#ffffff",plot_bgcolor:"#ffffff",
      font:{family:"Noto Sans SC, Arial, sans-serif",size:12,color:"#486274"},
      margin:{l:72,r:28,t:36,b:70},legend:{orientation:"h",y:-0.22,x:0},
      dragmode:"select",
      xaxis:{title:firstSeries?.xLabel||"X",gridcolor:"#e9eff2",zerolinecolor:"#d4e0e5",linecolor:"#bfcdd4"},
      yaxis:{title:firstSeries?.yLabel||"Y",gridcolor:"#e9eff2",zerolinecolor:"#d4e0e5",linecolor:"#bfcdd4"},
      selectdirection:"any",hovermode:"closest"
    };
    $("pythonPlotImage").classList.add("hidden");
    $("pythonPlotStatus").textContent="等待 Python 绘图…";
    renderPythonMatplotlib(def,result).catch(error=>{
      $("pythonPlotStatus").textContent="Python 绘图暂不可用："+error.message+"；下方交互选区图仍可用于选择拟合范围。";
      $("engineWarnings").classList.remove("hidden");
      $("engineWarnings").innerHTML="<strong>Python 绘图提示</strong><ul><li>"+escapeHtml(error.message)+"</li><li>数据和计算结果未丢失；可检查网络后重新运行。</li></ul>";
    });
    Plotly.react("analysisPlotly",plotData,layout,{
      responsive:true,displaylogo:false,scrollZoom:true,modeBarButtonsToAdd:["select2d","lasso2d"],
      toImageButtonOptions:{format:"png",filename:(currentExperiment?.slug||"experiment")+"-selection",height:900,width:1400,scale:2}
    }).then(graph=>{
      plotlyGraph=graph;
      const node=$("analysisPlotly");
      node.removeAllListeners?.("plotly_selected");
      node.on("plotly_selected",event=>{
        const chosen=(event?.points||[]).filter(p=>p.curveNumber===0&&plotData[p.curveNumber]?.mode==="markers");
        selectedFitIndices=[...new Set(chosen.map(p=>Number(p.customdata)).filter(Number.isInteger))];
        $("fitSelectionLabel").textContent=selectedFitIndices.length
          ?("已选中 "+selectedFitIndices.length+" 个原始点；点击“运行本实验专属计算”按选区重新拟合。")
          :"未选中有效原始点，将使用全部数据拟合。";
      });
      node.removeAllListeners?.("plotly_deselect");
      node.on("plotly_deselect",()=>{selectedFitIndices=[];$("fitSelectionLabel").textContent="拟合范围：全部有效数据点";});
    }).catch(error=>toast("选区工具加载失败："+error.message,true));
    $("analysisResult").classList.remove("hidden");
    const metrics=(result.metrics||[]).map(([label,value,unit])=>
      '<div class="engine-metric"><span>'+escapeHtml(String(label))+'</span><strong>'+escapeHtml(formatNum(Number(value)))+'</strong><small>'+escapeHtml(String(unit||""))+'</small></div>'
    ).join("");
    const warnings=(result.warnings||[]).map(w=>'<li>'+escapeHtml(w)+'</li>').join("");
    $("analysisResult").innerHTML=
      '<div class="engine-result-heading"><strong>专属计算完成</strong><span>'+escapeHtml(def.code+" · "+def.name)+'</span></div>'+
      '<div class="engine-metrics">'+metrics+'</div>'+
      '<p class="tiny muted">算法版本 TJUCPE Experiment Engine 2.0.0 · 原始录入数据不会被拟合覆盖</p>';
    if(warnings){
      $("engineWarnings").classList.remove("hidden");
      $("engineWarnings").innerHTML='<strong>校核提示</strong><ul>'+warnings+'</ul>';
    }else{$("engineWarnings").classList.add("hidden");$("engineWarnings").innerHTML="";}
    $("statN").textContent=String(basePoints.length);
    $("statMean").textContent=formatNum(summaryMean);$("statSd").textContent=formatNum(summarySd);
    $("statR2").textContent=result.fit?.r2==null?"—":formatNum(result.fit.r2);
    $("statSse").textContent=result.fit?.sse==null?"—":formatNum(result.fit.sse);
    $("chartCaption").textContent=def.code+" · "+def.name+" · "+(result.series?.length||0)+" 组曲线";
    const rows=result.resultRows||result.rawRows||[],headers=result.headers||[];
    const width=Math.max(headers.length,...rows.map(r=>Array.isArray(r)?r.length:0),1);
    $("dataTableHead").innerHTML="<tr>"+["序号",...Array.from({length:width},(_,i)=>headers[i]||("数据/计算列 "+(i+1)))].map(x=>"<th>"+escapeHtml(String(x))+"</th>").join("")+"</tr>";
    $("dataTableBody").innerHTML=rows.slice(0,500).map((row,i)=>{
      const cells=Array.isArray(row)?row:[JSON.stringify(row)];
      return "<tr><td>"+(i+1)+"</td>"+Array.from({length:width},(_,j)=>"<td>"+escapeHtml(cells[j]===null||cells[j]===undefined?"—":typeof cells[j]==="number"?formatNum(cells[j]):String(cells[j]))+"</td>").join("")+"</tr>";
    }).join("")||'<tr><td colspan="'+(width+1)+'" class="muted center">无可显示的明细数据</td></tr>';
    $("downloadChart").disabled=false;$("downloadCsv").disabled=false;
    const fitResult=result.fit||null;
    latestAnalysis={
      points:basePoints,rawRows:result.rawRows??rows,seriesLabels:(result.series||[]).map(x=>x.name),
      fit:fitResult?{coefficients:fitResult.coefficients||fitResult.params||[fitResult.slope,fitResult.intercept].filter(Number.isFinite),r2:fitResult.r2??null,sse:fitResult.sse??null,residuals:fitResult.residuals||[]}:null,
      model:def.workflow,xLabel:firstSeries?.xLabel||"X",yLabel:firstSeries?.yLabel||"Y",xUnit:"",yUnit:"",
      mean:summaryMean,sd:summarySd,engine:"tjucpe-experiment-engine-2.0.0",
      exportRows:rows,exportHeaders:headers,analysisSummary:{metrics:result.metrics||[],warnings:result.warnings||[]},
      sourceTables:tables,settings
    };
  }
  function clearDedicatedSelection(){
    selectedFitIndices=[];
    $("fitSelectionLabel").textContent="拟合范围：全部有效数据点";
    if(window.Plotly&&$("analysisPlotly"))Plotly.relayout("analysisPlotly",{selection:{}}).catch(()=>{});
  }
  function runAnalysis(){
    if(currentExperiment&&window.TJUCPE_EXPERIMENT_ENGINE?.definitions?.some(x=>x.slug===currentExperiment.slug)){
      runDedicatedAnalysis();return;
    }
    runLegacyAnalysis();
  }
  function runLegacyAnalysis(){
    const table=parseTable($("dataInput").value);
    const rawRows=table.rows;
    const points=rawRows.map(row=>({x:row[0],y:row[1]}));
    const seriesLabels=table.headers.slice(1);
    $("dataCount").textContent=points.length+" 行 · "+seriesLabels.length+" 条 Y 系列";
    if(points.length<2){toast("请至少输入 2 行有效数值数据，每行包含 X 和至少一列 Y。",true);return;}
    const model=$("fitModel").value, degree=({linear:1,quadratic:2,cubic:3})[model];
    let fit=null;
    try{if(degree)fit=polyFit(points,degree);}catch(e){toast(e.message,true);return;}
    const mean=points.reduce((s,p)=>s+p.y,0)/points.length;
    const sd=Math.sqrt(points.reduce((s,p)=>s+Math.pow(p.y-mean,2),0)/(points.length-1));
    const palette=["#168b83","#5887b9","#c58b43","#8d78b8","#c65a4d","#4a9a70","#607d8b","#b56f91"];
    const datasets=seriesLabels.map((label,index)=>({
      label:label||("系列 "+(index+1)),
      data:rawRows.map(row=>({x:row[0],y:row[index+1]})),
      showLine:$("chartStyle").value==="line",
      borderColor:palette[index%palette.length],backgroundColor:palette[index%palette.length],
      pointRadius:3.5,pointHoverRadius:5,borderWidth:1.4
    }));
    if(fit){
      const min=Math.min(...points.map(p=>p.x)),max=Math.max(...points.map(p=>p.x));
      const curve=Array.from({length:160},(_,i)=>{const x=min+(max-min)*i/159;return{x,y:fit.predict(x)};});
      datasets.push({label:"系列 1 拟合曲线",data:curve,showLine:true,pointRadius:0,borderColor:"#c65a4d",borderWidth:2,borderDash:[5,3],tension:0});
    }
    if(chart) chart.destroy();
    $("chartPlaceholder").classList.add("hidden");
    chart=new Chart($("analysisChart"),{type:"scatter",data:{datasets},options:{responsive:true,maintainAspectRatio:false,animation:{duration:350},plugins:{legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:8,font:{family:"Noto Sans SC",size:10},color:"#68808f"}},tooltip:{callbacks:{label(ctx){return ctx.dataset.label+": ("+formatNum(ctx.parsed.x)+", "+formatNum(ctx.parsed.y)+")";}}}},scales:{x:{type:"linear",title:{display:true,text:$("xLabel").value+" / "+$("xUnit").value,color:"#506b7b",font:{size:11}},grid:{color:"#edf1f3",borderDash:[3,4]},ticks:{color:"#80929d",font:{size:10}}},y:{title:{display:true,text:$("yLabel").value+" / "+$("yUnit").value,color:"#506b7b",font:{size:11}},grid:{color:"#edf1f3",borderDash:[3,4]},ticks:{color:"#80929d",font:{size:10}}}}}});
    $("statN").textContent=String(points.length);$("statMean").textContent=formatNum(mean);$("statSd").textContent=formatNum(sd);
    $("statR2").textContent=fit?formatNum(fit.r2):"未拟合";$("statSse").textContent=fit?formatNum(fit.sse):"—";
    const equation=fit?fit.coefficients.map((c,i)=>(i===0?formatNum(c):(c>=0?" + ":" − ")+formatNum(Math.abs(c))+"x"+(i>1?"^"+i:""))).join(""):"仅显示原始实验点";
    $("analysisResult").innerHTML="<strong>分析完成：</strong> "+points.length+" 个数据点 · "+seriesLabels.length+" 条曲线 · "+escapeHtml(equation)+(fit?" · R² = "+formatNum(fit.r2):"");
    $("analysisResult").classList.remove("hidden");
    $("tableXHeader").textContent=$("xLabel").value+" ("+$("xUnit").value+")";
    $("tableYHeader").textContent=(seriesLabels[0]||$("yLabel").value)+" ("+$("yUnit").value+")";
    $("dataTableBody").innerHTML=points.map((p,i)=>`<tr><td>${i+1}</td><td>${p.x}</td><td>${p.y}</td><td>${fit?formatNum(fit.residuals[i]):"—"}</td></tr>`).join("");
    $("chartCaption").textContent=$("analysisTitle").textContent+" · "+points.length+" 点 · "+seriesLabels.length+" 条曲线"+(fit?" · "+model+" 拟合":"");
    $("downloadChart").disabled=false;$("downloadCsv").disabled=false;
    latestAnalysis={points,rawRows,seriesLabels,fit,model,xLabel:$("xLabel").value,yLabel:$("yLabel").value,xUnit:$("xUnit").value,yUnit:$("yUnit").value,mean,sd,engine:ENGINE_VERSION};
  }
  async function saveRecord(){
    if(!user||!latestAnalysis){toast("请先运行分析，再保存记录。",true);return;}
    const record={owner_id:user.id,experiment_slug:currentExperiment?.slug||"custom",title:currentExperiment?.name||"数据分析",raw_data:{headers:latestAnalysis.seriesLabels,rows:latestAnalysis.rawRows,source_tables:latestAnalysis.sourceTables||null,export_headers:latestAnalysis.exportHeaders||null,export_rows:latestAnalysis.exportRows||null},analysis:{model:latestAnalysis.model,coefficients:latestAnalysis.fit?.coefficients||null,r2:latestAnalysis.fit?.r2??null,sse:latestAnalysis.fit?.sse??null,mean:latestAnalysis.mean,sd:latestAnalysis.sd,x_label:latestAnalysis.xLabel,y_label:latestAnalysis.yLabel,x_unit:latestAnalysis.xUnit,y_unit:latestAnalysis.yUnit,summary:latestAnalysis.analysisSummary||null,settings:latestAnalysis.settings||null},engine_version:latestAnalysis.engine||ENGINE_VERSION};
    const {error}=await db.from("experiment_records").insert(record);
    if(error){toast("保存失败："+error.message,true);return;}
    toast("分析记录已保存到个人空间。"); loadOverview();
  }
  function downloadCsv(){
    if(!latestAnalysis)return;
    const headers=latestAnalysis.exportHeaders||[latestAnalysis.xLabel,latestAnalysis.yLabel];
    const rows=latestAnalysis.exportRows||latestAnalysis.rawRows||[];
    const csv="\\uFEFF"+[headers,...rows].map(r=>(Array.isArray(r)?r:[r]).map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\\r\\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=(currentExperiment?.slug||"experiment-data")+"-origin.csv";a.click();URL.revokeObjectURL(a.href);
  }
  async function loadOverview(){
    if(!db||!user)return;
    const [records,reports]=await Promise.all([
      db.from("experiment_records").select("id,created_at,title").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(5),
      db.from("report_submissions").select("id,status,feedback,created_at").eq("student_id",user.id)
    ]);
    $("metricRecords").textContent=records.data?.length??0;
    $("metricReports").textContent=reports.data?.length??0;
    $("metricFeedback").textContent=(reports.data||[]).filter(r=>r.status==="returned"||!!r.feedback).length;
    if(records.data?.length||reports.data?.length){
      const items=[...(records.data||[]).map(x=>({date:x.created_at,label:x.title,kind:"分析记录"})),...(reports.data||[]).map(x=>({date:x.created_at,label:"实验报告",kind:x.status}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
      $("recentActivity").innerHTML=items.map(i=>`<div class="activity-row"><span>${escapeHtml(i.label)}</span><span>${escapeHtml(i.kind)}</span><small>${new Date(i.date).toLocaleString("zh-CN")}</small></div>`).join("");
    }
  }
  function statusLabel(status){return ({draft:"草稿",submitted:"已提交",graded:"已批阅",returned:"退回修改",withdrawn:"已撤回"})[status]||status;}
  function statusClass(status){return status||"draft";}
  async function loadReports(){
    const body=$("reportsBody");body.innerHTML='<tr><td colspan="6" class="muted center">正在加载……</td></tr>';
    const {data,error}=await db.from("report_submissions").select("*").eq("student_id",user.id).order("created_at",{ascending:false});
    if(error){body.innerHTML=`<tr><td colspan="6" class="center">${escapeHtml(error.message)}</td></tr>`;return;}
    lastRecords=data||[];
    if(!lastRecords.length){body.innerHTML='<tr><td colspan="6" class="muted center">暂无报告记录，点击右上角提交第一份实验报告。</td></tr>';return;}
    body.innerHTML=lastRecords.map(r=>`<tr><td>${escapeHtml(experimentName(r.experiment_slug))}</td><td>${escapeHtml(r.file_name||"报告文件")}</td><td>${new Date(r.created_at).toLocaleDateString("zh-CN")}</td><td><span class="status-pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></td><td>${r.score??"—"}</td><td><button class="action-link" data-report-download="${r.id}">预览</button> <button class="action-link" data-report-feedback="${r.id}">反馈</button> ${r.status==="submitted"?`<button class="action-link" data-report-withdraw="${r.id}">撤回</button>`:""} ${["draft","returned","withdrawn"].includes(r.status)?`<button class="action-link" data-report-edit="${r.id}">修改并重交</button> <button class="action-link" data-report-delete="${r.id}">删除</button>`:""}</td></tr>`).join("");
  }
  async function submitReport(){
    const file=$("reportFile").files[0],classId=$("reportClass").value,assignmentId=$("reportAssignment").value,assignmentOption=$("reportAssignment").selectedOptions[0],slug=assignmentOption?.dataset.slug||"",title=$("reportTitle").value.trim();
    if(!file||!title||!classId||!assignmentId||!slug){toast("请先加入班级并选择教师布置的实验任务，再选择报告文件。",true);return;}
    if(file.size>20*1024*1024){toast("文件超过 20 MB，请压缩后再上传。",true);return;}
    const ext=file.name.split(".").pop().toLowerCase();
    if(!["pdf","docx"].includes(ext)){toast("仅支持 PDF 或 DOCX 文件。",true);return;}
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=user.id+"/"+crypto.randomUUID()+"_"+safeName;
    const {error:uploadError}=await db.storage.from("lab-reports").upload(path,file,{upsert:false,contentType:file.type||(ext==="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.wordprocessingml.document")});
    if(uploadError){toast("文件上传失败："+uploadError.message+"。请确认已执行 Storage 迁移。",true);return;}
    const {error}=await db.from("report_submissions").insert({student_id:user.id,class_id:classId,assignment_id:assignmentId,experiment_slug:slug,title,file_name:file.name,storage_path:path,status:"submitted"});
    if(error){await db.storage.from("lab-reports").remove([path]);toast("报告记录写入失败："+error.message,true);return;}
    toast("报告已提交。");$("reportUploadPanel").classList.add("hidden");$("reportFile").value="";$("reportFileName").textContent="点击选择报告文件";$("reportTitle").value="";loadReports();loadOverview();
  }
  async function downloadReport(id){const row=lastRecords.find(r=>r.id===id);if(row)await openReportViewer(row);}
  async function withdrawReport(id){
    const row=lastRecords.find(r=>r.id===id);if(!row||row.status!=="submitted")return;
    if(!confirm("确认撤回这份已提交报告？撤回后可修改文件并重新提交。"))return;
    const {error}=await db.from("report_submissions").update({status:"withdrawn",withdrawn_at:new Date().toISOString()}).eq("id",id);
    if(error){toast("撤回失败："+error.message,true);return;}
    toast("报告已撤回，可修改后重新提交。");await loadReports();await loadOverview();
  }
  async function editReport(id){
    const row=lastRecords.find(r=>r.id===id);if(!row||!["draft","returned","withdrawn"].includes(row.status))return;
    const picker=document.createElement("input");picker.type="file";picker.accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    picker.onchange=async()=>{
      const file=picker.files?.[0];if(!file)return;
      if(file.size>20*1024*1024){toast("文件超过 20 MB。",true);return;}
      const ext=file.name.split(".").pop().toLowerCase();if(!["pdf","docx"].includes(ext)){toast("仅支持 PDF / DOCX。",true);return;}
      const path=user.id+"/"+crypto.randomUUID()+"_"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const {error:upErr}=await db.storage.from("lab-reports").upload(path,file,{upsert:false,contentType:file.type||(ext==="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.wordprocessingml.document")});
      if(upErr){toast("新文件上传失败："+upErr.message,true);return;}
      const {error}=await db.from("report_submissions").update({file_name:file.name,storage_path:path,status:"submitted",submitted_at:new Date().toISOString(),withdrawn_at:null}).eq("id",id);
      if(error){await db.storage.from("lab-reports").remove([path]);toast("报告更新失败："+error.message,true);return;}
      // Preserve the previous file: report_revisions keeps its path for version history.
      toast("已保存新版本并重新提交，旧版本已保留。");await loadReports();await loadOverview();
    };
    picker.click();
  }
  async function deleteReport(id){
    const row=lastRecords.find(r=>r.id===id);if(!row||!["draft","returned","withdrawn"].includes(row.status))return;
    if(!confirm("确认删除这份报告及其全部历史文件版本？此操作不可恢复。"))return;
    const {data,error}=await db.functions.invoke("classroom-admin",{body:{action:"delete_report",report_id:id}});
    if(error||!data?.ok){toast("报告删除失败："+(error?.message||data?.error||"未知错误"),true);return;}
    if(data.cleanup_warning)toast("报告记录已删除，但部分历史文件清理失败，请管理员检查存储。",true);else toast("报告记录及 "+(data.removed_files||0)+" 个文件版本已删除。");await loadReports();await loadOverview();
  }
  async function showFeedback(id){
    const row=lastRecords.find(r=>r.id===id);if(!row)return;
    $("feedbackContent").textContent=row.feedback||"该报告暂时没有教师反馈。";
    $("feedbackDialog").showModal();
  }
  let reviewRows=[];
  async function loadReviews(){
    $("reviewBody").innerHTML='<tr><td colspan="5" class="muted center">正在加载……</td></tr>';
    const {data,error}=await db.from("report_submissions").select("*").order("created_at",{ascending:false}).limit(500);
    if(error){$("reviewBody").innerHTML=`<tr><td colspan="5" class="center">${escapeHtml(error.message)}</td></tr>`;return;}
    reviewRows=data||[];
    const ids=[...new Set(reviewRows.map(r=>r.student_id))];
    let profiles={};
    if(ids.length){const result=await db.from("profiles").select("id,full_name,student_no").in("id",ids);(result.data||[]).forEach(p=>profiles[p.id]=p);}
    $("reviewBody").innerHTML=reviewRows.length?reviewRows.map(r=>{
      const p=profiles[r.student_id]||{};
      return `<tr><td>${escapeHtml(p.full_name||"学生")}<small class="block muted">${escapeHtml(p.student_no||"")}</small></td><td>${escapeHtml(experimentName(r.experiment_slug))}</td><td>${new Date(r.created_at).toLocaleString("zh-CN")}</td><td><span class="status-pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></td><td><button class="action-link" data-review-open="${r.id}">打开批阅</button></td></tr>`;
    }).join(""):'<tr><td colspan="5" class="muted center">暂无报告提交。</td></tr>';
  }
  async function openGrading(id){
    gradingRecord=reviewRows.find(r=>r.id===id);if(!gradingRecord)return;
    $("gradingTitle").textContent=experimentName(gradingRecord.experiment_slug)+" · "+(gradingRecord.file_name||"报告");
    $("gradeScore").value=gradingRecord.score??"";$("gradeStatus").value=gradingRecord.status==="returned"?"returned":"graded";$("gradeFeedback").value=gradingRecord.feedback||"";
    $("gradingPanel").classList.remove("hidden");await loadGradingPreview(gradingRecord);$("gradingPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function downloadReviewFile(id){const row=reviewRows.find(r=>r.id===id);if(row)await openGrading(id);}
  let gradingPreviewUrl=null;
  function annotationCanvasRedraw(canvas,pageNo){
    const dpr=window.devicePixelRatio||1,ctx=canvas.getContext("2d"),w=canvas.clientWidth,h=canvas.clientHeight;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    (gradingStrokes[pageNo]||[]).forEach(stroke=>{
      const pts=stroke.points||[];if(!pts.length)return;
      ctx.strokeStyle=stroke.color||"#d7263d";ctx.fillStyle=stroke.color||"#d7263d";
      ctx.lineWidth=stroke.width||2.2;ctx.lineCap="round";ctx.lineJoin="round";
      if(pts.length===1){ctx.beginPath();ctx.arc(pts[0].x*w,pts[0].y*h,2,0,Math.PI*2);ctx.fill();return;}
      ctx.beginPath();ctx.moveTo(pts[0].x*w,pts[0].y*h);
      for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x*w,pts[i].y*h);
      ctx.stroke();
    });
  }
  async function renderPdfAnnotation(bytes){
    const host=$("gradingPreviewContent");
    if(!window.pdfjsLib){host.textContent="PDF.js 未能加载，当前可预览但暂不可进行页面标注。请刷新后重试。";return;}
    pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const task=pdfjsLib.getDocument({data:new Uint8Array(bytes)}),pdf=await task.promise;
    host.innerHTML='<div id="pdfAnnotationPages" class="pdf-annotation-pages"></div>';
    const pages=$("pdfAnnotationPages");
    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
      const page=await pdf.getPage(pageNo),viewport=page.getViewport({scale:1.25}),dpr=window.devicePixelRatio||1;
      const wrap=document.createElement("div");wrap.className="pdf-review-page";wrap.dataset.page=String(pageNo);
      const paper=document.createElement("div");paper.className="pdf-review-paper";
      const base=document.createElement("canvas");base.className="pdf-review-base";
      base.width=Math.floor(viewport.width*dpr);base.height=Math.floor(viewport.height*dpr);
      base.style.width=viewport.width+"px";base.style.height=viewport.height+"px";
      const overlay=document.createElement("canvas");overlay.className="pdf-review-overlay";
      overlay.width=base.width;overlay.height=base.height;overlay.style.width=viewport.width+"px";overlay.style.height=viewport.height+"px";
      paper.append(base,overlay);wrap.appendChild(paper);pages.appendChild(wrap);
      const ctx=base.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
      await page.render({canvasContext:ctx,viewport}).promise;
      annotationCanvasRedraw(overlay,pageNo);
      overlay.addEventListener("pointerdown",e=>{
        if(e.button!==0)return;overlay.setPointerCapture(e.pointerId);
        const rect=overlay.getBoundingClientRect(),point={x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height};
        const stroke={color:"#d7263d",width:2.2,points:[point]};
        (gradingStrokes[pageNo] ||= []).push(stroke);overlay.dataset.drawing="1";annotationCanvasRedraw(overlay,pageNo);
      });
      overlay.addEventListener("pointermove",e=>{
        if(overlay.dataset.drawing!=="1")return;
        const rect=overlay.getBoundingClientRect(),point={x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height};
        const list=gradingStrokes[pageNo]||[],stroke=list[list.length-1];if(stroke)stroke.points.push(point);
        annotationCanvasRedraw(overlay,pageNo);
      });
      const stop=()=>{overlay.dataset.drawing="0";};
      overlay.addEventListener("pointerup",stop);overlay.addEventListener("pointercancel",stop);overlay.addEventListener("lostpointercapture",stop);
    }
  }
  async function buildAnnotatedPdf(){
    if(!gradingPdfBytes||!window.PDFLib)throw new Error("PDF 批注组件尚未就绪。");
    const pdf=await PDFLib.PDFDocument.load(gradingPdfBytes),pages=pdf.getPages();
    for(const [pageKey,strokes] of Object.entries(gradingStrokes)){
      const page=pages[Number(pageKey)-1];if(!page)continue;
      const {width,height}=page.getSize();
      for(const stroke of strokes||[]){
        const pts=stroke.points||[];if(!pts.length)continue;
        const points=pts.map(p=>({x:p.x*width,y:height-p.y*height}));
        if(points.length===1){
          page.drawCircle({x:points[0].x,y:points[0].y,size:1.4,color:PDFLib.rgb(0.84,0.10,0.18)});
        }else for(let i=1;i<points.length;i++){
          page.drawLine({start:points[i-1],end:points[i],thickness:stroke.width||2.2,color:PDFLib.rgb(0.84,0.10,0.18),opacity:0.92});
        }
      }
    }
    return await pdf.save();
  }
  function undoPdfAnnotation(){
    const keys=Object.keys(gradingStrokes).sort((a,b)=>Number(b)-Number(a));
    const key=keys.find(k=>(gradingStrokes[k]||[]).length);
    if(!key)return;
    gradingStrokes[key].pop();
    const canvas=document.querySelector('.pdf-review-page[data-page="'+key+'"] .pdf-review-overlay');
    if(canvas)annotationCanvasRedraw(canvas,Number(key));
  }
  function clearPdfAnnotations(){
    if(!confirm("清除本次尚未保存的全部 PDF 批注？"))return;
    gradingStrokes={};
    document.querySelectorAll(".pdf-review-overlay").forEach(canvas=>annotationCanvasRedraw(canvas,Number(canvas.closest(".pdf-review-page")?.dataset.page||1)));
  }
  async function loadGradingPreview(row){
    const host=$("gradingPreviewContent");host.innerHTML="正在加载报告预览…";
    gradingPdfBytes=null;gradingStrokes={};$("pdfAnnotationToolbar")?.classList.add("hidden");
    const {data,error}=await db.storage.from("lab-reports").download(row.storage_path);
    if(error){host.textContent="报告读取失败："+error.message;return;}
    if((row.file_name||"").toLowerCase().endsWith(".pdf")){
      gradingPdfBytes=await data.arrayBuffer();
      if(!window.PDFLib){host.textContent="PDF 编辑组件未加载，暂时不能保存页面批注。";return;}
      $("pdfAnnotationToolbar")?.classList.remove("hidden");
      try{await renderPdfAnnotation(gradingPdfBytes);}
      catch(err){host.textContent="PDF 页面渲染失败："+err.message+"。请重新加载文件或检查 PDF 是否损坏。";$("pdfAnnotationToolbar")?.classList.add("hidden");}
    }else if((row.file_name||"").toLowerCase().endsWith(".docx")){
      if(!window.mammoth){host.textContent="Word 预览组件未加载。";return;}
      const result=await mammoth.convertToHtml({arrayBuffer:await data.arrayBuffer()});
      host.innerHTML='<article class="docx-preview grading-docx"></article>';host.querySelector("article").innerHTML=result.value;
      host.insertAdjacentHTML("afterbegin",'<p class="tiny muted">DOCX 可在线查看并填写批阅意见；页面手写批注目前仅支持 PDF。</p>');
    }else host.textContent="不支持该文件格式。";
  }
  function closeGradingPreview(){
    if(gradingPreviewUrl){URL.revokeObjectURL(gradingPreviewUrl);gradingPreviewUrl=null;}
    gradingPdfBytes=null;gradingStrokes={};$("pdfAnnotationToolbar")?.classList.add("hidden");
    $("gradingPreviewContent").innerHTML="点击“打开批阅”后在此处预览 PDF / DOCX。";
  }

  async function saveGrade(){
    if(!gradingRecord)return;
    const score=$("gradeScore").value===""?null:Number($("gradeScore").value);
    if(score!==null&&(score<0||score>100||!Number.isFinite(score))){toast("成绩必须在 0–100 之间。",true);return;}
    const status=$("gradeStatus").value;
    const update={score,feedback:$("gradeFeedback").value.trim(),status,reviewed_by:user.id,reviewed_at:new Date().toISOString()};
    let newPath=null;
    const hasAnnotations=Object.values(gradingStrokes).some(list=>Array.isArray(list)&&list.length);
    if(gradingPdfBytes&&hasAnnotations){
      try{
        const bytes=await buildAnnotatedPdf();
        newPath="reviewed/"+gradingRecord.id+"/"+crypto.randomUUID()+"_reviewed.pdf";
        const blob=new Blob([bytes],{type:"application/pdf"});
        const {error:uploadError}=await db.storage.from("lab-reports").upload(newPath,blob,{upsert:false,contentType:"application/pdf"});
        if(uploadError)throw new Error("批阅版 PDF 上传失败："+uploadError.message);
        update.storage_path=newPath;
        const original=(gradingRecord.file_name||"实验报告.pdf").replace(/\.pdf$/i,"");
        update.file_name=original+"_批阅版.pdf";
        update.review_annotations=gradingStrokes;
        update.submission_version=(gradingRecord.submission_version||1)+1;
      }catch(err){toast(err.message||"生成批阅版 PDF 失败。",true);return;}
    }
    const {error}=await db.from("report_submissions").update(update).eq("id",gradingRecord.id);
    if(error){
      if(newPath)await db.storage.from("lab-reports").remove([newPath]);
      toast("保存批阅失败："+error.message,true);return;
    }
    toast(hasAnnotations?"批阅结果与标注版 PDF 已同步发布，原始文件保留在版本历史中。":"批阅结果已保存。");
    closeGradingPreview();$("gradingPanel").classList.add("hidden");gradingRecord=null;
    await loadReviews();await loadReports();await loadOverview();
  }
  async function loadUsers(){
    $("usersBody").innerHTML='<tr><td colspan="5" class="muted center">正在加载……</td></tr>';
    const {data,error}=await db.from("profiles").select("*").order("created_at",{ascending:false}).limit(500);
    if(error){$("usersBody").innerHTML=`<tr><td colspan="5" class="center">${escapeHtml(error.message)}</td></tr>`;return;}
    $("usersBody").innerHTML=(data||[]).map(p=>`<tr><td>${p.role==="student"&&m.status==="active"?`<input class="user-check" type="checkbox" value="${p.id}">`:"—"}</td><td>${escapeHtml(p.full_name||"未填写")}</td><td>${escapeHtml(p.student_no||"—")}</td><td><span class="status-pill">${roleName(p.role)}</span></td><td>${new Date(p.created_at).toLocaleDateString("zh-CN")}</td><td><select class="profile-role-select" data-role-user="${p.id}"><option value="student" ${p.role==="student"?"selected":""}>学生</option><option value="teacher" ${p.role==="teacher"?"selected":""}>教师</option><option value="admin" ${p.role==="admin"?"selected":""}>管理员</option></select></td></tr>`).join("")||'<tr><td colspan="5" class="muted center">暂无用户。</td></tr>';
  }
  async function changeRole(id,role){
    if(!["student","teacher","admin"].includes(role))return;
    if(!confirm("确定将该账号身份调整为“"+roleName(role)+"”吗？此操作会立即改变其访问权限。")){loadUsers();return;}
    const {error}=await db.from("profiles").update({role}).eq("id",id);
    if(error){toast("身份调整失败："+error.message,true);loadUsers();return;}
    toast("用户身份已更新。");loadUsers();
  }

  async function loadClasses(){
    const {data,error}=await db.from("classes").select("id,name,course_code,description,teacher_id,join_code,is_active").order("created_at",{ascending:false});
    if(error){$("classList").textContent=error.message;return;}
    classesCache=data||[];
    const teacherLabel=$("newClassTeacher")?.closest("label");
    if(profile.role==="admin"&&$("newClassTeacher")){
      const {data:teacherRows}=await db.from("profiles").select("id,full_name,student_no,role").in("role",["teacher","admin"]).order("full_name");
      $("newClassTeacher").innerHTML=(teacherRows||[]).map(t=>'<option value="'+t.id+'">'+escapeHtml((t.full_name||"未命名")+" · "+(t.student_no||t.role))+'</option>').join("");
      if(!classEditingId)$("newClassTeacher").value=user.id;
      teacherLabel?.classList.remove("hidden");
    }else teacherLabel?.classList.add("hidden");
    let visible=classesCache;
    if(profile.role==="student"){
      const {data:members}=await db.from("class_members").select("class_id").eq("student_id",user.id).eq("status","active");
      const ids=new Set((members||[]).map(x=>x.class_id));
      visible=classesCache.filter(c=>ids.has(c.id)&&c.is_active);
    }
    const staff=["teacher","admin"].includes(profile.role);
    $("classList").innerHTML=visible.map(c=>`<article class="class-card ${c.is_active?"":"class-inactive"}">
      <strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.course_code||"课程班级")}</small>
      <p>${escapeHtml(c.description||"")}</p>
      ${staff?`<code>加入码：${escapeHtml(c.join_code||"—")}</code>
      <div class="class-card-actions"><button class="btn btn-outline btn-sm" data-class-edit="${c.id}">修改</button>
      <button class="btn btn-outline btn-sm" data-class-toggle="${c.id}">${c.is_active?"停用/归档":"重新启用"}</button></div>`: ""}
      ${!c.is_active?'<small class="muted">已停用，历史报告保留</small>':""}
    </article>`).join("")||'<p class="muted">当前没有班级。</p>';
    const active=visible.filter(c=>c.is_active);
    $("classTaskSelect").innerHTML=active.map(c=>'<option value="'+c.id+'">'+escapeHtml(c.name)+'</option>').join("");
    $("reportClass").innerHTML=active.map(c=>'<option value="'+c.id+'">'+escapeHtml(c.name)+'</option>').join("");
    if(!activeClassId||!active.some(c=>c.id===activeClassId))activeClassId=active[0]?.id||null;
    if(activeClassId)$("classTaskSelect").value=activeClassId;
    $("classManagerTools").classList.toggle("hidden",!staff);
    if($("classBulkDelete"))$("classBulkDelete").textContent=profile.role==="admin"?"批量永久删除学生账号":"批量删除/移出学生";
    if(!activeClassId){$("classAssignments").textContent="请先创建或加入有效班级。";$("classRosterBody").innerHTML='<tr><td colspan="5">暂无有效班级。</td></tr>';return;}
    await loadClassAssignments();
  }
  async function editClass(id){
    const row=classesCache.find(c=>c.id===id);if(!row)return;
    classEditingId=id;
    $("newClassName").value=row.name||"";
    $("newClassCode").value=row.course_code||"";
    $("newClassDesc").value=row.description||"";
    if(profile.role==="admin"&&$("newClassTeacher"))$("newClassTeacher").value=row.teacher_id;
    $("createClass").textContent="保存班级修改";
    $("newClassName").scrollIntoView({behavior:"smooth",block:"center"});
  }
  function clearClassForm(){
    classEditingId=null;
    ["newClassName","newClassCode","newClassDesc"].forEach(id=>$(id).value="");
    $("createClass").textContent="创建班级";
    if(profile.role==="admin"&&$("newClassTeacher"))$("newClassTeacher").value=user.id;
  }
  async function toggleClass(id){
    const row=classesCache.find(c=>c.id===id);if(!row)return;
    const next=!row.is_active;
    if(!confirm(next?"重新启用该班级？":"停用该班级？历史报告和成绩不会删除，学生将不能继续加入或提交新报告。"))return;
    const {error}=await db.from("classes").update({is_active:next}).eq("id",id);
    if(error){toast("班级状态更新失败："+error.message,true);return;}
    toast(next?"班级已重新启用。":"班级已停用并归档。");await loadClasses();
  }
  async function loadClassAssignments(){
    const classId=$("classTaskSelect").value||activeClassId;activeClassId=classId;
    if(!classId){$("classAssignments").textContent="请先创建或加入班级。";return;}
    const {data,error}=await db.from("experiment_assignments").select("id,title,instructions,due_at,is_open,experiment_catalog(name,slug)").eq("class_id",classId).order("created_at",{ascending:false});
    if(error){$("classAssignments").textContent=error.message;return;}
    $("classAssignments").innerHTML=(data||[]).map(a=>`<div class="assignment-row"><div><strong>${escapeHtml(a.title)}</strong><small>${escapeHtml(a.experiment_catalog?.name||"实验")} · ${a.due_at?new Date(a.due_at).toLocaleString("zh-CN"):"未设截止"}</small><p>${escapeHtml(a.instructions||"")}</p></div><span class="status-pill ${a.is_open?"graded":"draft"}">${a.is_open?"开放":"关闭"}</span><span class="assignment-actions"><button class="btn btn-outline btn-sm" data-assignment-edit="${a.id}">修改</button><button class="btn btn-outline btn-sm" data-assignment-toggle="${a.id}" data-open="${a.is_open}">${a.is_open?"关闭任务":"重新开放"}</button></span></div>`).join("")||"本班暂无实验任务。";
    await loadClassRoster(classId);
    $("reportAssignment").innerHTML=(data||[]).filter(a=>a.is_open).map(a=>`<option value="${a.id}" data-slug="${escapeHtml(a.experiment_catalog?.slug||"")}">${escapeHtml(a.title)}</option>`).join("");
    $("reportClass").value=classId;
  }
  async function editAssignment(id){
    const {data,error}=await db.from("experiment_assignments").select("id,title,instructions,due_at").eq("id",id).maybeSingle();
    if(error||!data){toast(error?.message||"未找到实验任务。",true);return;}
    const title=prompt("任务名称：",data.title);if(title===null)return;
    const instructions=prompt("任务要求：",data.instructions||"");if(instructions===null)return;
    const due=prompt("截止时间（ISO 时间，例如 2026-11-20T23:59:00Z；留空表示不限）：",data.due_at||"");if(due===null)return;
    const {error:updateError}=await db.from("experiment_assignments").update({title:title.trim(),instructions:instructions.trim(),due_at:due.trim()?new Date(due).toISOString():null}).eq("id",id);
    if(updateError){toast("任务修改失败："+updateError.message,true);return;}
    toast("实验任务已更新。");await loadClassAssignments();
  }
  async function toggleAssignment(id,isOpen){
    const {error}=await db.from("experiment_assignments").update({is_open:!isOpen}).eq("id",id);
    if(error){toast("任务状态修改失败："+error.message,true);return;}
    toast(isOpen?"任务已关闭。":"任务已重新开放。");await loadClassAssignments();
  }
  async function loadClassRoster(classId){
    const host=$("classRosterBody");if(!host)return;
    if(profile.role==="student"){host.innerHTML='<tr><td colspan="5">学生不可管理班级名单。</td></tr>';return;}
    const {data:members,error}=await db.from("class_members").select("student_id,status,joined_at").eq("class_id",classId).order("joined_at",{ascending:false});
    if(error){host.innerHTML='<tr><td colspan="5">'+escapeHtml(error.message)+'</td></tr>';return;}
    const ids=(members||[]).map(x=>x.student_id);
    const {data:people}=ids.length?await db.from("profiles").select("id,full_name,student_no,role").in("id",ids):{data:[]};
    const map=Object.fromEntries((people||[]).map(x=>[x.id,x]));
    host.innerHTML=(members||[]).map(m=>{const p=map[m.student_id]||{};return '<tr><td>'+(p.role==="student"?'<input class="class-user-check" type="checkbox" value="'+m.student_id+'">':"—")+'</td><td>'+escapeHtml(p.full_name||"未命名")+'</td><td>'+escapeHtml(p.student_no||"—")+'</td><td>'+escapeHtml(m.status)+'</td><td>'+new Date(m.joined_at).toLocaleDateString("zh-CN")+'</td></tr>';}).join("")||'<tr><td colspan="5">本班尚无学生。</td></tr>';
  }
  async function bulkClassAccountAction(action){
    const classId=$("classTaskSelect").value;
    const ids=Array.from(document.querySelectorAll(".class-user-check:checked")).map(x=>x.value);
    if(!classId||!ids.length){toast("请先选择班级并勾选学生。",true);return;}
    const message=action==="delete_students"?(profile.role==="admin"?"确认永久删除选中学生账号及其报告文件？":"教师操作规则：若学生仅属于当前班级，将永久删除账号；若还属于其他有效班级，则只从本班移出。确认继续？"):"为选中学生生成密码恢复链接？";
    if(!confirm(message))return;
    const results=[];
    for(const id of ids){
      const {data,error}=await db.functions.invoke("classroom-admin",{body:{action,user_id:id,user_ids:[id],class_id:classId}});
      if(error)results.push({id,ok:false,error:error.message});
      else if(action==="reset_password")results.push({id,ok:!!data?.action_link,email:data?.email,link:data?.action_link,error:data?.error});
      else results.push(...(data?.results||[]));
    }
    if(action==="reset_password"){
      $("accountActionResult").textContent=results.filter(x=>x.ok).map(x=>x.email+" "+x.link).join("\n")||"没有生成恢复链接。";
      toast("已生成 "+results.filter(x=>x.ok).length+"/"+ids.length+" 个恢复链接。");
    }else{
      const deleted=results.filter(x=>x.operation==="permanently_deleted").length,removed=results.filter(x=>x.operation==="removed_from_this_class").length;toast(profile.role==="admin"?"账号永久删除完成："+deleted+"/"+ids.length+" 个成功。":"教师操作完成：永久删除 "+deleted+" 个账号，移出本班 "+removed+" 人。");
      await loadClassRoster(classId);
    }
  }
  async function joinClass(){
    const code=$("joinClassCode").value.trim().toUpperCase();if(!code){toast("请输入教师提供的班级加入码。",true);return;}
    const {data,error}=await db.functions.invoke("classroom-admin",{body:{action:"join_class",join_code:code}});
    if(error||!data?.ok){toast(error?.message||data?.error||"加入班级失败",true);return;}
    activeClassId=data.class_id;toast("已成功加入班级。");loadClasses();
  }
  function parseRosterDelimitedLine(line,delimiter){
    const out=[];let value="",quoted=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;}
      else if(ch==='"')quoted=!quoted;
      else if(ch===delimiter&&!quoted){out.push(value.trim());value="";}
      else value+=ch;
    }
    out.push(value.trim());return out;
  }
  async function importClassRoster(){
    const classId=$("classTaskSelect").value,file=$("rosterFile").files[0];if(!classId||!file){toast("请选择班级和 CSV/XLSX 名单。",true);return;}
    let rows=[];
    try{
      if(/\.xlsx?$/i.test(file.name)){
        if(!window.XLSX)throw new Error("Excel 读取组件未加载，请改用 CSV 或刷新页面。");
        const workbook=XLSX.read(await file.arrayBuffer(),{type:"array"});
        const sheet=workbook.Sheets[workbook.SheetNames[0]];
        rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:""});
      }else{
        const raw=(await file.text()).replace(/^\uFEFF/,"");
        const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
        const first=lines[0]||"",delimiter=first.includes("\t")?"\t":first.includes(";")?";":first.includes("，")?"，":",";
        rows=lines.map(line=>parseRosterDelimitedLine(line,delimiter));
      }
      if(rows.length&&/(邮箱|email|账号)/i.test(String(rows[0][0]||""))&&/(姓名|name)/i.test(String(rows[0][1]||"")))rows.shift();
      const students=rows.map(row=>({email:String(row[0]??"").trim(),full_name:String(row[1]??"").trim(),student_no:String(row[2]??"").trim()})).filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)&&x.full_name);
      if(!students.length)throw new Error("没有识别到有效名单。列顺序应为：邮箱、姓名、学号（学号可空）。");
      const {data,error}=await db.functions.invoke("classroom-admin",{body:{action:"invite_students",class_id:classId,students}});
      if(error)throw error;
      const results=data?.results||[],ok=results.filter(x=>x.ok).length;
      $("accountActionResult").textContent=results.map(x=>(x.email||x.user_id||"")+(x.ok?"：成功":"："+(x.error||"失败"))).join("\n");
      toast("导入处理完成："+ok+"/"+students.length+" 个账号成功邀请。");$("rosterFile").value="";
    }catch(err){toast("名单导入失败："+(err.message||String(err)),true);}
  }
  async function loadExperimentCatalogManager(){
    const host=$("experimentCatalogAdminList");if(!host)return;
    const {data,error}=await db.from("experiment_catalog").select("id,slug,code,name,category,description,is_active").order("code");
    if(error){host.textContent=error.message;return;}
    host.innerHTML=(data||[]).map(x=>`<div class="catalog-admin-row"><div><strong>${escapeHtml(x.code)} · ${escapeHtml(x.name)}</strong><small>${escapeHtml(x.slug)} · ${escapeHtml(x.category||"其他")} · ${x.is_active?"启用":"已停用"}</small></div><div><button class="btn btn-outline btn-sm" data-catalog-edit="${x.id}">编辑</button><button class="btn btn-outline btn-sm" data-catalog-toggle="${x.id}" data-active="${x.is_active}">${x.is_active?"停用":"启用"}</button></div></div>`).join("")||"尚无实验项目。";
  }
  async function editCatalogItem(id){
    const {data,error}=await db.from("experiment_catalog").select("*").eq("id",id).maybeSingle();
    if(error||!data){toast(error?.message||"未找到实验项目。",true);return;}
    catalogEditingId=id;catalogOriginalSlug=data.slug||"";
    $("catalogSlug").value=data.slug||"";$("catalogCode").value=data.code||"";
    $("catalogName").value=data.name||"";$("catalogCategory").value=data.category||"";
    $("catalogDescription").value=data.description||"";
    $("saveCatalogItem").textContent="保存项目修改";
    $("catalogName").focus();
  }
  function clearCatalogForm(){
    catalogEditingId=null;catalogOriginalSlug=null;
    ["catalogSlug","catalogCode","catalogName","catalogCategory","catalogDescription"].forEach(id=>$(id).value="");
    $("saveCatalogItem").textContent="新增实验项目";
  }
  async function saveCatalogItem(){
    const name=$("catalogName").value.trim(),code=$("catalogCode").value.trim().toUpperCase();
    const slug=$("catalogSlug").value.trim().toLowerCase()||code.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    if(!name||!code||!slug){toast("项目名称、项目编号和唯一 slug 均为必填。",true);return;}
    if(catalogEditingId&&slug!==catalogOriginalSlug){toast("为避免破坏已绑定的专属计算流程，已有实验项目的 slug 不允许修改。",true);return;}
    const payload={slug,code,name,category:$("catalogCategory").value.trim()||"其他",description:$("catalogDescription").value.trim(),is_active:true,updated_by:user.id};
    let result;
    if(catalogEditingId) result=await db.from("experiment_catalog").update(payload).eq("id",catalogEditingId);
    else result=await db.from("experiment_catalog").insert({...payload,config:{workflow:"generic",schema_version:1},created_by:user.id});
    if(result.error){toast("实验项目保存失败："+result.error.message,true);return;}
    toast(catalogEditingId?"实验项目已更新。":"实验项目已创建。");clearCatalogForm();await renderCatalog();await loadClasses();
  }
  async function toggleCatalogItem(id,isActive){
    const {error}=await db.from("experiment_catalog").update({is_active:!isActive,updated_by:user.id}).eq("id",id);
    if(error){toast("项目状态更新失败："+error.message,true);return;}
    toast(isActive?"实验项目已停用，历史任务保留。":"实验项目已重新启用。");await renderCatalog();
  }
  async function createClass(){
    const name=$("newClassName").value.trim();if(!name){toast("请填写班级名称。",true);return;}
    const teacherId=profile.role==="admin"?($("newClassTeacher").value||user.id):user.id;
    const payload={name,course_code:$("newClassCode").value.trim(),description:$("newClassDesc").value.trim(),teacher_id:teacherId};
    const result=classEditingId
      ?await db.from("classes").update(payload).eq("id",classEditingId)
      :await db.from("classes").insert(payload);
    if(result.error){toast(result.error.message,true);return;}
    toast(classEditingId?"班级信息已更新。":"班级创建成功。");clearClassForm();await loadClasses();
  }
  async function publishAssignment(){
    const slug=$("taskExperiment").value,cls=$("classTaskSelect").value,exp=experiments.find(x=>x.slug===slug);
    const {data:catalog}=await db.from("experiment_catalog").select("id").eq("slug",slug).maybeSingle();
    if(!catalog||!cls)return;
    const {error}=await db.from("experiment_assignments").insert({class_id:cls,experiment_id:catalog.id,title:$("taskTitle").value.trim()||exp.name,instructions:$("taskInstructions").value.trim(),due_at:$("taskDue").value?new Date($("taskDue").value).toISOString():null,created_by:user.id});
    if(error){toast(error.message,true);return;}toast("任务已发布。");loadClassAssignments();
  }
  async function loadSystemAdmin(){
    const {data,error}=await db.from("audit_logs").select("action,details,created_at").order("created_at",{ascending:false}).limit(100);
    $("auditLogBody").innerHTML=error?escapeHtml(error.message):(data||[]).map(x=>`<tr><td>${new Date(x.created_at).toLocaleString("zh-CN")}</td><td>${escapeHtml(x.action)}</td><td>${escapeHtml(JSON.stringify(x.details||{}))}</td></tr>`).join("")||'<tr><td colspan="3">暂无审计记录</td></tr>';
  }
  async function bulkAccountAction(action){
    const ids=Array.from(document.querySelectorAll(".user-check:checked")).map(x=>x.value);
    if(!ids.length){toast("请先勾选学生账号。",true);return;}
    if(!confirm(action==="delete_students"?"确认批量删除选中的学生账号及报告文件？":"为选中学生生成密码恢复链接？"))return;
    if(action==="delete_students"){
      const result=await db.functions.invoke("classroom-admin",{body:{action,user_ids:ids}});
      if(result.error){toast(result.error.message,true);return;}
      const ok=(result.data?.results||[]).filter(x=>x.ok).length;toast("批量删除完成："+ok+"/"+ids.length+" 个成功。");loadUsers();
    }else{
      const links=[];for(const id of ids){const result=await db.functions.invoke("classroom-admin",{body:{action:"reset_password",user_id:id}});if(!result.error&&result.data?.action_link)links.push(result.data.email+" "+result.data.action_link);}
      $("accountActionResult").textContent=links.join("\n")||"没有生成恢复链接。";toast("已生成 "+links.length+" 个恢复链接，请安全转交学生。");
    }
  }
  async function runAdminConnectionCheck(){
    const out=$("adminConnectionDiagnostic");
    try{const r=await fetch(SUPABASE_URL+"/auth/v1/settings",{headers:{apikey:SUPABASE_PUBLISHABLE_KEY}});out.textContent=r.ok?"Auth 网关正常（HTTP "+r.status+"）；仍需单独检查 Storage 和 RLS。":"Auth 网关返回 HTTP "+r.status;}
    catch(e){out.textContent="检测失败："+e.message;}
  }
  async function openReportViewer(row){
    const {data,error}=await db.storage.from("lab-reports").download(row.storage_path);
    if(error){toast("文件读取失败："+error.message,true);return;}
    $("reportViewerTitle").textContent=row.file_name||"报告预览";
    $("reportViewerFrame").classList.add("hidden");$("reportViewerDocx").classList.add("hidden");
    if((row.file_name||"").toLowerCase().endsWith(".pdf")){
      $("reportViewerFrame").src=URL.createObjectURL(data);$("reportViewerFrame").classList.remove("hidden");
    }else if((row.file_name||"").toLowerCase().endsWith(".docx")){
      if(!window.mammoth){toast("Word 预览组件未加载。",true);return;}
      const result=await mammoth.convertToHtml({arrayBuffer:await data.arrayBuffer()});
      $("reportViewerDocx").innerHTML=result.value;$("reportViewerDocx").classList.remove("hidden");
    }else{toast("仅支持 PDF / DOCX 在线预览。",true);return;}
    $("reportViewerDialog").showModal();
  }

  async function handleAuthSubmit(e){
    e.preventDefault();if(!db){toast("Supabase 配置未加载，请检查 config.js。",true);return;}
    $("authSubmit").disabled=true;
    try{
      const email=$("email").value.trim(),password=$("password").value;
      if(authMode==="register"){
        const fullName=$("fullName").value.trim(),studentNo=$("studentNo").value.trim();
        if(!fullName){toast("请填写姓名。",true);return;}
        const {data,error}=await db.auth.signUp({email,password,options:{data:{full_name:fullName,student_no:studentNo}}});
        if(error)throw error;
        toast(data.session?"注册成功，正在进入平台。":"注册申请已提交，请先完成邮箱验证，再登录。");
        if(data.session){user=data.user;await enterApp();}else setAuthMode("login");
      }else{
        const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;
        user=data.user;await enterApp();
      }
    }catch(err){
      const message=err.message||"认证失败。";
      if(/invalid api key/i.test(message)){
        $("connectionDiagnostic").className="connection-diagnostic error";
        $("connectionDiagnostic").textContent="Supabase 已拒绝当前 API key。请点击“检测 Supabase 连接”；若仍是 401，请在同一项目 Settings → API Keys 复制名为 default 的 Publishable key，并核对 Project URL。不要使用 Secret key。";
      }
      toast(message,true);
    }
    finally{$("authSubmit").disabled=false;}
  }
  async function enterApp(){
    try{await loadProfile();showApp();updateUserChrome();renderCatalog();$("todayDate").textContent=new Date().toLocaleDateString("zh-CN",{year:"numeric",month:"long",day:"numeric",weekday:"long"});go("overview");}
    catch(err){showAuth();toast(err.message||"读取用户资料失败。",true);await db.auth.signOut();}
  }
  async function testSupabaseConnection(){
    const button=$("testConnection");
    const output=$("connectionDiagnostic");
    if(!SUPABASE_URL||!SUPABASE_PUBLISHABLE_KEY){
      output.className="connection-diagnostic error";
      output.textContent="config.js 中缺少 Project URL 或 Publishable key。";
      return;
    }
    button.disabled=true;button.textContent="正在检测…";
    output.className="connection-diagnostic";
    output.textContent="正在请求 Supabase Auth 公开设置接口；不会创建账号、发送邮件或读取学生数据。";
    try{
      const response=await fetch(SUPABASE_URL+"/auth/v1/settings",{
        method:"GET",
        headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Accept:"application/json"}
      });
      const payload=await response.json().catch(()=>null);
      if(response.ok){
        output.className="connection-diagnostic ok";
        output.textContent="连接成功：Supabase Auth 已响应，当前 Publishable key 已通过网关识别。下一步仍需执行数据库 SQL 迁移，再检查 profiles / RLS / Storage。";
      }else{
        const detail=payload?.msg||payload?.message||payload?.error_description||payload?.error||("HTTP "+response.status);
        output.className="connection-diagnostic error";
        if(response.status===401||/invalid api key/i.test(String(detail))){
          output.textContent="认证失败（HTTP "+response.status+"）：Supabase 没有识别这个 API key。到该项目 Settings → API Keys → Publishable and secret API keys，复制名为 default 的 Publishable key；同时核对 Project URL 来自同一个项目。不要复制 Secret key，也不要发给我。";
        }else if(response.status===404){
          output.textContent="接口返回 404：请核对 Project URL 是否为该项目的 https://项目引用.supabase.co，不能填 Dashboard 网页地址。详情："+detail;
        }else{
          output.textContent="Supabase 返回 HTTP "+response.status+"："+detail+"。请把此检测结果截图发来。";
        }
      }
    }catch(err){
      output.className="connection-diagnostic error";
      output.textContent="浏览器无法访问 Supabase Auth。请检查网络、浏览器扩展/代理或项目 URL。详情："+(err.message||String(err));
    }finally{
      button.disabled=false;button.textContent="重新检测 Supabase 连接";
    }
  }
  async function start(){
    $("connectionHint").textContent=db?"前端密钥格式通过检查；请检测 Supabase 连接。":"Supabase 配置缺失或 Publishable key 格式不正确。";
    if(!hasConfig||!window.supabase?.createClient){
      $("connectionHint").classList.add("error");$("authSubmit").disabled=true;
    }
    $("testConnection").addEventListener("click",testSupabaseConnection);
    if(!db)return;
    db.auth.onAuthStateChange((event,session)=>{
      if(event==="PASSWORD_RECOVERY"&&session){
        user=session.user;profile=null;showAuth();setAuthMode("recovery");
      }else if(!session){user=null;profile=null;showAuth();setAuthMode("login");}
    });
    const {data:{session}}=await db.auth.getSession();
    if(session){
      user=session.user;
      if(window.location.hash.includes("type=recovery")){showAuth();setAuthMode("recovery");}
      else await enterApp();
    }else showAuth();
  }
  function bindEvents(){
    $("authForm").addEventListener("submit",handleAuthSubmit);
    $("toggleAuth").addEventListener("click",()=>setAuthMode(authMode==="login"?"register":"login"));
    $("backToLogin").addEventListener("click",()=>setAuthMode("login"));
    $("saveNewPassword").addEventListener("click",async()=>{
      const password=$("newPassword").value;
      if(password.length<8){toast("新密码至少需要 8 位。",true);return;}
      const {error}=await db.auth.updateUser({password});
      if(error){toast(error.message,true);return;}
      $("newPassword").value="";
      toast("密码已更新，正在进入平台。");
      window.history.replaceState(null,"",window.location.pathname+window.location.search);
      await enterApp();
    });
    $("forgotPassword").addEventListener("click",async()=>{if(!db)return;const email=$("email").value.trim();if(!email){toast("请先输入注册邮箱。",true);return;}const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:window.location.href});if(error)toast(error.message,true);else toast("密码重置邮件已发送，请检查邮箱。");});
    $("signOut").addEventListener("click",async()=>{await db.auth.signOut();});
    $("mainNav").addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(b)go(b.dataset.page);});
    document.body.addEventListener("click",e=>{
      const goto=e.target.closest("[data-goto]");if(goto){if(goto.dataset.experiment)openExperiment(goto.dataset.experiment);else go(goto.dataset.goto);}
      const open=e.target.closest("[data-open-experiment]");if(open)openExperiment(open.dataset.openExperiment);
      const report=e.target.closest("[data-report-download]");if(report)downloadReport(report.dataset.reportDownload);
      const fb=e.target.closest("[data-report-feedback]");if(fb)showFeedback(fb.dataset.reportFeedback);
      const withdraw=e.target.closest("[data-report-withdraw]");if(withdraw)withdrawReport(withdraw.dataset.reportWithdraw);
      const edit=e.target.closest("[data-report-edit]");if(edit)editReport(edit.dataset.reportEdit);
      const del=e.target.closest("[data-report-delete]");if(del)deleteReport(del.dataset.reportDelete);
      const review=e.target.closest("[data-review-open]");if(review)openGrading(review.dataset.reviewOpen);
      const reviewDownload=e.target.closest("[data-review-download]");if(reviewDownload)downloadReviewFile(reviewDownload.dataset.reviewDownload);
      const classEdit=e.target.closest("[data-class-edit]");if(classEdit)editClass(classEdit.dataset.classEdit);
      const classToggle=e.target.closest("[data-class-toggle]");if(classToggle)toggleClass(classToggle.dataset.classToggle);
      const assignmentEdit=e.target.closest("[data-assignment-edit]");if(assignmentEdit)editAssignment(assignmentEdit.dataset.assignmentEdit);
      const assignmentToggle=e.target.closest("[data-assignment-toggle]");if(assignmentToggle)toggleAssignment(assignmentToggle.dataset.assignmentToggle,assignmentToggle.dataset.open==="true");
      const catalogEdit=e.target.closest("[data-catalog-edit]");if(catalogEdit)editCatalogItem(catalogEdit.dataset.catalogEdit);
      const catalogToggle=e.target.closest("[data-catalog-toggle]");if(catalogToggle)toggleCatalogItem(catalogToggle.dataset.catalogToggle,catalogToggle.dataset.active==="true");
    });
    $("backExperiments").addEventListener("click",()=>go("experiments"));
    $("runAnalysis").addEventListener("click",runAnalysis);
    $("runDedicatedAnalysis").addEventListener("click",runDedicatedAnalysis);
    $("clearFitSelection").addEventListener("click",clearDedicatedSelection);
    $("clearData").addEventListener("click",()=>{$("dataInput").value="";clearAnalysis();$("dataCount").textContent="等待输入数据";});
    $("dataFile").addEventListener("change",async e=>{const file=e.target.files[0];if(file)$("dataInput").value=await file.text();$("dataCount").textContent=file?file.name:"等待输入数据";});
    $("downloadCsv").addEventListener("click",downloadCsv);
    $("clearFitSelection")?.addEventListener("click",clearDedicatedSelection);
    $("downloadChart").addEventListener("click",()=>{const image=$("pythonPlotImage");if(image&&!image.classList.contains("hidden")&&image.src){const a=document.createElement("a");a.href=image.src;a.download=(currentExperiment?.slug||"analysis")+"-matplotlib.png";a.click();}else if(window.Plotly&&plotlyGraph){Plotly.downloadImage("analysisPlotly",{format:"png",filename:(currentExperiment?.slug||"analysis")+"-selection",width:1800,height:1200,scale:2});}else if(chart){const a=document.createElement("a");a.href=chart.toBase64Image("image/png",1);a.download=(currentExperiment?.slug||"analysis")+".png";a.click();}});
    $("saveRecord").addEventListener("click",saveRecord);
    $("newReport").addEventListener("click",()=>{$("reportUploadPanel").classList.remove("hidden");loadClasses();});
    $("closeReportPanel").addEventListener("click",()=>$("reportUploadPanel").classList.add("hidden"));
    $("reportFile").addEventListener("change",e=>$("reportFileName").textContent=e.target.files[0]?.name||"点击选择报告文件");
    $("submitReport").addEventListener("click",submitReport);
    $("refreshReviews").addEventListener("click",loadReviews);
    $("refreshUsers").addEventListener("click",loadUsers);
    $("bulkDeleteUsers").addEventListener("click",()=>bulkAccountAction("delete_students"));
    $("bulkResetUsers").addEventListener("click",()=>bulkAccountAction("reset_password"));
    $("closeGrading").addEventListener("click",()=>{$("gradingPanel").classList.add("hidden");closeGradingPreview();});
    $("closeGradingPreview").addEventListener("click",closeGradingPreview);
    $("classBulkReset").addEventListener("click",()=>bulkClassAccountAction("reset_password"));
    $("classBulkDelete").addEventListener("click",()=>bulkClassAccountAction("delete_students"));
    $("saveGrade").addEventListener("click",saveGrade);
    $("usersBody").addEventListener("change",e=>{const el=e.target.closest("[data-role-user]");if(el)changeRole(el.dataset.roleUser,el.value);});
    $("createClass").addEventListener("click",createClass);
    $("clearClassForm").addEventListener("click",clearClassForm);
    $("publishAssignment").addEventListener("click",publishAssignment);
    $("joinClass").addEventListener("click",joinClass);
    $("importRoster").addEventListener("click",importClassRoster);
    $("reportClass").addEventListener("change",()=>{$("classTaskSelect").value=$("reportClass").value;loadClassAssignments();});
    $("classTaskSelect").addEventListener("change",loadClassAssignments);
    $("adminTestConnection").addEventListener("click",runAdminConnectionCheck);
    $("saveCatalogItem").addEventListener("click",saveCatalogItem);
    $("clearCatalogForm").addEventListener("click",clearCatalogForm);
    $("undoPdfAnnotation").addEventListener("click",undoPdfAnnotation);
    $("clearPdfAnnotations").addEventListener("click",clearPdfAnnotations);
    $("closeReportViewer").addEventListener("click",()=>$("reportViewerDialog").close());
    $("closeFeedback").addEventListener("click",()=>$("feedbackDialog").close());
    $("profileButton").addEventListener("click",()=>toast((profile?.full_name||user?.email||"账户")+" · "+roleName(profile?.role)));
  }
  bindEvents();
  start();
})();