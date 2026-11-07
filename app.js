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
  let chart = null, latestAnalysis = null, gradingRecord = null, lastRecords = [], activeClassId = null, classesCache = [];
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
  function renderCatalog(){
    $("experimentCatalog").innerHTML=experiments.map(e=>`
      <article class="experiment-card">
        <div class="experiment-top"><span class="experiment-code">${e.code}</span><span class="experiment-type">${e.group}</span></div>
        <h3>${e.name}</h3><p>${e.desc}</p>
        <button data-open-experiment="${e.slug}">打开数据工作区　→</button>
      </article>`).join("");
    $("reportExperiment").innerHTML=experiments.map(e=>`<option value="${e.slug}">${e.name}</option>`).join("");
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
    latestAnalysis=null; if(chart){chart.destroy();chart=null;}
    $("analysisResult").classList.add("hidden"); $("chartPlaceholder").classList.remove("hidden");
    $("dataTableBody").innerHTML='<tr><td colspan="4" class="muted center">暂无数据</td></tr>';
    ["statN","statMean","statSd","statR2","statSse"].forEach(id=>$(id).textContent="—");
    $("downloadChart").disabled=true;$("downloadCsv").disabled=true;$("saveRecord").disabled=false;
    $("chartCaption").textContent="当前没有图表";
  }
  function formatNum(n){return Number.isFinite(n)?Number(n).toPrecision(5):"—";}
  function runAnalysis(){
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
    const record={owner_id:user.id,experiment_slug:currentExperiment?.slug||"custom",title:currentExperiment?.name||"数据分析",raw_data:{headers:latestAnalysis.seriesLabels,rows:latestAnalysis.rawRows},analysis:{model:latestAnalysis.model,coefficients:latestAnalysis.fit?.coefficients||null,r2:latestAnalysis.fit?.r2??null,sse:latestAnalysis.fit?.sse??null,mean:latestAnalysis.mean,sd:latestAnalysis.sd,x_label:latestAnalysis.xLabel,y_label:latestAnalysis.yLabel,x_unit:latestAnalysis.xUnit,y_unit:latestAnalysis.yUnit},engine_version:ENGINE_VERSION};
    const {error}=await db.from("experiment_records").insert(record);
    if(error){toast("保存失败："+error.message,true);return;}
    toast("分析记录已保存到个人空间。"); loadOverview();
  }
  function downloadCsv(){
    if(!latestAnalysis)return;
    const {points,fit,rawRows,seriesLabels}=latestAnalysis;
    const headers=[latestAnalysis.xLabel+" ("+latestAnalysis.xUnit+")",...seriesLabels,"residual (series 1)"];
    const rows=[headers,...rawRows.map((r,i)=>[...r,fit?fit.residuals[i]:""])];
    const csv="\\uFEFF"+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\\r\\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=(currentExperiment?.slug||"experiment-data")+".csv";a.click();URL.revokeObjectURL(a.href);
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
  function statusLabel(status){return ({draft:"草稿",submitted:"已提交",graded:"已批阅",returned:"退回修改"})[status]||status;}
  function statusClass(status){return status||"draft";}
  async function loadReports(){
    const body=$("reportsBody");body.innerHTML='<tr><td colspan="6" class="muted center">正在加载……</td></tr>';
    const {data,error}=await db.from("report_submissions").select("*").eq("student_id",user.id).order("created_at",{ascending:false});
    if(error){body.innerHTML=`<tr><td colspan="6" class="center">${escapeHtml(error.message)}</td></tr>`;return;}
    lastRecords=data||[];
    if(!lastRecords.length){body.innerHTML='<tr><td colspan="6" class="muted center">暂无报告记录，点击右上角提交第一份实验报告。</td></tr>';return;}
    body.innerHTML=lastRecords.map(r=>`<tr><td>${escapeHtml(experimentName(r.experiment_slug))}</td><td>${escapeHtml(r.file_name||"报告文件")}</td><td>${new Date(r.created_at).toLocaleDateString("zh-CN")}</td><td><span class="status-pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></td><td>${r.score??"—"}</td><td><button class="action-link" data-report-download="${r.id}">下载</button> <button class="action-link" data-report-feedback="${r.id}">反馈</button></td></tr>`).join("");
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
  async function showFeedback(id){
    const row=lastRecords.find(r=>r.id===id);if(!row)return;
    $("feedbackContent").textContent=row.feedback||"该报告暂时没有教师反馈。";
    $("feedbackDialog").showModal();
  }
  let reviewRows=[];
  async function loadReviews(){
    $("reviewBody").innerHTML='<tr><td colspan="5" class="muted center">正在加载……</td></tr>';
    const {data,error}=await db.from("report_submissions").select("*").order("created_at",{ascending:false}).limit(200);
    if(error){$("reviewBody").innerHTML=`<tr><td colspan="5" class="center">${escapeHtml(error.message)}</td></tr>`;return;}
    reviewRows=data||[];
    const ids=[...new Set(reviewRows.map(r=>r.student_id))];
    let profiles={};
    if(ids.length){const result=await db.from("profiles").select("id,full_name,student_no").in("id",ids);(result.data||[]).forEach(p=>profiles[p.id]=p);}
    $("reviewBody").innerHTML=reviewRows.length?reviewRows.map(r=>{
      const p=profiles[r.student_id]||{};
      return `<tr><td>${escapeHtml(p.full_name||"学生")}<small class="block muted">${escapeHtml(p.student_no||"")}</small></td><td>${escapeHtml(experimentName(r.experiment_slug))}</td><td>${new Date(r.created_at).toLocaleString("zh-CN")}</td><td><span class="status-pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></td><td><button class="action-link" data-review-open="${r.id}">批阅</button> <button class="action-link" data-review-download="${r.id}">查看文件</button></td></tr>`;
    }).join(""):'<tr><td colspan="5" class="muted center">暂无报告提交。</td></tr>';
  }
  async function openGrading(id){
    gradingRecord=reviewRows.find(r=>r.id===id);if(!gradingRecord)return;
    $("gradingTitle").textContent=experimentName(gradingRecord.experiment_slug)+" · "+(gradingRecord.file_name||"报告");
    $("gradeScore").value=gradingRecord.score??"";$("gradeStatus").value=gradingRecord.status==="returned"?"returned":"graded";$("gradeFeedback").value=gradingRecord.feedback||"";
    $("gradingPanel").classList.remove("hidden");$("gradingPanel").scrollIntoView({behavior:"smooth",block:"center"});
  }
  async function downloadReviewFile(id){const row=reviewRows.find(r=>r.id===id);if(row)await openReportViewer(row);}
  async function saveGrade(){
    if(!gradingRecord)return;
    const score=$("gradeScore").value===""?null:Number($("gradeScore").value);
    if(score!==null&&(score<0||score>100||!Number.isFinite(score))){toast("成绩必须在 0–100 之间。",true);return;}
    const {error}=await db.from("report_submissions").update({score,feedback:$("gradeFeedback").value.trim(),status:$("gradeStatus").value,reviewed_by:user.id,reviewed_at:new Date().toISOString()}).eq("id",gradingRecord.id);
    if(error){toast("保存批阅失败："+error.message,true);return;}
    toast("批阅结果已保存。");$("gradingPanel").classList.add("hidden");gradingRecord=null;loadReviews();
  }
  async function loadUsers(){
    $("usersBody").innerHTML='<tr><td colspan="5" class="muted center">正在加载……</td></tr>';
    const {data,error}=await db.from("profiles").select("*").order("created_at",{ascending:false}).limit(500);
    if(error){$("usersBody").innerHTML=`<tr><td colspan="5" class="center">${escapeHtml(error.message)}</td></tr>`;return;}
    $("usersBody").innerHTML=(data||[]).map(p=>`<tr><td>${p.role==="student"?`<input class="user-check" type="checkbox" value="${p.id}">`:"—"}</td><td>${escapeHtml(p.full_name||"未填写")}</td><td>${escapeHtml(p.student_no||"—")}</td><td><span class="status-pill">${roleName(p.role)}</span></td><td>${new Date(p.created_at).toLocaleDateString("zh-CN")}</td><td><select class="profile-role-select" data-role-user="${p.id}"><option value="student" ${p.role==="student"?"selected":""}>学生</option><option value="teacher" ${p.role==="teacher"?"selected":""}>教师</option><option value="admin" ${p.role==="admin"?"selected":""}>管理员</option></select></td></tr>`).join("")||'<tr><td colspan="5" class="muted center">暂无用户。</td></tr>';
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
    let visible=classesCache;
    if(profile.role==="student"){
      const {data:members}=await db.from("class_members").select("class_id").eq("student_id",user.id).eq("status","active");
      const ids=new Set((members||[]).map(x=>x.class_id));visible=classesCache.filter(c=>ids.has(c.id));
    }
    $("classList").innerHTML=visible.map(c=>`<article class="class-card"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.course_code||"课程班级")}</small><p>${escapeHtml(c.description||"")}</p>${profile.role!=="student"?`<code>加入码：${escapeHtml(c.join_code)}</code>`:""}</article>`).join("")||'<p class="muted">当前没有班级。</p>';
    $("classTaskSelect").innerHTML=visible.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    $("reportClass").innerHTML=visible.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    if(!activeClassId&&visible.length)activeClassId=visible[0].id;
    if(activeClassId)$("classTaskSelect").value=activeClassId;
    $("classManagerTools").classList.toggle("hidden",profile.role==="student");
    await loadClassAssignments();
  }
  async function loadClassAssignments(){
    const classId=$("classTaskSelect").value||activeClassId;activeClassId=classId;
    if(!classId){$("classAssignments").textContent="请先创建或加入班级。";return;}
    const {data,error}=await db.from("experiment_assignments").select("id,title,instructions,due_at,is_open,experiment_catalog(name,slug)").eq("class_id",classId).order("created_at",{ascending:false});
    if(error){$("classAssignments").textContent=error.message;return;}
    $("classAssignments").innerHTML=(data||[]).map(a=>`<div class="assignment-row"><div><strong>${escapeHtml(a.title)}</strong><small>${escapeHtml(a.experiment_catalog?.name||"实验")} · ${a.due_at?new Date(a.due_at).toLocaleString("zh-CN"):"未设截止"}</small><p>${escapeHtml(a.instructions||"")}</p></div><span class="status-pill ${a.is_open?"graded":"draft"}">${a.is_open?"开放":"关闭"}</span></div>`).join("")||"本班暂无实验任务。";
    $("reportAssignment").innerHTML=(data||[]).filter(a=>a.is_open).map(a=>`<option value="${a.id}" data-slug="${escapeHtml(a.experiment_catalog?.slug||"")}">${escapeHtml(a.title)}</option>`).join("");
    $("reportClass").value=classId;
  }
  async function joinClass(){
    const code=$("joinClassCode").value.trim().toUpperCase();if(!code){toast("请输入教师提供的班级加入码。",true);return;}
    const {data,error}=await db.functions.invoke("classroom-admin",{body:{action:"join_class",join_code:code}});
    if(error||!data?.ok){toast(error?.message||data?.error||"加入班级失败",true);return;}
    activeClassId=data.class_id;toast("已成功加入班级。");loadClasses();
  }
  async function importClassRoster(){
    const classId=$("classTaskSelect").value,file=$("rosterFile").files[0];if(!classId||!file){toast("请选择班级和 CSV 名单。",true);return;}
    const lines=(await file.text()).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const students=lines.map(line=>{const p=line.split(/[,，\t;]/).map(x=>x.trim());return {email:p[0],full_name:p[1],student_no:p[2]||""};}).filter(x=>x.email&&x.full_name);
    const {data,error}=await db.functions.invoke("classroom-admin",{body:{action:"invite_students",class_id:classId,students}});
    if(error){toast("名单导入失败："+error.message,true);return;}
    const ok=(data?.results||[]).filter(x=>x.ok).length;toast("导入处理完成："+ok+"/"+students.length+" 个账号成功邀请。");$("rosterFile").value="";
  }
  async function createClass(){
    const name=$("newClassName").value.trim();if(!name){toast("请填写班级名称。",true);return;}
    const {error}=await db.from("classes").insert({name,course_code:$("newClassCode").value.trim(),description:$("newClassDesc").value.trim(),teacher_id:user.id});
    if(error){toast(error.message,true);return;}toast("班级创建成功。");loadClasses();
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
      const review=e.target.closest("[data-review-open]");if(review)openGrading(review.dataset.reviewOpen);
      const reviewDownload=e.target.closest("[data-review-download]");if(reviewDownload)downloadReviewFile(reviewDownload.dataset.reviewDownload);
    });
    $("backExperiments").addEventListener("click",()=>go("experiments"));
    $("runAnalysis").addEventListener("click",runAnalysis);
    $("clearData").addEventListener("click",()=>{$("dataInput").value="";clearAnalysis();$("dataCount").textContent="等待输入数据";});
    $("dataFile").addEventListener("change",async e=>{const file=e.target.files[0];if(file)$("dataInput").value=await file.text();$("dataCount").textContent=file?file.name:"等待输入数据";});
    $("downloadCsv").addEventListener("click",downloadCsv);
    $("downloadChart").addEventListener("click",()=>{if(chart){const a=document.createElement("a");a.href=chart.toBase64Image("image/png",1);a.download=(currentExperiment?.slug||"analysis")+".png";a.click();}});
    $("saveRecord").addEventListener("click",saveRecord);
    $("newReport").addEventListener("click",()=>{$("reportUploadPanel").classList.remove("hidden");loadClasses();});
    $("closeReportPanel").addEventListener("click",()=>$("reportUploadPanel").classList.add("hidden"));
    $("reportFile").addEventListener("change",e=>$("reportFileName").textContent=e.target.files[0]?.name||"点击选择报告文件");
    $("submitReport").addEventListener("click",submitReport);
    $("refreshReviews").addEventListener("click",loadReviews);
    $("refreshUsers").addEventListener("click",loadUsers);
    $("bulkDeleteUsers").addEventListener("click",()=>bulkAccountAction("delete_students"));
    $("bulkResetUsers").addEventListener("click",()=>bulkAccountAction("reset_password"));
    $("closeGrading").addEventListener("click",()=>$("gradingPanel").classList.add("hidden"));
    $("saveGrade").addEventListener("click",saveGrade);
    $("usersBody").addEventListener("change",e=>{const el=e.target.closest("[data-role-user]");if(el)changeRole(el.dataset.roleUser,el.value);});
    $("createClass").addEventListener("click",createClass);
    $("publishAssignment").addEventListener("click",publishAssignment);
    $("joinClass").addEventListener("click",joinClass);
    $("importRoster").addEventListener("click",importClassRoster);
    $("reportClass").addEventListener("change",()=>{$("classTaskSelect").value=$("reportClass").value;loadClassAssignments();});
    $("classTaskSelect").addEventListener("change",loadClassAssignments);
    $("adminTestConnection").addEventListener("click",runAdminConnectionCheck);
    $("closeReportViewer").addEventListener("click",()=>$("reportViewerDialog").close());
    $("closeFeedback").addEventListener("click",()=>$("feedbackDialog").close());
    $("profileButton").addEventListener("click",()=>toast((profile?.full_name||user?.email||"账户")+" · "+roleName(profile?.role)));
  }
  bindEvents();
  start();
})();