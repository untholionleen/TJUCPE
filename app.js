/* TJUCPE client application — no privileged keys or student files are stored in the repository. */
(() => {
  "use strict";
  const CONFIG = window.TJUCPE_CONFIG || {};
  const SUPABASE_URL = String(CONFIG.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const SUPABASE_PUBLISHABLE_KEY = String(CONFIG.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const hasConfig = !!(SUPABASE_URL && /^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_PUBLISHABLE_KEY));
  const supabaseFetch = async (input, init={}) => {
    const controller=new AbortController(),originalSignal=init?.signal||input?.signal;
    const requestUrl=typeof input==="string"?input:String(input?.url||"");
    const isStorageRequest=/\/storage\/v1\//i.test(requestUrl);
    const isFunctionRequest=/\/functions\/v1\//i.test(requestUrl);
    const isAuthRequest=/\/auth\/v1\//i.test(requestUrl);
    // File transfers and server-side class exports need more time than ordinary table queries.
    const timeoutMs=isStorageRequest?60000:isFunctionRequest?45000:isAuthRequest?30000:15000;
    const timeoutSeconds=Math.round(timeoutMs/1000);
    const relayAbort=()=>controller.abort(originalSignal?.reason);
    if(originalSignal){if(originalSignal.aborted)controller.abort(originalSignal.reason);else originalSignal.addEventListener("abort",relayAbort,{once:true});}
    const timer=window.setTimeout(()=>controller.abort(new DOMException("Supabase request timeout","TimeoutError")),timeoutMs);
    try{return await window.fetch(input,{...init,signal:controller.signal});}
    catch(err){if(controller.signal.aborted&&!originalSignal?.aborted)throw new Error("连接 Supabase 超时（"+timeoutSeconds+" 秒仍未响应）。请检查网络、稍后重试；不要连续重复提交。");throw err;}
    finally{window.clearTimeout(timer);if(originalSignal)originalSignal.removeEventListener("abort",relayAbort);}
  };
  const db = hasConfig && window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {global:{fetch:supabaseFetch},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce"}})
    : null;
  const externalLibraryLoads = new Map();
  function ensureExternalLibrary(globalName, urls) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (externalLibraryLoads.has(globalName)) return externalLibraryLoads.get(globalName);
    const promise = (async () => {
      let lastError = null;
      for (const url of urls) {
        try {
          await new Promise((resolve,reject) => {
            const script=document.createElement("script");script.src=url;script.async=true;
            const timer=window.setTimeout(()=>{script.remove();reject(new Error("组件加载超时："+globalName));},6500);
            script.onload=()=>{window.clearTimeout(timer);if(window[globalName])resolve();else reject(new Error("组件未能正确初始化："+globalName));};
            script.onerror=()=>{window.clearTimeout(timer);script.remove();reject(new Error("组件加载失败："+globalName));};
            document.head.appendChild(script);
          });
          if(window[globalName])return window[globalName];
        } catch(err) { lastError=err; }
      }
      throw lastError || new Error("组件 "+globalName+" 加载失败。");
    })().catch(err=>{externalLibraryLoads.delete(globalName);throw err;});
    externalLibraryLoads.set(globalName,promise);return promise;
  }
  const ENGINE_VERSION = "tjucpe-webcalc-1.0.0";
  const APP_REDIRECT_URL = "https://untholionleen.github.io/TJUCPE/";
  const INITIAL_CLASS_JOIN_CODE = (new URLSearchParams(window.location.search).get("join") || "").trim().toUpperCase();
  let initialJoinCodeApplied = false;
  let qrLibraryPromise = null;
  const emailSendTimes=new Map();
  function emailCooldownRemaining(email){
    const key=String(email||"").trim().toLowerCase();
    if(!key)return 0;
    return Math.max(0,60000-(Date.now()-(emailSendTimes.get(key)||0)));
  }
  function markEmailSent(email){
    const key=String(email||"").trim().toLowerCase();
    if(key)emailSendTimes.set(key,Date.now());
  }
  function assertEmailCooldown(email){
    const ms=emailCooldownRemaining(email);
    if(ms>0)throw new Error("刚刚已向该邮箱发送邮件，请等待约 "+Math.ceil(ms/1000)+" 秒后再试。");
  }

  let recoveryCompletionRunning = false;
  let pendingEmailToken = null;
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
  let chart = null, latestAnalysis = null, gradingRecord = null, lastRecords = [], activeClassId = null, activeAssignmentId = null, classesCache = [], selectedFitIndices = [], dedicatedResult = null, dedicatedTables = {}, plotlyGraph = null;
  let gradingPdfBlob = null, gradingStrokes = {}, gradingTextAnnotations = {}, gradingAnnotationSourcePath = null, gradingAnnotationSourceFileName = null, pdfAnnotationMode = "draw";
  let gradingStudentSheets = [], gradingReferenceSets = [], catalogRowsCache = [], pendingClassDelete = null;
  const pageMap = {overview:"工作台",experiments:"实验与数据分析",analysis:"实验数据分析",reports:"我的实验报告",review:"报告批阅",users:"用户与权限",classes:"班级与任务",system:"系统管理"};
  function friendlyError(input){
    const raw=typeof input==="string"?input:(input?.message||String(input??""));
    const code=String(input?.code||input?.status||"");
    const rules=[
      [/unauthorized_invalid_api_key|invalid api key|invalid.*publishable key/i,"Supabase 项目密钥未被识别。请核对 config.js 中的 Project URL 和 Publishable key 是否来自同一个项目。"],
      [/invalid login credentials|invalid_credentials/i,"邮箱或密码不正确，请检查后重试。"],
      [/one-time token not found|token has expired or is invalid|email link is invalid or has expired/i,"邮箱验证链接已经被邮件安全扫描程序打开、已经使用或已过期。请回到平台重新发送验证邮件，然后只点击最新的一封。"],
      [/over_email_send_rate_limit|security purposes.*request this after/i,"邮件发送过于频繁。请等待页面提示的时间后再试，不要连续点击发送。"],
      [/refresh_token_not_found|invalid refresh token/i,"登录状态已过期或在其他标签页更新。请重新登录；不会影响已保存的实验和报告数据。"],
      [/email.*already|user already registered/i,"这个邮箱已经注册，请直接登录或使用密码重置。"],
      [/invalid.*redirect|redirect.*(mismatch|not allowed)/i,"邮件跳转地址不在 Supabase 允许列表中。请管理员检查 Site URL 和 Redirect URLs。"],

      [/email address.*not authorized|email.*not allowed/i,"当前邮箱不允许注册或接收邮件，请联系平台管理员检查邮件服务设置。"],
      [/user.*(banned|disabled)|this account is disabled/i,"该账号已被管理员停用，请联系管理员恢复。"],
      [/email.*(already|exists)|user already registered/i,"该邮箱已经注册，请直接登录或使用密码重置。"],
      [/signup is disabled|signups not allowed/i,"平台暂未开放自主注册，请联系管理员创建账号。"],
      [/provider is not enabled|email provider is disabled/i,"平台邮箱登录服务尚未启用，请联系管理员检查 Supabase Auth 设置。"],
      [/email not confirmed|email_not_confirmed/i,"邮箱尚未验证，请先完成邮箱验证。"],
      [/user already registered|already registered/i,"该邮箱已经注册，请直接登录或使用密码重置。"],
      [/password should be at least|password.*minimum/i,"密码长度不足，请至少输入 10 位。"],
      [/weak password|password.*too weak/i,"密码强度不足，请使用更长且包含不同类型字符的密码。"],
      [/same password|new password should be different/i,"新密码不能与当前密码相同。"],
      [/token.*(expired|invalid)|otp.*(expired|invalid)|flow state not found/i,"邮箱验证链接已失效或已使用，请重新发送验证邮件。"],
      [/invalid api key|unauthorized.*api key/i,"Supabase 项目密钥无效。请核对当前项目的 Publishable key 和 Project URL。"],
      [/row.level security|rls|permission denied|not allowed/i,"当前账号没有执行此操作的权限，请联系教师或管理员。"],
      [/duplicate key|already exists/i,"该记录已经存在，请勿重复添加。"],
      [/failed to fetch|networkerror|load failed|fetch failed/i,"网络连接失败或 Supabase 暂时没有响应，请检查网络后重试。"],
      [/functionsfetcherror|failed to send a request to the edge function|edge function.*unavailable/i,"教学服务接口暂时没有响应，请稍后重试；如果持续失败，请联系管理员检查 classroom-admin 函数。"],
      [/functionshttperror|edge function returned a non-2xx status/i,"教学服务接口处理失败，请查看下方中文提示或联系管理员。"],
      [/email.*rate.limit|over_email_send_rate_limit/i,"邮件发送过于频繁，请稍后再试。"],
      [/database.*connection|could not connect to server|connection refused/i,"数据库连接暂时不可用，请稍后重试。"],
      [/timeout|timed out|aborterror/i,"请求超时。平台暂时没有收到 Supabase 响应，请稍后重试。"],
      [/invalid.*redirect|redirect.*(mismatch|not allowed)/i,"邮箱跳转地址与平台允许的地址不一致。请联系管理员检查 Supabase 的 Site URL 和 Redirect URLs。"],
      [/email.*smtp|smtp.*(error|not configured)/i,"邮件服务暂时不可用，请联系管理员检查 SMTP 邮件配置。"],
      [/duplicate.*email|email.*duplicate/i,"该邮箱已存在，请勿重复创建账号。"],
      [/missing.*authorization|authorization header/i,"登录凭证缺失或已过期，请退出后重新登录。"],
      [/cors|preflight/i,"浏览器跨域连接失败，请联系管理员检查平台接口配置。"],
      [/payload too large|file too large/i,"文件过大，请压缩文件后重新上传。"],
      [/rate limit|too many requests|over_email_send_rate_limit/i,"操作过于频繁，请稍后再试。"],
      [/not found/i,"没有找到对应记录，可能已被删除或权限已变化。"],
      [/email.*invalid|invalid email/i,"邮箱地址格式不正确，请检查后重试。"],
      [/violates foreign key constraint|foreign key violation/i,"该记录仍被其他数据引用，暂时不能删除或修改。请先处理关联的班级任务或报告。"],
      [/invalid input syntax for type uuid/i,"提交的数据编号格式不正确，请刷新页面后重新选择对应项目。"],
      [/column .* does not exist|relation .* does not exist/i,"平台数据库结构与当前页面版本不一致，请联系管理员检查数据库迁移。"],
      [/jwt expired|session.*expired/i,"登录凭证已过期，请重新登录后继续操作。"],
      [/user not found|account not found/i,"没有找到该账号，请刷新账号列表后重试。"],
      [/email rate limit exceeded/i,"邮件发送次数已达到限制，请稍后再试。"],
      [/redirect.*not allowed|url not allowed|redirect url.*allow/i,"邮箱跳转地址尚未加入 Supabase 允许列表。管理员需在 Authentication → URL Configuration 中添加网站地址。"],
      [/administrator required/i,"此操作仅允许管理员执行。"],
      [/teacher or administrator required/i,"此操作仅允许教师或管理员执行。"],
      [/you do not manage this class/i,"您没有管理该班级的权限，请检查班级负责人设置。"],
      [/teachers can reset only students in their own class/i,"教师只能为自己负责班级中的学生重置密码。"],
      [/student\/teacher account not found|account not found/i,"未找到对应账号，请刷新账号列表后重试。"],
      [/no user ids supplied/i,"尚未选择任何账号，请先勾选需要操作的用户。"],
      [/only student accounts can be deleted/i,"该操作只允许删除学生账号，教师和管理员账号不会被删除。"],
      [/assignment not found/i,"未找到对应实验任务，可能已被关闭或删除，请刷新任务列表。"],
      [/class not found/i,"未找到对应班级，请刷新班级列表后重试。"],
      [/report not found/i,"未找到对应报告，可能已被删除或已更新。"],
      [/email rate limit|over_email_send_rate_limit/i,"邮件发送过于频繁，请等待一段时间后再试。"],
      [/email link.*(expired|invalid)|otp.*(expired|invalid)|token.*(expired|invalid)/i,"邮箱验证链接已失效或已使用，请重新发送验证邮件，并尽量在收到后及时打开。"],
      [/maximum.*(file|upload)|file size.*limit/i,"文件超过平台允许的大小，请压缩文件后重新上传。"]
    ];
    for(const [pattern,translated] of rules)if(pattern.test(raw))return translated;
    if(code==="23505")return "该记录已经存在，请勿重复添加。";
    if(code==="23503")return "该记录仍被其他数据引用，不能直接删除。请先处理关联任务、报告或班级成员。";
    if(code==="23502")return "有必填字段未填写，请检查表单后重试。";
    if(code==="42501")return "当前账号没有执行此操作的权限，请联系管理员。";
    if(code==="22P02")return "输入的数据格式不正确，请检查编号、数字或日期字段。";
    if(code==="PGRST116")return "没有找到对应记录，可能已被删除或权限已变化。";
    if(code==="401")return "登录状态已过期或身份验证失败，请重新登录。";
    if(code==="403")return "当前账号无权执行此操作，请联系管理员。";
    if(code==="404")return "请求的资源不存在，请刷新页面后重试。";
    if(code==="409")return "当前数据状态已发生变化，请刷新后再操作。";
    if(code==="429")return "请求过于频繁，请稍后重试。";
    if(code.startsWith("5"))return "Supabase 服务暂时异常，请稍后重试。";
    if(raw&&/[\u4e00-\u9fff]/.test(raw))return raw;
    return "操作未完成，平台返回了暂时无法识别的错误。请刷新页面后重试；若问题持续，请联系管理员查看系统日志。";
  }
  async function invokePlatformFunction(name, options={}){
    const result=await db.functions.invoke(name,options);
    if(!result.error)return result;
    let payload=null;
    try{
      const context=result.error.context;
      if(context&&typeof context.clone==="function")payload=await context.clone().json();
      else if(context&&typeof context.json==="function")payload=await context.json();
    }catch(_){}
    const detail=payload?.error||payload?.message||payload?.msg||result.error.message;
    const normalized=new Error(friendlyError(detail));
    normalized.code=payload?.code||result.error.code||"";
    normalized.status=result.error.context?.status||result.error.status||"";
    normalized.details=payload?.details||result.error.details||"";
    normalized.originalError=result.error;
    return {data:result.data||payload,error:normalized};
  }
  const toast = (message, error=false) => {
    const el=$("toast"); el.textContent=friendlyError(message); el.classList.toggle("error",error); el.classList.add("show");
    clearTimeout(toast._timer); toast._timer=setTimeout(()=>el.classList.remove("show"),4200);
  };
  const showAuth = () => { $("authView").classList.remove("hidden"); $("appView").classList.add("hidden"); };
  const showApp = () => { $("authView").classList.add("hidden"); $("appView").classList.remove("hidden"); };
  function setAuthMode(mode) {
    authMode=mode;
    const register=mode==="register", recovery=mode==="recovery", forced=mode==="forced-change";
    const confirming=mode==="confirm-email", resetForm=recovery||forced;
    $("authTitle").textContent=confirming?"确认邮箱验证":forced?"设置个人登录密码":recovery?"确认密码重置":register?"创建学生账号":"登录平台";
    $("authSubtitle").textContent=confirming
      ?"邮件链接已打开。为避免邮件安全扫描提前使用一次性令牌，请确认后再继续。"
      :forced?"邮箱已验证，请设置仅本人知道的新密码。"
      :recovery?"邮箱验证已通过，请在下方设置新的个人密码。"
      :register?"注册后系统会自动创建普通学生身份。":"使用课程账号进入实验工作区。";
    $("registerFields").classList.toggle("hidden",!register);
    $("authForm").classList.toggle("hidden",resetForm||confirming);
    $("resetPanel").classList.toggle("hidden",!resetForm);
    $("emailConfirmPanel").classList.toggle("hidden",!confirming);
    $("authLinks").classList.toggle("hidden",resetForm||confirming);
    $("authSubmit").textContent=register?"注册并创建账号":"登录";
    $("toggleAuth").textContent=register?"已有账号？返回登录":"还没有账号？立即注册";
    $("password").autocomplete=register?"new-password":"current-password";
    $("newPassword").autocomplete="new-password";
    $("saveNewPassword").textContent=forced?"保存个人密码并进入平台":"确认并保存";
    if(confirming){
      const type=pendingEmailToken?.type;
      $("emailConfirmMessage").textContent=type==="recovery"
        ?"您正在重置账号密码。确认邮箱后，系统会让您自己设置新的个人密码。"
        :type==="invite"
          ?"您正在接受平台账号邀请。确认邮箱后，需要设置自己的首次登录密码。"
          :"确认该邮箱地址后，系统会完成注册验证并进入平台。";
      $("confirmEmailToken").textContent=type==="recovery"?"验证邮箱并重置密码":type==="invite"?"接受邀请并设置密码":"确认邮箱并继续";
    }
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
    document.querySelectorAll(".student-only").forEach(el=>el.classList.toggle("hidden",isStaff));
    document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",profile?.role!=="admin"));
    $("overviewStudentPanel")?.classList.toggle("hidden",isStaff);
    $("overviewStaffPanel")?.classList.toggle("hidden",!isStaff);
    $("overviewEyebrow").textContent=isStaff?"TEACHING MANAGEMENT":"YOUR LAB SPACE";
    $("overviewTitle").textContent=isStaff?"教学管理工作台":"早上好，";
    if(!isStaff)$("overviewTitle").innerHTML="早上好，<span id=\"welcomeName\">"+escapeHtml(name)+"</span>";
    $("overviewSubtitle").textContent=isStaff?"管理教学班、在线 Excel 模板、数据分析与报告批阅。":"下载实验模板、填写 Excel 数据，并同步提交实验报告。";
  }
  function go(page){
    const allowed=["overview","experiments","analysis","reports","review","users","classes","system"];
    if(!allowed.includes(page)) page="overview";
    if((page==="experiments"||page==="analysis")&&![ "teacher","admin" ].includes(profile?.role)) page="overview";
    if(page==="reports"&&["teacher","admin"].includes(profile?.role)) page="overview";
    if(page==="review"&&!["teacher","admin"].includes(profile?.role)) page="overview";
    if(page==="users"&&profile?.role!=="admin") page="overview";
    if(page==="system"&&profile?.role!=="admin") page="overview";
    document.querySelectorAll(".page").forEach(el=>el.classList.add("hidden"));
    const target=$(page+"Page"); if(target) target.classList.remove("hidden");
    document.querySelectorAll(".nav-item[data-page]").forEach(el=>el.classList.toggle("active",el.dataset.page===page||(page==="analysis"&&el.dataset.page==="experiments")));
    $("pageCrumb").textContent=pageMap[page]||"";
    if(page==="reports"){loadReports();loadClasses();}
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
      catalogRowsCache=data;
      const merged=rows.map(row=>{
        const base=experiments.find(x=>x.slug===row.slug)||{slug:row.slug,code:row.code,x:"X",y:"Y",xu:"",yu:"",note:"该项目尚无专属计算模板。可使用通用数据表；由教师审核后再发布专属算法。"};
        const templateTables=Array.isArray(row.config?.template_tables)?row.config.template_tables:[];
        const tables=(base.tables||[]).map(table=>{const item=templateTables.find(value=>value.key===table.key);return item?{...table,title:item.title||table.title,headers:Array.isArray(item.headers)?item.headers:table.headers}:table;});
        return {...base,tables,slug:row.slug,code:row.code,name:row.name,group:row.category||"其他",desc:row.description||"",active:row.is_active,catalogId:row.id,config:row.config||{}};
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
  function excelNum(value){
    if(typeof value==="number")return Number.isFinite(value)?value:NaN;
    const text=String(value??"").trim().replace(/,/g,"");
    if(!text||text==="—"||text==="–")return NaN;
    const sci=text.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*[×x]\s*10\s*([+-]?\d+)$/i);
    if(sci)return Number(sci[1])*Math.pow(10,Number(sci[2]));
    const n=Number(text);return Number.isFinite(n)?n:NaN;
  }
  function excelSheetRows(workbook,hint){
    const name=hint?workbook.SheetNames.find(x=>x.includes(hint)):workbook.SheetNames[0];
    if(!name)return {name:null,rows:[]};
    return {name,rows:XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:null,raw:true})};
  }
  function excelNumericRows(rows,indices){
    return rows.map(r=>indices.map(i=>excelNum(r[i]))).filter(r=>r.every(Number.isFinite));
  }
  function mapExcelTable(slug,key,workbook){
    let picked,rows,out=[];
    // First recognize the platform's own downloaded workbook by its Chinese or
    // internal header row, before applying legacy source-workbook-specific mappings.
    // This lets a student download -> fill -> upload the exact same template.
    const templateDef=window.TJUCPE_EXPERIMENT_ENGINE?.definitions?.find(x=>x.slug===slug);
    const templateTable=templateDef?.tables?.find(x=>x.key===key);
    if(templateTable&&window.XLSX?.utils){
      const expectedHeaders=[templateTable.headers||[],templateTable.columns||[]]
        .filter(list=>list.length===templateTable.columns.length&&list.length>0);
      for(const sheetName of workbook.SheetNames){
        const sheetRows=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:null,raw:true});
        const headerIndex=sheetRows.findIndex(row=>expectedHeaders.some(labels=>
          labels.every((label,i)=>String(row?.[i]??"").trim()===String(label).trim())
        ));
        if(headerIndex<0)continue;
        const imported=sheetRows.slice(headerIndex+1).map(row=>
          templateTable.columns.map((_,i)=>excelNum(row?.[i]))
        );
        const usable=imported.filter(row=>Number.isFinite(row[0])&&row.slice(1).some(Number.isFinite));
        if(usable.length)return {name:sheetName,rows:usable};
      }
    }
    if(slug==="surface-tension"&&key==="processed"){
      picked=excelSheetRows(workbook);out=excelNumericRows(picked.rows,[0,1,2]);
    }else if(slug==="surface-tension"&&key==="main"){
      picked=excelSheetRows(workbook,"最大液泡法");
      out=excelNumericRows(picked.rows,[0,1,6,7]);
    }else if(slug==="saponification"&&key==="main"){
      picked=excelSheetRows(workbook,"实验数据");
      out=excelNumericRows(picked.rows,[0,1,4]);
    }else if(slug==="rectorite-adsorption"&&key==="calibration"){
      picked=excelSheetRows(workbook,"累托石吸附亚甲基蓝");rows=picked.rows;
      if(rows.length>=2)for(let i=1;i<Math.min(rows[0].length,rows[1].length);i++){
        const c=excelNum(rows[0][i]),a=excelNum(rows[1][i]);if(Number.isFinite(c)&&Number.isFinite(a))out.push([c,a]);
      }
    }else if(slug==="rectorite-adsorption"&&key==="samples"){
      picked=excelSheetRows(workbook,"累托石吸附亚甲基蓝");out=excelNumericRows(picked.rows,[10,11,12,13]);
    }else if(slug==="galvanic-cell"&&key==="main"){
      picked=excelSheetRows(workbook,"原电池热力学");out=excelNumericRows(picked.rows,[1,4,5]);
    }else if(slug==="phase-diagram"&&key==="main"){
      picked=excelSheetRows(workbook,"二组分凝聚系统湘图");
      out=picked.rows.filter(r=>Number.isFinite(excelNum(r[0]))).map(r=>[excelNum(r[0]),...Array.from({length:5},(_,j)=>excelNum(r[j+1]))]);
    }else if(slug==="boiling-composition"&&key==="calibration"){
      picked=excelSheetRows(workbook,"二组分液相完全互溶系统沸点组成图数据计算表");rows=picked.rows;
      if(rows.length>=4)for(let i=1;i<Math.min(rows[2].length,rows[3].length);i++){
        const x=excelNum(rows[2][i]),y=excelNum(rows[3][i]);if(Number.isFinite(x)&&Number.isFinite(y))out.push([x,y]);
      }
    }else if(slug==="boiling-composition"&&key==="samples"){
      picked=excelSheetRows(workbook,"二组分液相完全互溶系统沸点组成图数据计算表");
      out=excelNumericRows(picked.rows,[1,2,4]);
    }else if(slug==="reaction-enthalpy"){
      picked=excelSheetRows(workbook,"反应焓数据计算表");rows=picked.rows;
      const cols={kclBefore:[4,8],rxnBefore:[5,9],kclAfter:[6,10],rxnAfter:[7,11]}[key];
      if(cols)out=excelNumericRows(rows,cols);
    }else if(slug==="freezing-point"&&(key==="solvent"||key==="solution")){
      picked=excelSheetRows(workbook,"凝固点降低");rows=picked.rows;
      const title=key==="solvent"?"环己烷温差-时间数据":"萘溶液温差-时间数据";
      const start=rows.findIndex(r=>r.some(v=>String(v??"").includes(title)))+3;
      if(start>=3)out=rows.slice(start).filter(r=>Number.isFinite(excelNum(r[0]))).map(r=>Array.from({length:9},(_,j)=>excelNum(r[j])));
    }else if(slug==="equilibrium-constant"&&key==="main"){
      picked=excelSheetRows(workbook,"平衡常数计算表");out=excelNumericRows(picked.rows,[0,1,2]);
    }else if(slug==="thermostat-viscosity"&&(key==="wave220"||key==="wave110")){
      picked=excelSheetRows(workbook,"恒温槽表格");rows=picked.rows;
      const start=key==="wave220"?1:13;
      for(let r=start;r<start+6;r+=2){
        const timeRow=rows[r]||[],tempRow=rows[r+1]||[];
        for(let c=1;c<Math.min(timeRow.length,tempRow.length);c++){
          const t=excelNum(timeRow[c]),temp=excelNum(tempRow[c]);if(Number.isFinite(t)&&Number.isFinite(temp))out.push([t,temp]);
        }
      }
    }else if(slug==="thermostat-viscosity"&&key==="viscosity"){
      picked=excelSheetRows(workbook,"恒温槽表格");rows=picked.rows;
      const ethanol=rows.find(r=>String(r[13]??"").trim()==="乙醇");
      const water=rows.find(r=>String(r[13]??"").trim()==="蒸馏水");
      if(ethanol&&water)out=[[excelNum(ethanol[14]),excelNum(ethanol[15]),excelNum(ethanol[16]),excelNum(water[14]),excelNum(water[15]),excelNum(water[16])]].filter(r=>r.every(Number.isFinite));
    }else if(slug==="passivation"&&key==="main"){
      picked=excelSheetRows(workbook,"数据源");
      out=excelNumericRows(picked.rows.slice(3),[0,1,2,3,4,5,6,7]);
    }else{
      const def=window.TJUCPE_EXPERIMENT_ENGINE?.definitions?.find(x=>x.slug===slug),table=def?.tables?.find(x=>x.key===key);
      if(table){
        for(const sheetName of workbook.SheetNames){
          const sheetRows=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:null,raw:true});
          const matchesHeader=row=>{
            const columns=table.columns||[],labels=table.headers||[];
            const columnMatch=columns.length&&columns.every((col,i)=>String(row?.[i]??"").trim()===String(col).trim());
            const labelMatch=labels.length&&labels.every((label,i)=>String(row?.[i]??"").trim()===String(label).trim());
            return columnMatch||labelMatch;
          };
          const headerIndex=sheetRows.findIndex(matchesHeader);
          if(headerIndex>=0){picked={name:sheetName,rows:sheetRows.slice(headerIndex+1)};out=excelNumericRows(picked.rows,table.columns.map((_,i)=>i));break;}
        }
      }
      if(!out.length)return {name:null,rows:[],message:"没有找到与当前实验数据表字段一致的工作表。请使用本页面下载的专属 Excel 模板，或按字段顺序另存为 CSV/TSV。"};
    }
    return {name:picked?.name||null,rows:out};
  }
  async function importExperimentTableFile(input){
    if(!["teacher","admin"].includes(profile?.role)){toast("学生端不提供实验数据处理与导入功能。",true);input.value="";return;}
    const file=input.files?.[0],key=input.dataset.tableKey;
    if(!file||!currentExperiment||!key)return;
    const target=$("expData_"+key);
    if(!target){toast("没有找到对应的数据表。",true);input.value="";return;}
    try{
      if(/\.(csv|tsv|txt)$/i.test(file.name)){
        target.value=(await file.text()).replace(/^\uFEFF/,"");
        toast("已导入文件文本；请确认列顺序与当前实验表格一致。");
      }else{
        await ensureExternalLibrary("XLSX",["https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js","https://unpkg.com/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"]);
        const workbook=XLSX.read(await file.arrayBuffer(),{type:"array"});
        const mapped=mapExcelTable(currentExperiment.slug,key,workbook);
        if(mapped.message)throw new Error(mapped.message);
        if(!mapped.rows?.length)throw new Error("在工作簿对应工作表中没有找到可映射的数值行。请核对工作表与实验类型。");
        target.value=mapped.rows.map(row=>row.map(v=>Number.isFinite(v)?String(v):"").join("\t")).join("\n");
        toast("已从工作表“"+mapped.name+"”导入 "+mapped.rows.length+" 行数据。");
      }
      target.dispatchEvent(new Event("input",{bubbles:true}));
    }catch(err){toast("Excel/CSV 导入失败："+friendlyError(err),true);}
    input.value="";
  }
  function downloadExperimentTxt(slug,tableKey){
    const def=window.TJUCPE_EXPERIMENT_ENGINE?.definitions?.find(x=>x.slug===slug);
    const table=def?.tables?.find(x=>x.key===tableKey);if(!table)return;
    const headers=table.headers?.length===table.columns.length?table.headers:table.columns;
    const lines=[headers.join("\t"),...Array.from({length:20},()=>headers.map(()=>"").join("\t"))];
    const blob=new Blob(["\uFEFF"+lines.join("\r\n")],{type:"text/plain;charset=utf-8"});
    downloadBlob(blob,safeFileName(def.name)+"_"+safeFileName(table.title)+"_数据模板.txt");
    toast("TXT 数据模板已生成。请填写空白行后上传，或直接在网页表格中录入。");
  }
  async function createXlsxFallback(def){
    if(!window.JSZip)throw new Error("XLSX 组件与 ZIP 备用组件均未加载。");
    if(!Array.isArray(def.tables)||!def.tables.length)throw new Error("当前实验没有可导出的数据表。");
    const zip=new JSZip(),sheetXml=[],sheetNames=[];
    const xml=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
    const column=n=>{let out="";for(n++;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;};
    const used=new Set();
    for(let i=0;i<def.tables.length;i++){
      const table=def.tables[i],headers=table.headers?.length===table.columns?.length?table.headers:table.columns;
      const base=String(table.title||table.key||("Sheet"+(i+1))).replace(/[\\/?*:[\]]/g," ").trim().slice(0,24)||("Sheet"+(i+1));
      let name=(base+"_"+(i+1)).slice(0,31),suffix=1;
      while(used.has(name.toLowerCase()))name=(base.slice(0,24)+"_"+(++suffix)).slice(0,31);
      used.add(name.toLowerCase());sheetNames.push(name);
      const rows=[headers,...Array.from({length:40},()=>headers.map(()=>""))];
      const body=rows.map((row,r)=>{
        const cells=row.map((value,c)=>{
          if(value===null||value===undefined||String(value)==="")return "";
          return '<c r="'+column(c)+(r+1)+'" t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
        }).join("");
        return '<row r="'+(r+1)+'">'+cells+'</row>';
      }).join("");
      const last=column(Math.max(0,headers.length-1))+rows.length;
      const cols=headers.map((_,c)=>'<col min="'+(c+1)+'" max="'+(c+1)+'" width="22" customWidth="1"/>').join("");
      sheetXml.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+last+'"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols>'+cols+'</cols><sheetData>'+body+'</sheetData></worksheet>');
    }
    zip.file("[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+sheetXml.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+'</Types>');
    zip.file("_rels/.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file("xl/workbook.xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheetNames.map((name,i)=>'<sheet name="'+xml(name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets></workbook>');
    zip.file("xl/_rels/workbook.xml.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheetNames.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join("")+'</Relationships>');
    sheetXml.forEach((content,i)=>zip.file("xl/worksheets/sheet"+(i+1)+".xml",content));
    return await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:5}});
  }
  async function downloadExperimentWorkbook(slug){
    if(!["teacher","admin"].includes(profile?.role)){toast("学生端只提供教师发布的模板下载。",true);return;}
    await ensureExternalLibrary("XLSX",["https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js","https://unpkg.com/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"]);
    const def=window.TJUCPE_EXPERIMENT_ENGINE?.definitions?.find(x=>x.slug===slug);
    if(!def){toast("未找到该实验的数据表结构。",true);return;}
    try{
      if(window.XLSX?.utils){
        const wb=XLSX.utils.book_new();
        def.tables.forEach((table,i)=>{
          const headers=table.headers?.length===table.columns.length?table.headers:table.columns;
          const ws=XLSX.utils.aoa_to_sheet([headers,...Array.from({length:40},()=>headers.map(()=>""))]);
          ws["!cols"]=headers.map(()=>({wch:22}));
          XLSX.utils.book_append_sheet(wb,ws,(i+1)+"_"+table.key.slice(0,20));
        });
        const bytes=XLSX.write(wb,{bookType:"xlsx",type:"array"});
        if(!bytes?.byteLength)throw new Error("SheetJS 返回了空工作簿。");
        downloadBlob(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),safeFileName(def.name)+"_实验数据录入模板.xlsx");
      }else{
        const blob=await createXlsxFallback(def);
        if(!blob?.size)throw new Error("Open XML 备用工作簿为空。");
        downloadBlob(blob,safeFileName(def.name)+"_实验数据录入模板.xlsx");
      }
      toast("已生成标准 XLSX 工作簿；每个实验数据表均对应独立工作表。");
    }catch(err){toast("Excel 模板生成失败："+friendlyError(err),true);}
  }

  const formulaLibrary = {
    "surface-tension": [
      {title:"Szyszkowski 表面张力方程",latex:String.raw`\gamma=\gamma_0-a\ln(1+bc)`,note:"用于表面张力–浓度拟合；请核对浓度单位和参数定义。"},
      {title:"Gibbs 吸附关系（稀溶液近似）",latex:String.raw`\Gamma=-\frac{1}{RT}\left(\frac{\partial\gamma}{\partial\ln c}\right)_T`,note:"须明确溶液体系、电解质条件和浓度单位。"}
    ],
    "saponification": [
      {title:"电导率线性化关系（报告式 12）",latex:String.raw`\frac{1}{\kappa_t-\kappa_\infty}=\frac{k c_0}{\kappa_0-\kappa_\infty}t+\frac{1}{\kappa_0-\kappa_\infty}`,note:"以 1/(κt−κ∞) 对 t 作图；斜率 m、截距 b。"},
      {title:"二级反应速率常数",latex:String.raw`k=\frac{m}{c_0 b}`,note:"κ₀、κ∞、时间单位和 c₀ 必须来自同一实验组。"},
      {title:"Arrhenius 两点式",latex:String.raw`\ln\frac{k_2}{k_1}=-\frac{E_a}{R}\left(\frac{1}{T_2}-\frac{1}{T_1}\right)`,note:"温度使用 K；k₁、k₂ 对应各温度组拟合结果。"}
    ],
    "rectorite-adsorption": [
      {title:"平衡吸附量",latex:String.raw`q_e=\frac{(C_0-C_e)V}{m}`,note:"C₀、Cₑ、V、m 的单位须匹配，稀释倍数需计入平衡浓度。"},
      {title:"Langmuir 吸附等温式",latex:String.raw`q_e=\frac{q_{\max}K_L C_e}{1+K_L C_e}`,note:"模型适用性需结合实验机理和拟合残差判断。"},
      {title:"Freundlich 吸附等温式",latex:String.raw`q_e=K_F C_e^{1/n}`,note:"常用对数线性化为 ln qₑ = ln K_F + (1/n) ln Cₑ。"}
    ],
    "zeta-potential": [{title:"Smoluchowski 近似",latex:String.raw`\zeta=\frac{\eta u}{\varepsilon E}`,note:"u 为电泳迁移速度，E 为电场强度；核对适用条件、介电常数和黏度单位。"}],
    "galvanic-cell": [
      {title:"反应 Gibbs 能",latex:String.raw`\Delta_r G_m=-nFE`,note:"n 为转移电子数，F 为 Faraday 常数；符号依赖电池反应方向。"},
      {title:"反应熵",latex:String.raw`\Delta_r S_m=nF\left(\frac{\partial E}{\partial T}\right)_p`,note:"温度系数由 E–T 数据拟合求得，T 使用 K。"},
      {title:"反应焓",latex:String.raw`\Delta_r H_m=\Delta_r G_m+T\Delta_r S_m`,note:"符号须与电池反应方程式一致。"}
    ],
    "phase-diagram": [{title:"二组分质量分数",latex:String.raw`w_B=\frac{m_B}{m_A+m_B}\times100\%`,note:"组成轴必须注明采用质量分数还是摩尔分数。"}],
    "boiling-composition": [
      {title:"气液平衡关系（理想液相近似）",latex:String.raw`y_iP=x_iP_i^{\ast}(T)`,note:"区分气相 yᵢ 与液相 xᵢ；非理想体系须采用活度系数模型。"},
      {title:"总压关系",latex:String.raw`P=\sum_i x_iP_i^{\ast}(T)`,note:"仅用于理想溶液近似，不替代实验测得的组成数据。"}
    ],
    "reaction-enthalpy": [
      {title:"量热热量",latex:String.raw`q_{\mathrm{cal}}=(mc_p+C_{\mathrm{cal}})\Delta T`,note:"按实验体系确定溶液质量、比热容、量热计热容和温度修正。"},
      {title:"摩尔反应焓",latex:String.raw`\Delta_r H_m=-\frac{q_{\mathrm{cal}}}{n_{\mathrm{react}}}`,note:"以指导书的反应进度与符号约定为准。"}
    ],
    "freezing-point": [
      {title:"凝固点降低",latex:String.raw`\Delta T_f=K_f b`,note:"b 为质量摩尔浓度；过冷段按实验规定确定凝固点。"},
      {title:"溶质摩尔质量",latex:String.raw`M_B=\frac{1000K_f m_B}{\Delta T_f m_A}`,note:"当 mA、mB 均以 g 计时使用此写法，单位须匹配。"}
    ],
    "equilibrium-constant": [{title:"van’t Hoff 关系",latex:String.raw`\ln K^\circ=-\frac{\Delta_r H^\circ}{RT}+\frac{\Delta_r S^\circ}{R}`,note:"K° 应为无量纲平衡常数，温度使用 K。"}],
    "vapour-pressure": [{title:"Clausius–Clapeyron 近似",latex:String.raw`\ln p=-\frac{\Delta_{\mathrm{vap}}H}{RT}+C`,note:"假设汽化焓在所选温区近似恒定，蒸气可近似为理想气体。"}],
    "thermostat-viscosity": [
      {title:"毛细管黏度计相对黏度",latex:String.raw`\frac{\eta}{\eta_0}=\frac{\rho t}{\rho_0t_0}`,note:"需记录样品与参比液体的密度、流出时间，并使用同一支黏度计。"},
      {title:"恒温槽温度偏差",latex:String.raw`\Delta T(t)=T(t)-T_{\mathrm{set}}`,note:"温度波动数据与黏度测量数据应分别记录。"}
    ],
    "hydrogen-peroxide": [{title:"一级反应积分式（仅在验证一级动力学时）",latex:String.raw`\ln\frac{c_0}{c_t}=kt`,note:"若仪器测量量为气体体积、滴定体积或压力，须先按指导书换算浓度。"}],
    "passivation": [{title:"Tafel 区域近似关系",latex:String.raw`\eta=a+b\log_{10}i`,note:"仅适用于可辨识的 Tafel 线性区；钝化平台不可默认按此关系拟合。"}]
  };
  function renderFormulaReference(slug) {
    const host = $("formulaReference"); if (!host) return;
    const rows = formulaLibrary[slug] || []; host.classList.remove("hidden");
    if (!rows.length) { host.innerHTML = "<strong>公式说明</strong><p class='muted'>本实验公式需以当前课程指导书与仪器测量方法为准。</p>"; return; }
    host.innerHTML = "<div class='formula-heading'><div><strong>本实验常用公式</strong><small>LaTeX 数学排版 · 以当前实验指导书为最终依据</small></div></div>" + rows.map(item => "<article class='formula-item'><h4>"+escapeHtml(item.title)+"</h4><div class='latex-display' data-latex='"+escapeHtml(item.latex)+"'>"+escapeHtml(item.latex)+"</div><p>"+escapeHtml(item.note)+"</p></article>").join("");
    if (window.katex) host.querySelectorAll("[data-latex]").forEach(node => { try { node.innerHTML = window.katex.renderToString(node.dataset.latex,{displayMode:true,throwOnError:false,strict:"ignore"}); } catch (_) { node.textContent=node.dataset.latex; } });
  }

  function openExperiment(slug){
    if(!["teacher","admin"].includes(profile?.role)){toast("学生端仅提供实验模板下载与报告提交。",true);return;}
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
      renderFormulaReference(slug);
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
  let pyodideRuntimePromise=null,pyodideLoaderPromise=null;
  async function ensurePyodideLoader(){
    if(typeof window.loadPyodide==="function")return;
    if(!pyodideLoaderPromise){
      pyodideLoaderPromise=new Promise((resolve,reject)=>{
        const script=document.createElement("script");
        script.src="https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js";
        script.async=true;
        script.onload=()=>typeof window.loadPyodide==="function"?resolve():reject(new Error("浏览器 Python 引擎脚本加载不完整。"));
        script.onerror=()=>reject(new Error("Python 绘图组件下载失败；交互式 Plotly 图仍可使用。"));
        document.head.appendChild(script);
      });
    }
    return pyodideLoaderPromise;
  }
  async function getPythonPlotRuntime(){
    if(pyodideRuntimePromise)return pyodideRuntimePromise;
    pyodideRuntimePromise=(async()=>{
      await ensurePyodideLoader();
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
  async function runDedicatedAnalysis(){
    if(!["teacher","admin"].includes(profile?.role)){toast("学生端不开放数据计算功能。",true);return;}
    try{await ensureExternalLibrary("Chart",["https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js","https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.7/chart.umd.min.js"]);}catch(err){toast("图表组件加载失败："+friendlyError(err),true);return;}
    if(!window.TJUCPE_EXPERIMENT_ENGINE){toast("实验算法组件尚未加载，请刷新页面后重试。",true);return;}
    const button=$("runDedicatedAnalysis");if(button){button.disabled=true;button.textContent="正在计算…";}
    try{
      const {def,tables,settings}=readDedicatedInputs();
      selectedFitIndices=[];
    const result=window.TJUCPE_EXPERIMENT_ENGINE.analyze(def.slug,tables,settings,[]);
      dedicatedTables=tables;dedicatedResult=result;
      let plotlyReady=!!window.Plotly;
      if(!plotlyReady){
        const load=ensureExternalLibrary("Plotly",["https://cdn.plot.ly/plotly-2.35.2.min.js","https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.35.2/plotly.min.js"]).then(()=>true).catch(()=>false);
        plotlyReady=await Promise.race([load,new Promise(resolve=>window.setTimeout(()=>resolve(false),5000))]);
      }
      renderDedicatedResult(def,result,tables,settings,plotlyReady);
    }catch(error){toast(friendlyError(error)||"实验计算失败。",true);}
    finally{if(button){button.disabled=false;button.textContent="运行本实验专属计算";}}
  }
  async function generatePythonPlot(){
    if(!dedicatedResult||!currentExperiment){toast("请先运行本实验计算，再生成 Python 高清图。",true);return;}
    const def=window.TJUCPE_EXPERIMENT_ENGINE?.definitions?.find(x=>x.slug===currentExperiment.slug);
    if(!def)return;
    const button=$("renderPythonPlot"),status=$("pythonPlotStatus");
    button.disabled=true;button.textContent="Python 正在准备…";
    status.textContent="正在按需加载浏览器内 Python、NumPy 和 Matplotlib。首次使用需要下载绘图运行环境；页面的交互图不受影响。";
    try{
      await renderPythonMatplotlib(def,dedicatedResult);
      toast("Python 高清科研图已生成。");
    }catch(err){
      status.textContent="Python 高清图暂不可用："+friendlyError(err)+"。交互图和计算结果仍可继续使用。";
      toast("Python 绘图失败："+friendlyError(err),true);
    }finally{button.disabled=false;button.textContent="生成 Python 高清图";}
  }
  function renderDedicatedResult(def,result,tables,settings,plotlyReady=false){
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
      dragmode:"pan",
      xaxis:{title:firstSeries?.xLabel||"X",gridcolor:"#e9eff2",zerolinecolor:"#d4e0e5",linecolor:"#bfcdd4"},
      yaxis:{title:firstSeries?.yLabel||"Y",gridcolor:"#e9eff2",zerolinecolor:"#d4e0e5",linecolor:"#bfcdd4"},
      selectdirection:"any",hovermode:"closest"
    };
    $("pythonPlotImage").classList.add("hidden");
    $("pythonPlotStatus").textContent="交互图已准备好。需要高分辨率科研图片时，再点击“生成 Python 高清图”。";
    $("renderPythonPlot").classList.remove("hidden");
    if(plotlyReady&&window.Plotly&&typeof Plotly.react==="function"){
      $("analysisPlotly").classList.remove("hidden");$("analysisChart").classList.add("hidden");
      Plotly.react("analysisPlotly",plotData,layout,{
        responsive:true,displaylogo:false,scrollZoom:true,modeBarButtonsToAdd:[],
        toImageButtonOptions:{format:"png",filename:(currentExperiment?.slug||"experiment")+"-all-valid-data",height:900,width:1400,scale:2}
      }).then(graph=>{
        plotlyGraph=graph;
        // v2.0: no range/lasso selection listeners; regression always uses all valid points.
      }).catch(error=>{
        $("pythonPlotStatus").textContent="交互图暂不可用："+friendlyError(error)+"；回归仍使用全部有效数据点。";
        $("analysisPlotly").classList.add("hidden");$("analysisChart").classList.remove("hidden");undefined
      });
    }else{
      $("analysisPlotly").classList.add("hidden");$("analysisChart").classList.remove("hidden");
      if(chart){chart.destroy();chart=null;}
      const datasets=[];
      (result.series||[]).forEach((series,index)=>{
        const pts=(series.points||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
        datasets.push({label:series.name,data:pts.map(p=>({x:p.x,y:p.y})),showLine:false,pointRadius:4,pointHoverRadius:6});
        if(series.fitCurve?.length)datasets.push({label:series.name+" · 拟合",data:series.fitCurve.map(p=>({x:p.x,y:p.y})),showLine:true,pointRadius:0,borderWidth:2,borderDash:[6,4],fill:false});
      });
      chart=new Chart($("analysisChart").getContext("2d"),{
        type:"scatter",data:{datasets},
        options:{responsive:true,maintainAspectRatio:false,animation:false,
          plugins:{legend:{position:"bottom"}},
          scales:{x:{type:"linear",title:{display:true,text:firstSeries?.xLabel||"X"},grid:{color:"#e9eff2"}},
                  y:{title:{display:true,text:firstSeries?.yLabel||"Y"},grid:{color:"#e9eff2"}}}
        }
      });
      $("pythonPlotStatus").textContent="交互绘图库暂不可用，已切换为 Chart.js 备用图；拟合始终使用全部有效数据点。";
    }
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
  // Range selection has been removed in v2.0; clear the all-point fit state only if called by legacy code.
  function clearDedicatedSelection(){
    selectedFitIndices=[];
    $("fitSelectionLabel").textContent="拟合范围：全部有效数据点";
    if(window.Plotly&&$("analysisPlotly"))Plotly.relayout("analysisPlotly",{selection:{}}).catch(()=>{});
  }
  async function runAnalysis(){
    if(!["teacher","admin"].includes(profile?.role)){toast("实验数据处理由教师端统一完成。",true);return;}
    try{await ensureExternalLibrary("Chart",["https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js","https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.7/chart.umd.min.js"]);}catch(err){toast("图表组件加载失败："+friendlyError(err),true);return;}
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
    if(!["teacher","admin"].includes(profile?.role)){toast("只有教师可以保存数据分析记录。",true);return;}
    if(!user||!latestAnalysis){toast("请先运行分析，再保存记录。",true);return;}
    const record={owner_id:user.id,assignment_id:activeAssignmentId||null,experiment_slug:currentExperiment?.slug||"custom",title:currentExperiment?.name||"数据分析",raw_data:{headers:latestAnalysis.seriesLabels,rows:latestAnalysis.rawRows,source_tables:latestAnalysis.sourceTables||null,export_headers:latestAnalysis.exportHeaders||null,export_rows:latestAnalysis.exportRows||null},analysis:{model:latestAnalysis.model,coefficients:latestAnalysis.fit?.coefficients||null,r2:latestAnalysis.fit?.r2??null,sse:latestAnalysis.fit?.sse??null,mean:latestAnalysis.mean,sd:latestAnalysis.sd,x_label:latestAnalysis.xLabel,y_label:latestAnalysis.yLabel,x_unit:latestAnalysis.xUnit,y_unit:latestAnalysis.yUnit,summary:latestAnalysis.analysisSummary||null,settings:latestAnalysis.settings||null},engine_version:latestAnalysis.engine||ENGINE_VERSION};
    const {error}=await db.from("experiment_records").insert(record);
    if(error){toast("保存失败："+error.message,true);return;}
    toast("分析记录已保存到个人空间。"); loadOverview();
  }
  function downloadCsv(){
    if(!["teacher","admin"].includes(profile?.role)){toast("数据导出由教师端负责。",true);return;}
    if(!latestAnalysis){toast("请先运行实验计算，再导出数据。",true);return;}
    const rawHeaders=latestAnalysis.exportHeaders||[latestAnalysis.xLabel,latestAnalysis.yLabel];
    const rows=latestAnalysis.exportRows||latestAnalysis.rawRows||[];
    const def=window.TJUCPE_EXPERIMENT_ENGINE?.definitions?.find(x=>x.slug===currentExperiment?.slug);
    const fieldMap=new Map();
    (def?.tables||[]).forEach(table=>(table.columns||[]).forEach((key,i)=>fieldMap.set(key,table.headers?.[i]||key)));
    const commonMap={
      c_mol_L:"浓度 c / mol·L⁻¹",gamma_mN_m:"表面张力 γ / mN·m⁻¹",Gamma_mol_m2:"表面吸附量 Γ / mol·m⁻²",
      t_min:"时间 t / min",time_min:"时间 t / min",temperature_C:"温度 T / ℃",
      kappa_T1:"电导率 κ（温度组 1）/ mS·cm⁻¹",kappa_T2:"电导率 κ（温度组 2）/ mS·cm⁻¹",
      c_mol_L_1:"初始浓度 c₀ / mol·L⁻¹",ce_mg_L:"平衡浓度 cₑ / mg·L⁻¹",qe_mg_g:"吸附量 qₑ / mg·g⁻¹"
    };
    const headers=rawHeaders.map(h=>fieldMap.get(h)||commonMap[h]||h);
    const cell=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
    const csv="\uFEFF"+[headers,...rows].map(r=>(Array.isArray(r)?r:[r]).map(cell).join(",")).join("\r\n");
    downloadBlob(new Blob([csv],{type:"text/csv;charset=utf-8"}),safeFileName(currentExperiment?.name||"实验数据")+"_中文数据表.csv");
    toast("已导出中文字段数据表（CSV，可使用 Excel / Origin 打开）。");
  }
  async function loadOverview(){
    if(!db||!user)return;
    if(["teacher","admin"].includes(profile?.role)){
      const [cq,aq,rq]=await Promise.all([
        profile.role==="admin"?db.from("classes").select("id",{count:"exact",head:true}):db.from("classes").select("id",{count:"exact",head:true}).eq("teacher_id",user.id),
        profile.role==="admin"?db.from("experiment_assignments").select("id",{count:"exact",head:true}).eq("is_open",true):db.from("experiment_assignments").select("id,classes!inner(teacher_id)",{count:"exact",head:true}).eq("is_open",true).eq("classes.teacher_id",user.id),
        profile.role==="admin"?db.from("report_submissions").select("id",{count:"exact",head:true}).eq("status","submitted"):db.from("report_submissions").select("id,classes!inner(teacher_id)",{count:"exact",head:true}).eq("status","submitted").eq("classes.teacher_id",user.id)
      ]);
      $("staffMetricClasses").textContent=cq.count??"—";$("staffMetricTasks").textContent=aq.count??"—";$("staffMetricReports").textContent=rq.count??"—";return;
    }
    const [tasks,reports]=await Promise.all([
      db.from("experiment_assignments").select("id",{count:"exact",head:true}).eq("is_open",true),
      db.from("report_submissions").select("id,status,feedback,created_at,experiment_slug").eq("student_id",user.id).order("created_at",{ascending:false}).limit(100)
    ]);
    $("metricExperiments").textContent=tasks.count??"—";
    $("metricReports").textContent=reports.data?.length??0;
    $("metricFeedback").textContent=(reports.data||[]).filter(r=>r.status==="returned"||!!r.feedback).length;
    $("recentActivity").innerHTML=reports.data?.length
      ?reports.data.slice(0,5).map(r=>'<div class="activity-row"><span>'+escapeHtml(experimentName(r.experiment_slug)||"实验报告")+'</span><span>'+escapeHtml(statusLabel(r.status))+'</span><small>'+new Date(r.created_at).toLocaleString("zh-CN")+'</small></div>').join("")
      :'<div class="empty-state"><div class="empty-icon">▤</div><strong>还没有报告记录</strong><p>先下载教师发布的 Excel 模板，填写数据后提交报告。</p><button class="btn btn-outline" data-goto="reports">查看实验任务与模板</button></div>';
  }
  function statusLabel(status){return ({draft:"草稿",submitted:"已提交",graded:"已批阅",returned:"退回修改",withdrawn:"已撤回",missing:"未提交"})[status]||status;}
  function statusClass(status){return status||"draft";}
  async function loadReports(){
    const body=$("reportsBody");body.innerHTML='<tr><td colspan="6" class="muted center">正在加载……</td></tr>';
    const {data,error}=await db.from("report_submissions").select("id,class_id,assignment_id,experiment_slug,file_name,storage_path,data_file_name,data_file_path,status,score,feedback,created_at,updated_at,submission_version,annotation_source_path,annotation_source_file_name,withdrawn_at").eq("student_id",user.id).order("created_at",{ascending:false}).limit(100);
    if(error){body.innerHTML=`<tr><td colspan="6" class="center">${escapeHtml(friendlyError(error))}</td></tr>`;return;}
    lastRecords=data||[];
    if(!lastRecords.length){body.innerHTML='<tr><td colspan="6" class="muted center">暂无报告记录，点击右上角提交第一份实验报告。</td></tr>';return;}
    body.innerHTML=lastRecords.map(r=>`<tr><td>${escapeHtml(experimentName(r.experiment_slug))}</td><td>${escapeHtml(r.file_name||"报告文件")}</td><td>${new Date(r.created_at).toLocaleDateString("zh-CN")}</td><td><span class="status-pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></td><td>${r.score??"—"}</td><td><button class="action-link" data-report-download="${r.id}">预览</button> <button class="action-link" data-report-feedback="${r.id}">反馈</button> ${r.status==="submitted"?`<button class="action-link" data-report-withdraw="${r.id}">撤回</button>`:""} ${["draft","returned","withdrawn"].includes(r.status)?`${r.class_id&&r.assignment_id?`<button class="action-link" data-report-edit="${r.id}">修改并重交</button> `:""}<button class="action-link" data-report-delete="${r.id}">删除</button>`:""}</td></tr>`).join("");
  }
  async function submitReport(){
    const reportFile=$("reportFile").files?.[0],dataFile=$("reportDataFile")?.files?.[0];
    const classId=$("reportClass").value,assignmentId=$("reportAssignment").value,assignmentOption=$("reportAssignment").selectedOptions[0];
    const slug=assignmentOption?.dataset.slug||"",title=$("reportTitle").value.trim(),button=$("submitReport");
    if(button.disabled)return;
    if(!reportFile||!dataFile||!title||!classId||!assignmentId||!slug){
      toast("请同时选择 PDF/Word 实验报告和 Excel 数据文件，并填写报告标题、班级和实验任务。",true);return;
    }
    if(reportFile.size>20*1024*1024||dataFile.size>20*1024*1024){toast("单个文件不能超过 20 MB。",true);return;}
    const reportExt=reportFile.name.split(".").pop().toLowerCase(),dataExt=dataFile.name.split(".").pop().toLowerCase();
    if(!["pdf","docx"].includes(reportExt)){toast("报告文件仅支持 PDF 或 DOCX。",true);return;}
    if(!["xlsx","xls","csv"].includes(dataExt)){toast("数据文件仅支持 XLSX、XLS 或 CSV。",true);return;}
    const mime={pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",xls:"application/vnd.ms-excel",csv:"text/csv"};
    const makePath=file=>user.id+"/"+crypto.randomUUID()+"_"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const reportPath=makePath(reportFile),dataPath=makePath(dataFile),storage=db.storage.from("lab-reports");
    let uploaded=[];
    button.disabled=true;button.dataset.originalText=button.textContent;button.textContent="正在上传报告与 Excel 数据…";
    try{
      for(const [file,path] of [[reportFile,reportPath],[dataFile,dataPath]]){
        const ext=file.name.split(".").pop().toLowerCase();
        const {error}=await storage.upload(path,file,{upsert:false,contentType:file.type||mime[ext]});
        if(error)throw new Error("文件上传失败："+friendlyError(error));
        uploaded.push(path);
      }
      const {error}=await db.from("report_submissions").insert({
        student_id:user.id,class_id:classId,assignment_id:assignmentId,experiment_slug:slug,title,
        file_name:reportFile.name,storage_path:reportPath,data_file_name:dataFile.name,data_file_path:dataPath,status:"submitted"
      });
      if(error)throw new Error("报告与 Excel 数据关联失败："+friendlyError(error));
      toast("报告与原始 Excel 数据已作为同一次提交上传成功。");
      $("reportUploadPanel").classList.add("hidden");
      $("reportFile").value="";$("reportDataFile").value="";$("reportTitle").value="";
      $("reportFileName").textContent="点击选择报告文件";$("reportDataFileName").textContent="点击选择 Excel 数据文件";
      await loadReports();await loadOverview();
    }catch(err){
      if(uploaded.length)await storage.remove(uploaded);
      toast("提交失败："+friendlyError(err),true);
    }finally{
      button.disabled=false;button.textContent=button.dataset.originalText||"提交报告";delete button.dataset.originalText;
    }
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
    const row=lastRecords.find(r=>r.id===id);
    if(!row||!["draft","returned","withdrawn"].includes(row.status)||!row.class_id||!row.assignment_id)return;
    const picker=document.createElement("input");picker.type="file";picker.multiple=true;picker.accept=".pdf,.docx,.xlsx,.xls,.csv";
    picker.onchange=async()=>{
      const files=Array.from(picker.files||[]);
      const reportFile=files.find(f=>["pdf","docx"].includes(f.name.split(".").pop().toLowerCase()));
      const dataFile=files.find(f=>["xlsx","xls","csv"].includes(f.name.split(".").pop().toLowerCase()));
      if(!reportFile||!dataFile){toast("请在同一次选择中同时选中新的 PDF/DOCX 报告与 XLSX/XLS/CSV 数据文件。",true);return;}
      if(reportFile.size>20*1024*1024||dataFile.size>20*1024*1024){toast("单个文件不能超过 20 MB。",true);return;}
      const mime={pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",xls:"application/vnd.ms-excel",csv:"text/csv"};
      const path=file=>user.id+"/"+crypto.randomUUID()+"_"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const reportPath=path(reportFile),dataPath=path(dataFile),storage=db.storage.from("lab-reports");let uploaded=[];
      try{
        for(const [file,target] of [[reportFile,reportPath],[dataFile,dataPath]]){
          const ext=file.name.split(".").pop().toLowerCase();
          const {error}=await storage.upload(target,file,{upsert:false,contentType:file.type||mime[ext]});
          if(error)throw new Error("文件上传失败："+friendlyError(error));
          uploaded.push(target);
        }
        const {error}=await db.from("report_submissions").update({
          file_name:reportFile.name,storage_path:reportPath,data_file_name:dataFile.name,data_file_path:dataPath,
          status:"submitted",submitted_at:new Date().toISOString(),withdrawn_at:null
        }).eq("id",id);
        if(error)throw new Error("报告新版本提交失败："+friendlyError(error));
        toast("报告和 Excel 数据已作为同一版本重新提交，上一版本已保留。");
        await loadReports();await loadOverview();
      }catch(err){if(uploaded.length)await storage.remove(uploaded);toast("重新提交失败："+friendlyError(err),true);}
    };
    picker.click();
  }

  async function deleteReport(id){
    const row=lastRecords.find(r=>r.id===id);if(!row||!["draft","returned","withdrawn"].includes(row.status))return;
    if(!confirm("确认删除这份报告及其全部历史文件版本？此操作不可恢复。"))return;
    const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action:"delete_report",report_id:id}});
    if(error||!data?.ok){toast("报告删除失败："+(error?.message||data?.error||"未知错误"),true);return;}
    if(data.cleanup_warning)toast("报告记录已删除，但部分历史文件清理失败，请管理员检查存储。",true);else toast("报告记录及 "+(data.removed_files||0)+" 个文件版本已删除。");await loadReports();await loadOverview();
  }
  async function showFeedback(id){
    const row=lastRecords.find(r=>r.id===id);if(!row)return;
    $("feedbackContent").textContent=row.feedback||"该报告暂时没有教师反馈。";
    $("feedbackDialog").showModal();
  }
  let reviewRows=[],reviewOffset=0,reviewProfileCache={};
  async function loadReviews(loadMore=false){
    if(!loadMore){reviewOffset=0;reviewRows=[];reviewProfileCache={};$("reviewBody").innerHTML='<tr><td colspan="5" class="muted center">正在加载……</td></tr>';}
    const pageSize=100;
    const {data,error}=await db.from("report_submissions").select("id,student_id,class_id,assignment_id,experiment_slug,file_name,storage_path,data_file_name,data_file_path,annotation_source_path,annotation_source_file_name,review_annotations,status,score,feedback,created_at,reviewed_at,reviewed_by,submission_version").order("created_at",{ascending:false}).range(reviewOffset,reviewOffset+pageSize-1);
    if(error){$("reviewBody").innerHTML=`<tr><td colspan="5" class="center">${escapeHtml(friendlyError(error))}</td></tr>`;return;}
    reviewRows=reviewRows.concat(data||[]);
    reviewOffset+=(data||[]).length;
    $("loadMoreReviews")?.classList.toggle("hidden",(data||[]).length<pageSize);
    const ids=[...new Set((data||[]).map(r=>r.student_id))].filter(id=>!reviewProfileCache[id]);
    if(ids.length){const result=await db.from("profiles").select("id,full_name,student_no").in("id",ids);(result.data||[]).forEach(p=>reviewProfileCache[p.id]=p);}
    $("reviewBody").innerHTML=reviewRows.length?reviewRows.map(r=>{
      const p=reviewProfileCache[r.student_id]||{};
      return `<tr><td>${escapeHtml(p.full_name||"学生")}<small class="block muted">${escapeHtml(p.student_no||"")}</small></td><td>${escapeHtml(experimentName(r.experiment_slug))}</td><td>${new Date(r.created_at).toLocaleString("zh-CN")}</td><td><span class="status-pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></td><td><button class="action-link" data-review-open="${r.id}">打开批阅</button></td></tr>`;
    }).join(""):'<tr><td colspan="5" class="muted center">暂无报告提交。</td></tr>';
  }
  async function openGrading(id){
    gradingRecord=reviewRows.find(r=>r.id===id);if(!gradingRecord)return;
    $("gradingTitle").textContent=experimentName(gradingRecord.experiment_slug)+" · "+(gradingRecord.file_name||"报告");
    $("gradeScore").value=gradingRecord.score??"";$("gradeStatus").value=gradingRecord.status==="returned"?"returned":"graded";$("gradeFeedback").value=gradingRecord.feedback||"";
    $("gradingPanel").classList.remove("hidden");await Promise.all([loadGradingPreview(gradingRecord),loadGradingDataComparison(gradingRecord).catch(err=>{$("gradingDataSummary").textContent=friendlyError(err);})]);populateGradingAnalysisControls();$("gradingPanel").scrollIntoView({behavior:"smooth",block:"start"});
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
    (gradingTextAnnotations[pageNo]||[]).forEach(item=>{
      if(!item.text)return;ctx.fillStyle=item.color||"#c62828";ctx.font="600 "+(Number(item.size)||12)+"px Arial,sans-serif";ctx.textBaseline="top";
      ctx.fillText(item.text,Math.max(0,Math.min(1,item.x))*w,Math.max(0,Math.min(1,item.y))*h);
    });
  }
  async function renderPdfAnnotation(pdfBlob){
    const host=$("gradingPreviewContent");
    if(!window.pdfjsLib){host.textContent="PDF.js 未能加载，当前可预览但暂不可进行页面标注。请刷新后重试。";return;}
    pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    // A Blob is the immutable canonical source. Give PDF.js a fresh ArrayBuffer on every
    // render because PDF.js transfers/detaches the buffer it receives to its worker.
    if(!(pdfBlob instanceof Blob))throw new Error("原始 PDF 文件缓存不可用，请重新打开报告。");
    const previewBuffer=await pdfBlob.arrayBuffer();
    const task=pdfjsLib.getDocument({data:previewBuffer}),pdf=await task.promise;
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
        if(pdfAnnotationMode==="text-add"){
          const value=$("pdfTextInput")?.value?.trim()||"";if(!value){toast("请先填写要插入 PDF 的文字。",true);return;}
          (gradingTextAnnotations[pageNo]||=[]).push({text:value,x:point.x,y:point.y,size:Number($("pdfTextSize")?.value)||12,color:$("pdfTextColor")?.value||"#c62828",createdAt:Date.now()});
          annotationCanvasRedraw(overlay,pageNo);return;
        }
        if(pdfAnnotationMode==="text-edit"){
          const items=gradingTextAnnotations[pageNo]||[];let nearest=-1,best=.06;
          items.forEach((item,index)=>{const d=Math.hypot(item.x-point.x,item.y-point.y);if(d<best){best=d;nearest=index;}});
          if(nearest<0){toast("请点击已有文字批注附近进行修改。");return;}
          const old=items[nearest],value=window.prompt("修改文字批注（留空删除）：",old.text);
          if(value===null)return;if(!value.trim())items.splice(nearest,1);else items[nearest]={...old,text:value.trim(),createdAt:Date.now()};
          annotationCanvasRedraw(overlay,pageNo);return;
        }
        const stroke={color:"#d7263d",width:2.2,points:[point],createdAt:Date.now()};
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
    if(!(gradingPdfBlob instanceof Blob)||!window.PDFLib?.PDFDocument)throw new Error("PDF 批注组件尚未就绪，请刷新页面后重新打开报告。");
    // Never retain or reuse an ArrayBuffer passed to PDF.js. Blob.arrayBuffer() creates
    // a fresh, independent buffer for PDF-Lib on each save attempt.
    if(gradingPdfBlob.size<8)throw new Error("PDF 原始文件为空或不完整，请重新打开报告。");
    const sourceBytes=new Uint8Array(await gradingPdfBlob.arrayBuffer());
    if(sourceBytes.length<8||String.fromCharCode(sourceBytes[0],sourceBytes[1],sourceBytes[2],sourceBytes[3],sourceBytes[4])!=="%PDF-")throw new Error("原始文件不是有效 PDF，无法生成批阅版。");
    const pdf=await PDFLib.PDFDocument.load(sourceBytes,{ignoreEncryption:true,updateMetadata:false});
    const pages=pdf.getPages();
    for(const [pageKey,strokes] of Object.entries(gradingStrokes)){
      const page=pages[Number(pageKey)-1];if(!page)continue;
      const {width,height}=page.getSize();
      for(const stroke of strokes||[]){
        const pts=(stroke.points||[]).filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y));
        if(!pts.length)continue;
        const points=pts.map(p=>({x:Math.max(0,Math.min(1,p.x))*width,y:height-Math.max(0,Math.min(1,p.y))*height}));
        const thickness=Number.isFinite(stroke.width)?Math.max(0.5,Math.min(12,stroke.width)):2.2;
        if(points.length===1){
          page.drawCircle({x:points[0].x,y:points[0].y,size:1.4,color:PDFLib.rgb(0.84,0.10,0.18)});
        }else for(let i=1;i<points.length;i++){
          page.drawLine({start:points[i-1],end:points[i],thickness,color:PDFLib.rgb(0.84,0.10,0.18),opacity:0.92});
        }
      }
    }
    for(const [pageKey,items] of Object.entries(gradingTextAnnotations)){
      const page=pages[Number(pageKey)-1];if(!page||!items?.length)continue;
      const {width,height}=page.getSize(),canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.ceil(width*2));canvas.height=Math.max(1,Math.ceil(height*2));
      const ctx=canvas.getContext("2d");
      items.forEach(item=>{ctx.fillStyle=item.color||"#c62828";ctx.font="600 "+(Number(item.size)||12)*2+"px Arial, 'Microsoft YaHei', sans-serif";ctx.textBaseline="top";ctx.fillText(String(item.text||""),Math.max(0,Math.min(1,Number(item.x)||0))*canvas.width,Math.max(0,Math.min(1,Number(item.y)||0))*canvas.height);});
      const png=await fetch(canvas.toDataURL("image/png")).then(response=>response.arrayBuffer());
      page.drawImage(await pdf.embedPng(png),{x:0,y:0,width,height});
    }
    const output=await pdf.save({useObjectStreams:true});
    if(!(output instanceof Uint8Array)||output.length<8||String.fromCharCode(output[0],output[1],output[2],output[3],output[4])!=="%PDF-")throw new Error("PDF 批阅版生成结果校验失败，原始报告未被修改。");
    return output;
  }
  function undoPdfAnnotation(){
    let newest=null;
    for(const [page,items] of Object.entries(gradingStrokes))for(let i=0;i<(items||[]).length;i++){const at=Number(items[i].createdAt)||0;if(!newest||at>newest.at)newest={kind:"stroke",page,index:i,at};}
    for(const [page,items] of Object.entries(gradingTextAnnotations))for(let i=0;i<(items||[]).length;i++){const at=Number(items[i].createdAt)||0;if(!newest||at>newest.at)newest={kind:"text",page,index:i,at};}
    if(!newest)return;const source=newest.kind==="text"?gradingTextAnnotations:gradingStrokes;source[newest.page].splice(newest.index,1);
    const canvas=document.querySelector('.pdf-review-page[data-page="'+newest.page+'"] .pdf-review-overlay');
    if(canvas)annotationCanvasRedraw(canvas,Number(newest.page));
  }
  function clearPdfAnnotations(){
    if(!confirm("清除本次尚未保存的全部 PDF 批注？"))return;
    gradingStrokes={};gradingTextAnnotations={};
    document.querySelectorAll(".pdf-review-overlay").forEach(canvas=>annotationCanvasRedraw(canvas,Number(canvas.closest(".pdf-review-page")?.dataset.page||1)));
  }
  async function loadGradingPreview(row){
    const host=$("gradingPreviewContent");host.innerHTML="正在加载报告预览…";
    await Promise.all([
      ensureExternalLibrary("pdfjsLib",["https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js","https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"]),
      ensureExternalLibrary("PDFLib",["https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js","https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"])
    ]);
    if(window.pdfjsLib?.GlobalWorkerOptions)window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    gradingPdfBlob=null;gradingStrokes={};gradingTextAnnotations={};$("pdfAnnotationToolbar")?.classList.add("hidden");
    gradingAnnotationSourcePath=row.annotation_source_path||row.storage_path;gradingAnnotationSourceFileName=row.annotation_source_file_name||row.file_name;
    const saved=row.review_annotations;
    if(saved?.strokes||saved?.texts){gradingStrokes=saved.strokes||{};gradingTextAnnotations=saved.texts||{};}else if(saved&&typeof saved==="object"&&!Array.isArray(saved))gradingStrokes=saved;
    const {data,error}=await db.storage.from("lab-reports").download(gradingAnnotationSourcePath);
    if(error){host.textContent="报告读取失败："+friendlyError(error);return;}
    if((row.file_name||"").toLowerCase().endsWith(".pdf")){
      // Keep the original Blob as canonical immutable bytes. PDF.js gets a disposable
      // ArrayBuffer; PDF-Lib obtains a new one later, so worker transfer cannot detach it.
      gradingPdfBlob=data;
      if(!window.PDFLib){host.textContent="PDF 编辑组件未加载，暂时不能保存页面批注。";return;}
      $("pdfAnnotationToolbar")?.classList.remove("hidden");
      try{await renderPdfAnnotation(gradingPdfBlob);}
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
    gradingPdfBlob=null;gradingStrokes={};gradingTextAnnotations={};gradingAnnotationSourcePath=null;gradingAnnotationSourceFileName=null;$("pdfAnnotationToolbar")?.classList.add("hidden");
    $("gradingPreviewContent").innerHTML="点击“打开批阅”后在此处预览 PDF / DOCX。";
  }

  async function saveGrade(){
    if(!gradingRecord)return;
    const saveButtons=[$("saveGrade"),$("savePdfAnnotations")].filter(Boolean);
    if(saveButtons.some(button=>button.disabled))return;
    const score=$("gradeScore").value===""?null:Number($("gradeScore").value);
    if(score!==null&&(score<0||score>100||!Number.isFinite(score))){toast("成绩必须在 0–100 之间。",true);return;}
    const status=$("gradeStatus").value;
    const update={score,feedback:$("gradeFeedback").value.trim(),status,reviewed_by:user.id,reviewed_at:new Date().toISOString()};
    let newPath=null,stage="检查批阅内容";
    const reportId=gradingRecord.id;
    const hasAnnotations=Object.values(gradingStrokes).some(list=>Array.isArray(list)&&list.length)||Object.values(gradingTextAnnotations).some(list=>Array.isArray(list)&&list.length);
    saveButtons.forEach(button=>{button.disabled=true;button.dataset.originalText=button.textContent;button.textContent="正在保存…";});
    try{
      if(gradingPdfBlob&&hasAnnotations){
        stage="生成带批注的 PDF";
        const bytes=await buildAnnotatedPdf();
        stage="准备批阅版文件";
        newPath="reviewed/"+reportId+"/"+crypto.randomUUID()+"_reviewed.pdf";
        const blob=new Blob([bytes],{type:"application/pdf"});
        if(blob.size<8)throw new Error("生成的 PDF 文件为空，未向服务器上传。");
        stage="上传批阅版 PDF";
        const {error:uploadError}=await db.storage.from("lab-reports").upload(newPath,blob,{upsert:false,contentType:"application/pdf"});
        if(uploadError)throw new Error("批阅版 PDF 上传失败："+friendlyError(uploadError));
        update.storage_path=newPath;
        const original=(gradingRecord.file_name||"实验报告.pdf").replace(/\.pdf$/i,"");
        update.file_name=original+"_批阅版.pdf";
        update.review_annotations={strokes:gradingStrokes,texts:gradingTextAnnotations};
        update.annotation_source_path=gradingAnnotationSourcePath||gradingRecord.storage_path;
        update.annotation_source_file_name=gradingAnnotationSourceFileName||gradingRecord.file_name;
        update.submission_version=(gradingRecord.submission_version||1)+1;
      }else if(gradingPdfBlob&&gradingAnnotationSourcePath&&gradingRecord.storage_path!==gradingAnnotationSourcePath){
        stage="恢复原始 PDF 并清除批注";
        update.storage_path=gradingAnnotationSourcePath;update.file_name=gradingAnnotationSourceFileName||gradingRecord.file_name;
        update.annotation_source_path=null;update.annotation_source_file_name=null;update.review_annotations=[];
        update.submission_version=(gradingRecord.submission_version||1)+1;
      }
      stage="写入批阅记录与版本历史";
      const {data:savedRow,error}=await db.from("report_submissions")
        .update(update).eq("id",reportId)
        .select("id,storage_path,file_name,status,submission_version,review_annotations,score,feedback,reviewed_at,reviewed_by")
        .single();
      if(error||!savedRow)throw new Error("报告记录未确认写入："+friendlyError(error||"未返回更新后的报告记录"));
      gradingRecord={...gradingRecord,...savedRow};
      toast(hasAnnotations?"批阅结果与标注版 PDF 已保存并确认，原始文件保留在版本历史中。":"批阅结果已保存并确认。");
      closeGradingPreview();$("gradingPanel").classList.add("hidden");gradingRecord=null;
      await loadReviews();await loadReports();await loadOverview();
    }catch(err){
      const failedStage=stage;
      let recoveryCheck="尚未执行数据库确认";
      if(newPath){
        stage="确认数据库是否已经接收批阅版";
        let confirmedRow=null,confirmError=null;
        try{
          const confirmation=await db.from("report_submissions")
            .select("id,storage_path,file_name,status,submission_version,review_annotations,score,feedback,reviewed_at,reviewed_by")
            .eq("id",reportId).maybeSingle();
          confirmedRow=confirmation.data;confirmError=confirmation.error;
        }catch(checkError){confirmError=checkError;}
        if(!confirmError&&confirmedRow?.storage_path===newPath){
          gradingRecord={...gradingRecord,...confirmedRow};
          toast("保存请求响应中断，但已从数据库确认批阅版 PDF 保存成功。");
          closeGradingPreview();$("gradingPanel").classList.add("hidden");gradingRecord=null;
          await loadReviews();await loadReports();await loadOverview();
          return;
        }
        if(!confirmError&&confirmedRow&&confirmedRow.storage_path!==newPath){
          stage="清理未关联的临时批阅文件";
          const {error:cleanupError}=await db.storage.from("lab-reports").remove([newPath]);
          recoveryCheck=cleanupError?"数据库确认未切换文件，但临时文件清理失败："+friendlyError(cleanupError):"数据库确认尚未切换文件，临时上传文件已清理";
        }else{
          // A failed read is not proof that the UPDATE failed. Keep the uploaded object;
          // deleting it here could break a report whose database commit succeeded.
          recoveryCheck="数据库确认请求也未成功，临时文件已保留以避免误删可能已生效的批阅版；请稍后刷新核对";
        }
      }
      const rawDetail=err?.message||String(err||"未知异常");
      const code=err?.code?("（代码 "+err.code+"）"):"";
      toast("保存批阅失败｜失败阶段："+failedStage+"｜"+rawDetail+code+"。"+recoveryCheck+"。原始报告文件未主动覆盖。",true);
    }finally{
      saveButtons.forEach(button=>{button.disabled=false;button.textContent=button.dataset.originalText||"保存批阅结果";delete button.dataset.originalText;});
    }
  }
  let adminUsersCache=[];
  async function loadUsers(){
    $("usersBody").innerHTML='<tr><td colspan="8" class="muted center">正在加载账号……</td></tr>';
    const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action:"list_users"}});
    if(error||!data?.users){$("usersBody").innerHTML='<tr><td colspan="8" class="center">'+escapeHtml(friendlyError(error||data?.error||"用户列表读取失败"))+'</td></tr>';return;}
    adminUsersCache=data.users;
    renderAdminUsers();
    const warnings=data.role_metadata_sync_warnings||[];
    if(warnings.length)toast("有 "+warnings.length+" 个账号的 Auth 角色字段同步失败；数据库角色仍然有效，可刷新重试。",true);
  }
  function renderAdminUsers(){
    const q=String($("userSearch")?.value||"").trim().toLowerCase();
    const rows=adminUsersCache.filter(p=>!q||[p.email,p.full_name,p.student_no,p.role].some(v=>String(v||"").toLowerCase().includes(q)));
    $("usersBody").innerHTML=rows.map(p=>`<tr>
      <td>${["student","teacher"].includes(p.role)?`<input type="checkbox" class="user-check" data-user-role="${p.role}" value="${p.id}" aria-label="选择${roleName(p.role)} ${escapeHtml(p.full_name||p.email||p.id)}">`:"—"}</td>
      <td>${escapeHtml(p.full_name||"未填写")}</td><td>${escapeHtml(p.email||"—")}</td><td>${escapeHtml(p.student_no||"—")}</td>
      <td><span class="status-pill">${roleName(p.role)}</span></td>
      <td>${p.email_confirmed?"已验证":"待验证"} · ${new Date(p.created_at).toLocaleDateString("zh-CN")}</td>
      <td><select class="profile-role-select" data-role-user="${p.id}"><option value="student" ${p.role==="student"?"selected":""}>学生</option><option value="teacher" ${p.role==="teacher"?"selected":""}>教师</option><option value="admin" ${p.role==="admin"?"selected":""}>管理员</option></select></td>
      <td>${p.role!=="admin"?`<button class="action-link" data-user-reset="${p.id}">发送重置邮件</button>`:"—"} <button class="action-link" data-account-toggle="${p.id}" data-status="${p.account_status||"active"}">${p.account_status==="disabled"?"恢复账号":"停用账号"}</button>${p.must_change_password?'<small class="muted">待修改个人密码</small>':""}</td>
    </tr>`).join("")||'<tr><td colspan="8" class="muted center">没有匹配的账号。</td></tr>';
  }
  async function changeRole(id,role){
    if(!["student","teacher","admin"].includes(role))return;
    if(!confirm("确定将该账号身份调整为“"+roleName(role)+"”吗？此操作会立即改变其访问权限。")){renderAdminUsers();return;}
    const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action:"set_user_role",user_id:id,role}});
    if(error||!data?.ok){toast("身份调整失败："+friendlyError(error||data?.error||"未能保存身份"),true);await loadUsers();return;}
    toast("账号身份已更新；该用户下次登录/刷新后生效。");await loadUsers();
  }
  async function resetOneUser(id){
    const target=adminUsersCache.find(x=>x.id===id);if(!target)return;
    if(!confirm("向 "+target.email+" 发送密码重置验证邮件？邮箱验证后由本人直接设置个人新密码，不使用统一默认密码。"))return;
    try{assertEmailCooldown(target.email);}catch(err){toast(err,true);return;}
    const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action:"reset_password",user_id:id}});
    if(error||!data?.ok){toast("重置邮件发送失败："+friendlyError(error||data?.error||"操作失败"),true);return;}
    markEmailSent(target.email);
    toast("密码重置验证邮件已发送至 "+target.email+"。60 秒内请勿重复发送；邮箱验证后由本人设置新密码。");
  }
  async function changeAccountStatus(id,status){
    const target=adminUsersCache.find(x=>x.id===id);if(!target)return;
    const next=status==="disabled"?"active":"disabled",verb=next==="disabled"?"停用":"恢复";
    if(!confirm("确认"+verb+"账号 "+target.email+"？"+(next==="disabled"?"此后该用户无法继续登录。":"该用户将重新获得登录权限。")))return;
    const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action:"set_account_status",user_id:id,account_status:next}});
    if(error||!data?.ok){toast(verb+"账号失败："+friendlyError(error||data?.error||"操作失败"),true);return;}
    toast("账号已"+verb+"。");await loadUsers();
  }
  async function inviteAdminAccount(){
    const email=$("adminInviteEmail").value.trim(),full_name=$("adminInviteName").value.trim(),student_no=$("adminInviteNo").value.trim(),role=$("adminInviteRole").value;
    if(!email||!full_name){toast("请填写邮箱和姓名。",true);return;}
    try{assertEmailCooldown(email);}catch(err){toast(err,true);return;}
    const btn=$("adminInviteButton");btn.disabled=true;
    try{
      const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action:"admin_invite_account",email,full_name,student_no,role}});
      if(error||!data?.ok)throw error||new Error(data?.error||"邀请账号失败");
      markEmailSent(email);toast("邀请邮件已发送："+email+"（"+roleName(role)+"）。60 秒内请勿重复发送。");
      $("adminInviteEmail").value="";$("adminInviteName").value="";$("adminInviteNo").value="";
      await loadUsers();
    }catch(err){toast(err,true);}
    finally{btn.disabled=false;}
  }

  async function loadClasses(){
    const staff=["teacher","admin"].includes(profile?.role);
    const classesPromise=db.from("classes").select("id,name,course_code,description,teacher_id,join_code,is_active").order("created_at",{ascending:false});
    const auxiliaryPromise=profile.role==="admin"
      ?db.from("profiles").select("id,full_name,student_no,role").in("role",["teacher","admin"]).order("full_name")
      :profile.role==="student"
        ?db.from("class_members").select("class_id").eq("student_id",user.id).eq("status","active")
        :Promise.resolve({data:[],error:null});
    const [classResult,auxiliary]=await Promise.all([classesPromise,auxiliaryPromise]);
    if(classResult.error){$("classList").textContent=friendlyError(classResult.error);return;}
    classesCache=classResult.data||[];
    if(profile.role==="student" && INITIAL_CLASS_JOIN_CODE && !initialJoinCodeApplied && $("joinClassCode")){
      $("joinClassCode").value=INITIAL_CLASS_JOIN_CODE;
      initialJoinCodeApplied=true;
      toast("已识别班级二维码，请核对班级加入码后点击“加入班级”。");
    }
    if($("referenceClass")){
      const activeClasses=classesCache.filter(c=>c.is_active);
      $("referenceClass").innerHTML=activeClasses.map(c=>'<option value="'+c.id+'">'+escapeHtml(c.name)+'</option>').join("");
      if(activeClassId&&activeClasses.some(c=>c.id===activeClassId))$("referenceClass").value=activeClassId;
    }
    const teacherLabel=$("newClassTeacher")?.closest("label");
    if(profile.role==="admin"&&$("newClassTeacher")){
      if(auxiliary.error){toast("教师列表读取失败："+friendlyError(auxiliary.error),true);}
      $("newClassTeacher").innerHTML=(auxiliary.data||[]).map(t=>'<option value="'+t.id+'">'+escapeHtml((t.full_name||"未命名")+" · "+(t.student_no||t.role))+'</option>').join("");
      if(!classEditingId)$("newClassTeacher").value=user.id;
      teacherLabel?.classList.remove("hidden");
    }else teacherLabel?.classList.add("hidden");
    let visible=classesCache;
    if(profile.role==="student"){
      if(auxiliary.error){$("classList").textContent=friendlyError(auxiliary.error);return;}
      const ids=new Set((auxiliary.data||[]).map(x=>x.class_id));
      visible=classesCache.filter(c=>ids.has(c.id)&&c.is_active);
    }
    $("classList").innerHTML=visible.map(c=>`<article class="class-card ${c.is_active?"":"class-inactive"}">
      <strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.course_code||"课程班级")}</small>
      <p>${escapeHtml(c.description||"")}</p>
      ${staff?`<code>加入码：${escapeHtml(c.join_code||"—")}</code>
      <div class="class-card-actions"><button class="btn btn-outline btn-sm" data-class-qr="${c.id}">显示二维码</button><button class="btn btn-outline btn-sm" data-class-edit="${c.id}">修改</button>
      <button class="btn btn-outline btn-sm" data-class-toggle="${c.id}">${c.is_active?"停用/归档":"重新启用"}</button>
      <button class="btn btn-outline btn-sm" data-class-delete="${c.id}">备份并删除</button></div>`: ""}
      ${!c.is_active?'<small class="muted">已停用，历史报告保留</small>':""}
    </article>`).join("")||'<p class="muted">当前没有班级。</p>';
    const active=visible.filter(c=>c.is_active);
    $("classTaskSelect").innerHTML=active.map(c=>'<option value="'+c.id+'">'+escapeHtml(c.name)+'</option>').join("");
    $("reportClass").innerHTML=active.map(c=>'<option value="'+c.id+'">'+escapeHtml(c.name)+'</option>').join("");
    if(!activeClassId||!active.some(c=>c.id===activeClassId))activeClassId=active[0]?.id||null;
    if(activeClassId){$("classTaskSelect").value=activeClassId;$("reportClass").value=activeClassId;}
    $("classManagerTools").classList.toggle("hidden",!staff);
    if($("classBulkDelete"))$("classBulkDelete").textContent=profile.role==="admin"?"批量永久删除学生账号":"批量删除/移出学生";
    if(!activeClassId){
      $("classAssignments").textContent="请先创建或加入有效班级。";
      $("classRosterBody").innerHTML='<tr><td colspan="5">暂无有效班级。</td></tr>';
      if($("studentTaskList"))$("studentTaskList").innerHTML='<p class="muted">您尚未加入有效班级，暂时没有可提交任务。</p>';
      $("reportAssignment").innerHTML="";
      return;
    }
    await loadClassAssignments();
    if(staff&&$("referenceClass")?.value)await loadReferenceSets();
  }
  async function deleteClass(id){
    const row=classesCache.find(c=>c.id===id);if(!row)return;
    if(!confirm("将先下载“"+row.name+"”的完整备份（学生名单、实验任务、报告、Excel、历史版本、分析记录及参考数据）。备份成功并确认下载后才允许删除。继续？"))return;
    const host=$("classBackupDownloadResult");
    if(!host){toast("班级备份区域尚未加载，已取消删除。",true);return;}
    host.classList.remove("hidden");host.textContent="正在准备班级完整备份…";
    try{
      if(!window.JSZip)throw new Error("ZIP 组件未加载，请刷新页面后重试。");
      const result=await invokePlatformFunction("classroom-admin",{body:{action:"export_class_backup",class_id:id}});
      if(result.error||!result.data?.ok)throw new Error(result.error?.message||result.data?.error||"备份清单读取失败。");
      const data=result.data,zip=new JSZip(),root="TJUCPE_"+safeFileName(row.name)+"_完整备份";
      for(const key of ["class","assignments","members","profiles","reports","revisions","experiment_records","reference_sets","counts"]){
        zip.file(root+"/数据/"+key+".json",JSON.stringify(data[key]??null,null,2));
      }
      zip.file(root+"/README.txt","TJUCPE 2.0 班级完整备份。请保留整个 ZIP 及目录结构。");
      let total=0;
      for(let i=0;i<(data.files||[]).length;i++){
        const item=data.files[i];
        if(!item.signed_url)throw new Error("缺少备份文件下载链接："+(item.archive_name||item.path));
        const response=await fetch(item.signed_url);
        if(!response.ok)throw new Error("文件下载失败："+(item.archive_name||item.path)+"（HTTP "+response.status+"）");
        const blob=await response.blob();total+=blob.size;
        if(total>500*1024*1024)throw new Error("班级文件超过 500 MB 浏览器打包保护阈值，班级未删除。");
        const archiveName=String(item.archive_name||("文件_"+i)).split("..").join("_").replace(/^\/+/,"");
        zip.file(root+"/"+archiveName,blob);
      }
      const archive=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:4}});
      if(!archive.size)throw new Error("备份 ZIP 为空。");
      const fileName=data.backup_file_name||("TJUCPE_"+safeFileName(row.name)+"_班级完整备份.zip");
      presentPreparedDownload(archive,fileName,"classBackupDownloadResult");
      host.insertAdjacentHTML("beforeend",'<p class="tiny muted">ZIP 已打包。请先点击“点击下载 ZIP”保存文件，再确认删除。</p><button id="confirmClassBackupDelete" class="btn btn-danger btn-sm">我已下载完整备份，确认永久删除</button>');
      $("confirmClassBackupDelete").addEventListener("click",confirmClassBackupDelete);
      pendingClassDelete={classId:id,backupId:data.backup_id,fileName};
      toast("班级完整备份已生成。下载并确认后才会删除。");
    }catch(err){
      pendingClassDelete=null;host.textContent="备份失败，班级未删除："+friendlyError(err);toast("备份失败，班级未删除："+friendlyError(err),true);
    }
  }
  async function confirmClassBackupDelete(){
    if(!pendingClassDelete)return;
    if(!confirm("请确认完整 ZIP 已保存至本地。确认后将永久删除该班级及所有关联数据。"))return;
    const pending=pendingClassDelete;
    const ack=await invokePlatformFunction("classroom-admin",{body:{action:"ack_class_backup_downloaded",class_id:pending.classId,backup_id:pending.backupId,backup_file_name:pending.fileName}});
    if(ack.error||!ack.data?.ok){toast("备份下载确认失败，班级未删除："+(ack.error?.message||ack.data?.error||"未知错误"),true);return;}
    const deleted=await invokePlatformFunction("classroom-admin",{body:{action:"delete_class",class_id:pending.classId,backup_id:pending.backupId}});
    if(deleted.error||!deleted.data?.ok){toast("班级删除未完成，备份仍保留："+(deleted.error?.message||deleted.data?.error||"未知错误"),true);return;}
    pendingClassDelete=null;if(activeClassId===pending.classId)activeClassId=null;
    toast("班级已备份并删除；报告 "+(deleted.data.report_count??0)+" 份，分析记录 "+(deleted.data.analysis_record_count??0)+" 条。");
    await loadClasses();
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
  function safeFileName(value){
    return String(value||"未命名").replace(/[\\/:*?"<>|]/g,"_").replace(/\\s+/g,"_").slice(0,80);
  }
  function downloadBlob(blob,fileName){
    if(!blob||!blob.size){toast("生成的文件为空，请检查数据表后重试。",true);return;}
    const url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download=fileName;link.style.display="none";
    document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),15000);
  }
  function presentPreparedDownload(blob,fileName,hostId){
    const host=$(hostId);
    if(!host){downloadBlob(blob,fileName);return;}
    if(host.dataset.objectUrl)URL.revokeObjectURL(host.dataset.objectUrl);
    const url=URL.createObjectURL(blob);host.dataset.objectUrl=url;
    host.classList.remove("hidden");
    host.innerHTML='<div class="prepared-download"><div><strong>文件已打包完成</strong><small>'+escapeHtml(fileName)+' · '+(blob.size/1024/1024).toFixed(2)+' MB</small></div><a class="btn btn-primary btn-sm" download="'+escapeHtml(fileName)+'">点击下载 ZIP</a></div>';
    const link=host.querySelector("a");link.href=url;
    link.addEventListener("click",()=>{window.setTimeout(()=>{if(host.dataset.objectUrl===url){URL.revokeObjectURL(url);delete host.dataset.objectUrl;}},60000);},{once:true});
  }
  async function exportAssignmentReports(assignmentId,button){
    const classId=$("classTaskSelect").value||activeClassId;
    if(!classId||!assignmentId){toast("请先选择班级和实验任务。",true);return;}
    if(button){button.disabled=true;button.textContent="正在打包…";}
    try{
      if(!window.JSZip)await ensureExternalLibrary("JSZip",["https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js","https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"]);
      const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action:"export_assignment_reports",class_id:classId,assignment_id:assignmentId}});
      if(error||!data?.ok)throw error||new Error(data?.error||"导出清单读取失败");
      const zip=new JSZip(),folder=zip.folder(safeFileName(data.class_name)+"_"+safeFileName(data.assignment_title));
      const headers=["学生姓名","学号","实验项目","报告文件","提交状态","成绩","教师评语","上传时间","提交时间","报告版本"];
      const csvCell=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
      const rows=data.rows||[];
      const csv="\uFEFF"+[headers,...rows.map(r=>[r.student_name,r.student_no,r.experiment_name,r.file_name,statusLabel(r.status),r.score,r.feedback,r.created_at,r.submitted_at,r.submission_version])].map(r=>r.map(csvCell).join(",")).join("\r\n");
      folder.file("00_任务报告汇总.csv",csv);
      folder.file("数据说明.txt","本压缩包由 TJUCPE 物理化学实验平台导出。\n包含本班该次任务的全体成员状态、报告文件、中文汇总表及与该任务精确关联的数据处理记录。\n只有在学生进入本次任务后保存的数据分析记录才会归入本次任务；历史未关联任务的数据不会按时间猜测归档。\n学生姓名、学号和成绩仅用于课程教学管理。");
      const reportFolder=folder.folder("报告文件");
      const analysisFolder=folder.folder("学生数据处理记录");
      const recordRows=data.records||[];
      const recordHeaders=["学生姓名","学号","实验项目","记录名称","保存时间","算法版本","原始数据 JSON 文件","分析结果 JSON 文件"];
      const recordIndexRows=recordRows.map(record=>{
        const safeBase=safeFileName((record.student_no||"无学号")+"_"+record.student_name+"_"+record.title+"_"+record.record_id);
        const rawFile="原始数据_"+safeBase+".json",analysisFile="分析结果_"+safeBase+".json";
        const common={记录编号:record.record_id,学生姓名:record.student_name,学号:record.student_no,实验项目:record.experiment_name,记录名称:record.title,保存时间:record.created_at,算法版本:record.engine_version};
        const raw=record.raw_data||{},definition=window.TJUCPE_EXPERIMENT_ENGINE?.definitions?.find(x=>x.slug===record.experiment_slug);
        const sourceTables=raw.source_tables||{};
        const chineseTables=Object.entries(sourceTables).map(([tableKey,value])=>{
          const spec=definition?.tables?.find(t=>t.key===tableKey);
          const headers=spec?.headers?.length===spec?.columns?.length?spec.headers:(spec?.columns||[]);
          const rows=String(value??"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>line.includes("\t")?line.split("\t"):line.split(","));
          return {数据表名称:spec?.title||tableKey,字段名称:headers,数据行:rows};
        });
        const chineseData={
          实验名称:definition?.name||record.experiment_name,
          原始录入数据表:chineseTables,
          计算结果字段:raw.export_headers||raw.headers||[],
          计算结果数据:raw.export_rows||raw.rows||[],
          说明:"字段名称采用本实验数据模板中的中文列名；原始数据和计算结果分别保存。"
        };
        const ar=record.analysis||{};
        const chineseAnalysis={
          计算模型:ar.model||"未记录",
          拟合系数:ar.coefficients||null,
          拟合优度_R平方:ar.r2??null,
          残差平方和_SSE:ar.sse??null,
          数据均值:ar.mean??null,
          样本标准差:ar.sd??null,
          横坐标名称:ar.x_label||"",
          横坐标单位:ar.x_unit||"",
          纵坐标名称:ar.y_label||"",
          纵坐标单位:ar.y_unit||"",
          计算摘要:ar.summary||null,
          实验参数:ar.settings||null,
          计算公式:(formulaLibrary[record.experiment_slug]||[]).map(item=>({公式名称:item.title,LaTeX表达式:item.latex,说明:item.note||""}))
        };
        analysisFolder.file(rawFile,JSON.stringify({元数据:common,原始数据:chineseData},null,2));
        analysisFolder.file(analysisFile,JSON.stringify({元数据:common,分析结果:chineseAnalysis},null,2));
        return [record.student_name,record.student_no,record.experiment_name,record.title,record.created_at,record.engine_version,rawFile,analysisFile];
      });
      folder.file("01_学生数据处理记录索引.csv","\uFEFF"+[recordHeaders,...recordIndexRows].map(r=>r.map(csvCell).join(",")).join("\r\n"));

      let downloaded=0,failed=0;
      for(let i=0;i<rows.length;i+=3){
        const batch=rows.slice(i,i+3);
        const results=await Promise.all(batch.map(async row=>{
          if(!row.signed_url)return {row,blob:null,missing:row.status==="missing"};
          try{const response=await fetch(row.signed_url);if(!response.ok)throw new Error("HTTP "+response.status);return {row,blob:await response.blob()};}
          catch(err){return {row,blob:null,error:err};}
        }));
        for(const item of results){
          if(item.missing)continue;
          if(!item.blob){failed++;continue;}
          const ext=(item.row.file_name||"报告.pdf").split(".").pop();
          const fileName=safeFileName((item.row.student_no||"无学号")+"_"+item.row.student_name+"_"+item.row.file_name);
          reportFolder.file(fileName,item.blob);downloaded++;
        }
        if(button)button.textContent="已打包 "+Math.min(i+3,rows.length)+"/"+rows.length;
      }
      folder.file("导出说明.txt","任务："+data.assignment_title+"\n实验："+data.experiment_name+"\n报告记录："+rows.length+"\n成功下载文件："+downloaded+"\n未获取到文件："+failed+"\n未获取文件的记录仍保留在汇总 CSV 中。");
      const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:5}});
      const zipName=safeFileName(data.class_name)+"_"+safeFileName(data.assignment_title)+"_全班实验数据.zip";
      presentPreparedDownload(blob,zipName,"assignmentExportResult");
      const submittedCount=rows.filter(r=>r.status!=="missing").length;toast("打包完成：班级成员 "+rows.length+" 人、已提交报告 "+submittedCount+" 份、报告文件 "+downloaded+" 份、数据处理记录 "+recordRows.length+" 条。请点击页面下方的“点击下载 ZIP”保存文件。"+(failed?"另有 "+failed+" 份报告文件未能下载，汇总表会保留缺失状态。":""));
    }catch(err){toast("班级任务导出失败："+friendlyError(err),true);}
    finally{if(button){button.disabled=false;button.textContent="导出本次班级数据";}}
  }
  async function loadClassAssignments(){
    const classId=$("classTaskSelect").value||activeClassId;activeClassId=classId;
    if(!classId){$("classAssignments").textContent="请先创建或加入班级。";return;}
    const tasksPromise=db.from("experiment_assignments").select("id,title,instructions,due_at,is_open,experiment_catalog(name,slug)").eq("class_id",classId).order("created_at",{ascending:false});
    const rosterPromise=profile.role==="student"?Promise.resolve():loadClassRoster(classId);
    const [taskResult]=await Promise.all([tasksPromise,rosterPromise]);
    const {data,error}=taskResult;
    if(error){$("classAssignments").textContent=friendlyError(error);return;}
    classAssignmentRows=data||[];
    const openTasks=classAssignmentRows.filter(x=>x.is_open);
    $("classAssignments").innerHTML=(data||[]).map(a=>`<div class="assignment-row"><div><strong>${escapeHtml(a.title)}</strong><small>${escapeHtml(a.experiment_catalog?.name||"实验")} · ${a.due_at?new Date(a.due_at).toLocaleString("zh-CN"):"未设截止"}</small><p>${escapeHtml(a.instructions||"")}</p></div><span class="status-pill ${a.is_open?"graded":"draft"}">${a.is_open?"开放":"关闭"}</span>${["teacher","admin"].includes(profile.role)?`<span class="assignment-actions"><button class="btn btn-outline btn-sm" data-assignment-edit="${a.id}">修改</button><button class="btn btn-outline btn-sm" data-assignment-toggle="${a.id}" data-open="${a.is_open}">${a.is_open?"关闭任务":"重新开放"}</button><button class="btn btn-outline btn-sm" data-assignment-export="${a.id}">导出本次班级数据</button></span>`:""}</div>`).join("")||"本班暂无实验任务。";
    if(profile.role==="student")$("studentTaskList").innerHTML=openTasks.map(a=>'<article class="student-task-card"><div><strong>'+escapeHtml(a.title)+'</strong><small>'+escapeHtml(a.experiment_catalog?.name||"实验")+' · '+(a.due_at?"截止 "+new Date(a.due_at).toLocaleString("zh-CN"):"未设截止")+'</small><p>'+escapeHtml(a.instructions||"请按教师发布的 Excel 模板填写实验数据，并与 PDF/Word 报告同步提交。")+'</p></div><div class="student-task-actions"><button class="btn btn-outline btn-sm" data-task-template="'+a.id+'">↓ 下载 Excel 模板</button><button class="btn btn-primary btn-sm" data-task-submit="'+a.id+'" data-class-id="'+classId+'">提交报告</button></div></article>').join("")||'<p class="muted">当前班级暂无开放任务。</p>';
    $("reportAssignment").innerHTML=openTasks.map(a=>`<option value="${a.id}" data-slug="${escapeHtml(a.experiment_catalog?.slug||"")}">${escapeHtml(a.title)}</option>`).join("");
    $("reportClass").value=classId;
    const templateSelect=$("templateAssignmentSelect");
    if(templateSelect){const previous=templateSelect.value;templateSelect.innerHTML=classAssignmentRows.map(a=>`<option value="${a.id}">${escapeHtml(a.title)}${a.is_open?" · 开放":" · 已关闭"}</option>`).join("");if(classAssignmentRows.some(a=>a.id===previous))templateSelect.value=previous;else if(classAssignmentRows.length)templateSelect.value=classAssignmentRows[0].id;}
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
    if(error){host.innerHTML='<tr><td colspan="5">'+escapeHtml(friendlyError(error))+'</td></tr>';return;}
    const ids=(members||[]).map(x=>x.student_id);
    const {data:people}=ids.length?await db.from("profiles").select("id,full_name,student_no,role").in("id",ids):{data:[]};
    const map=Object.fromEntries((people||[]).map(x=>[x.id,x]));
    host.innerHTML=(members||[]).map(m=>{const p=map[m.student_id]||{};return '<tr><td>'+(p.role==="student"?'<input class="class-user-check" type="checkbox" value="'+m.student_id+'">':"—")+'</td><td>'+escapeHtml(p.full_name||"未命名")+'</td><td>'+escapeHtml(p.student_no||"—")+'</td><td>'+escapeHtml(m.status)+'</td><td>'+new Date(m.joined_at).toLocaleDateString("zh-CN")+'</td></tr>';}).join("")||'<tr><td colspan="5">本班尚无学生。</td></tr>';
  }
  async function bulkClassAccountAction(action){
    const classId=$("classTaskSelect").value;
    const ids=Array.from(document.querySelectorAll(".class-user-check:checked")).map(x=>x.value);
    if(!classId||!ids.length){toast("请先选择班级并勾选学生。",true);return;}
    const message=action==="delete_students"
      ?(profile.role==="admin"?"确认永久删除选中学生账号及其报告文件？":"教师操作规则：若学生仅属于当前班级，将永久删除账号；若还属于其他有效班级，则只从本班移出。确认继续？")
      :"向选中学生发送密码重置验证邮件？验证通过后由本人设置新密码。";
    if(!confirm(message))return;
    const {data,error}=await invokePlatformFunction("classroom-admin",{body:{
      action:action==="reset_password"?"reset_passwords":action,class_id:classId,user_ids:ids
    }});
    if(error){toast(error,true);return;}
    const results=data?.results||[];
    if(action==="reset_password"){
      const ok=results.filter(x=>x.ok).length;
      $("accountActionResult").textContent=results.map(x=>(x.email||x.user_id)+(x.ok?"：已发送":"："+friendlyError(x.error))).join("\n");
      toast("密码重置验证邮件已发送："+ok+"/"+ids.length+" 个成功。");
    }else{
      const deleted=results.filter(x=>x.operation==="permanently_deleted").length,removed=results.filter(x=>x.operation==="removed_from_this_class").length;
      toast(profile.role==="admin"?"账号永久删除完成："+deleted+"/"+ids.length+" 个成功。":"教师操作完成：永久删除 "+deleted+" 个账号，移出本班 "+removed+" 人。");
      await loadClassRoster(classId);
    }
  }
  async function loadQrLibrary(){
    if(window.QRCode?.toCanvas)return window.QRCode;
    if(!qrLibraryPromise){
      qrLibraryPromise=(async()=>{
        const urls=["https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js","https://unpkg.com/qrcode@1.5.4/build/qrcode.min.js"];
        let lastError;
        for(const src of urls){
          try{await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=src;script.async=true;script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error("二维码组件加载失败"));};document.head.appendChild(script);});if(window.QRCode?.toCanvas)return window.QRCode;}
          catch(err){lastError=err;}
        }
        throw lastError||new Error("二维码组件不可用");
      })().catch(err=>{qrLibraryPromise=null;throw err;});
    }
    return qrLibraryPromise;
  }
  async function showClassQr(classId){
    const row=classesCache.find(item=>item.id===classId);if(!row?.join_code){toast("未找到班级加入码。",true);return;}
    const dialog=$("classQrDialog"),canvas=$("classQrCanvas"),title=$("classQrTitle"),link=$("classQrLink"),code=$("classQrCode");
    title.textContent=row.name+" · 班级加入二维码";code.textContent=row.join_code;
    const joinUrl=new URL(APP_REDIRECT_URL);joinUrl.searchParams.set("join",row.join_code);link.value=joinUrl.toString();
    dialog.showModal();
    try{const qr=await loadQrLibrary();await qr.toCanvas(canvas,joinUrl.toString(),{width:260,margin:2,errorCorrectionLevel:"M"});}
    catch(err){const ctx=canvas.getContext("2d");canvas.width=520;canvas.height=160;ctx.clearRect(0,0,520,160);ctx.fillStyle="#203447";ctx.font="20px sans-serif";ctx.fillText("二维码暂不可用，请复制班级加入链接",12,48);ctx.font="16px monospace";ctx.fillText(row.join_code,12,88);toast("二维码组件加载失败，班级加入码仍可复制使用。",true);}
  }
  async function joinClass(){
    const code=$("joinClassCode").value.trim().toUpperCase();if(!code){toast("请输入教师提供的班级加入码。",true);return;}
    const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action:"join_class",join_code:code}});
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
    if(/\\.xlsx?$/i.test(file.name))await ensureExternalLibrary("XLSX",["https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js","https://unpkg.com/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"]);
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
      const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action:"invite_students",class_id:classId,students}});
      if(error)throw error;
      const results=data?.results||[],ok=results.filter(x=>x.ok).length;
      $("accountActionResult").textContent=results.map(x=>(x.email||x.user_id||"")+(x.ok?"：成功":"："+(x.error||"失败"))).join("\n");
      toast("导入处理完成："+ok+"/"+students.length+" 个账号成功邀请。");$("rosterFile").value="";
    }catch(err){toast("名单导入失败："+friendlyError(err),true);}
  }
  let classAssignmentRows=[];
  let teacherWorkbookAssignmentId=null;
  let gradingReferenceSheets=[];
  let gradingAnalysisChart=null;

  function populateTemplateDesigner(){
    const select=$("referenceExperiment");
    if(!select)return;
    const choices=(catalogRowsCache||[]).filter(row=>row.is_active);
    const current=select.value;
    select.innerHTML=choices.map(row=>'<option value="'+escapeHtml(row.slug)+'">'+escapeHtml(row.code+" · "+row.name)+'</option>').join("");
    if(choices.some(row=>row.slug===current))select.value=current;
  }
  function assignmentWorkbookSnapshot(row){
    const relation=row?.assignment_templates;
    const record=Array.isArray(relation)?relation[0]:relation;
    return record?.workbook_snapshot||null;
  }
  async function assignmentDefinition(row){
    const slug=row?.experiment_catalog?.slug;
    if(window.TJUCPE_EXPERIMENT_ENGINE?.definitions)return window.TJUCPE_EXPERIMENT_ENGINE.definitions.find(item=>item.slug===slug)||null;
    if(!slug)return null;
    const {data}=await db.from("experiment_catalog").select("slug,code,name,config").eq("slug",slug).maybeSingle();
    return data?{slug:data.slug,code:data.code,name:data.name,tables:data.config?.template_tables||[]}:null;
  }
  async function downloadStudentAssignmentTemplate(id){
    if(profile?.role!=="student")return;
    const row=classAssignmentRows.find(item=>item.id===id);
    if(!row){toast("任务已更新，请刷新页面后重试。",true);return;}
    try{
      const {data,error}=await db.from("assignment_templates").select("workbook_snapshot").eq("assignment_id",id).maybeSingle();
      if(error)throw error;
      const snapshot=data?.workbook_snapshot||null;
      const def=snapshot?null:await assignmentDefinition(row);
      await window.TJUCPEWorkbook.downloadXlsx(snapshot,safeFileName(row.title||"实验")+"_Excel数据模板.xlsx",def);
      toast(snapshot?"已下载教师发布的 Excel 模板。":"已下载通用 Excel 模板；教师尚未保存任务专属模板。");
    }catch(error){toast("模板下载失败："+friendlyError(error),true);}
  }
  async function openTeacherWorkbookEditor(){
    if(!["teacher","admin"].includes(profile?.role)){toast("仅教师和管理员可设计模板。",true);return;}
    const id=$("templateAssignmentSelect")?.value,row=classAssignmentRows.find(item=>item.id===id);
    if(!row){toast("请先选择一个实验任务。",true);return;}
    const button=$("openTeacherWorkbook");button.disabled=true;
    $("teacherWorkbookStatus").textContent="正在载入在线 Excel……";
    try{
      const {data,error}=await db.from("assignment_templates").select("workbook_snapshot").eq("assignment_id",id).maybeSingle();
      if(error)throw error;
      await window.TJUCPEWorkbook.mount("teacherWorkbookEditor",data?.workbook_snapshot||assignmentWorkbookSnapshot(row),await assignmentDefinition(row),row.title);
      teacherWorkbookAssignmentId=id;
      $("teacherWorkbookStatus").textContent="已打开工作簿。可直接编辑单元格、公式、格式和工作表；编辑完成后请点击保存。";
    }catch(error){$("teacherWorkbookStatus").textContent="Excel 编辑器加载失败："+friendlyError(error);toast(friendlyError(error),true);}
    finally{button.disabled=false;}
  }
  async function saveTeacherWorkbookTemplate(){
    const id=$("templateAssignmentSelect")?.value;
    if(!["teacher","admin"].includes(profile?.role)||!id||id!==teacherWorkbookAssignmentId){toast("请先打开当前任务的在线 Excel 模板。",true);return;}
    const button=$("saveTeacherWorkbook");button.disabled=true;
    try{
      const snapshot=window.TJUCPEWorkbook.snapshot(),size=new TextEncoder().encode(JSON.stringify(snapshot)).length;
      if(size>390000)throw new Error("模板超过 390 KB 限制，请减少空白格式区域或拆分工作簿。");
      const {error}=await db.from("assignment_templates").upsert({assignment_id:id,workbook_snapshot:snapshot,schema_version:1,updated_by:user.id},{onConflict:"assignment_id"});
      if(error)throw error;
      const row=classAssignmentRows.find(item=>item.id===id);
      if(row)row.assignment_templates={workbook_snapshot:snapshot};
      $("teacherWorkbookStatus").textContent="保存成功。学生现在可以在任务卡片中下载此模板（约 "+Math.ceil(size/1024)+" KB）。";
      toast("任务 Excel 模板已保存。");
    }catch(error){toast("模板保存失败："+friendlyError(error),true);}
    finally{button.disabled=false;}
  }
  async function downloadTeacherWorkbookTemplate(){
    const id=$("templateAssignmentSelect")?.value;
    if(!id||id!==teacherWorkbookAssignmentId){toast("请先打开模板编辑器。",true);return;}
    const row=classAssignmentRows.find(item=>item.id===id);
    try{await window.TJUCPEWorkbook.downloadXlsx(window.TJUCPEWorkbook.snapshot(),safeFileName(row?.title||"实验")+"_教师模板.xlsx",await assignmentDefinition(row));}
    catch(error){toast("模板导出失败："+friendlyError(error),true);}
  }
  async function readWorkbookBlob(blob){
    await window.TJUCPEWorkbook.ensureXlsx();
    const workbook=XLSX.read(await blob.arrayBuffer(),{type:"array"});
    return workbook.SheetNames.slice(0,20).map(name=>({name,rows:XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:null,raw:true}).slice(0,3000)}));
  }
  async function loadSelectedReferenceForGrading(){
    const row=gradingReferenceSets.find(item=>item.id===$("gradingReferenceSelect")?.value);
    gradingReferenceSheets=[];
    if(row?.storage_path){
      const {data,error}=await db.storage.from("lab-reports").download(row.storage_path);
      if(error){$("gradingDataSummary").textContent="教师参考文件读取失败："+friendlyError(error);return;}
      gradingReferenceSheets=await readWorkbookBlob(data);
    }else if(row?.data_json?.sheets)gradingReferenceSheets=row.data_json.sheets;
    renderGradingComparison();
  }
  function gradingSheetInfo(sheet){
    const rows=Array.isArray(sheet?.rows)?sheet.rows.filter(Array.isArray):[];
    const head=rows.findIndex(row=>row.some(value=>typeof value==="string"&&value.trim()));
    const headerIndex=head<0?0:head,headers=rows[headerIndex]||[],data=rows.slice(headerIndex+1),columns=[];
    const width=Math.max(headers.length,...data.map(row=>row.length));
    for(let c=0;c<width;c++)if(data.reduce((n,row)=>n+(Number.isFinite(numericValue(row[c]))?1:0),0)>=2)columns.push({index:c,label:String(headers[c]??("第"+(c+1)+"列"))});
    return {headers,data,columns};
  }
  function populateGradingAnalysisControls(){
    const select=$("gradingAnalysisSheet");if(!select)return;
    const old=select.value;
    select.innerHTML=gradingStudentSheets.map((sheet,index)=>'<option value="'+index+'">'+escapeHtml(sheet.name)+'</option>').join("");
    if(gradingStudentSheets.some((sheet,index)=>String(index)===old))select.value=old;
    populateGradingAnalysisColumns();
  }
  function populateGradingAnalysisColumns(){
    const sheet=gradingStudentSheets[Number($("gradingAnalysisSheet")?.value)||0];
    const x=$("gradingAnalysisX"),y=$("gradingAnalysisY");
    if(!sheet||!x||!y){if($("gradingAnalysisResult"))$("gradingAnalysisResult").textContent="没有可用的 Excel 数据附件。";return;}
    const info=gradingSheetInfo(sheet),options=info.columns.map(col=>'<option value="'+col.index+'">'+escapeHtml(col.label)+'</option>').join("");
    x.innerHTML=options;y.innerHTML=options;
    if(info.columns.length>1)y.value=String(info.columns[1].index);
    $("gradingAnalysisStart").value="1";$("gradingAnalysisEnd").value=String(Math.max(1,info.data.length));
    $("gradingAnalysisResult").textContent=info.columns.length>1?"选择数据列和拟合范围后运行分析。":"该工作表中至少需要两列有效数值。";
  }
  function runGradingDataAnalysis(){
    if(!["teacher","admin"].includes(profile?.role))return;
    const sheet=gradingStudentSheets[Number($("gradingAnalysisSheet").value)||0];
    if(!sheet){toast("没有可分析的工作表。",true);return;}
    const info=gradingSheetInfo(sheet),xCol=Number($("gradingAnalysisX").value),yCol=Number($("gradingAnalysisY").value);
    const start=Math.max(1,Number($("gradingAnalysisStart").value)||1)-1;
    const end=Math.min(info.data.length,Number($("gradingAnalysisEnd").value)||info.data.length);
    const points=info.data.slice(start,end).map(row=>({x:numericValue(row[xCol]),y:numericValue(row[yCol])})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    if(points.length<2){toast("所选范围内至少需要两个有效数据点。",true);return;}
    const degree=({linear:1,quadratic:2,cubic:3})[$("gradingAnalysisModel").value];
    let fit=null;if(degree){try{fit=polyFit(points,degree);}catch(error){toast(error.message,true);return;}}
    const mean=points.reduce((sum,p)=>sum+p.y,0)/points.length;
    const sd=Math.sqrt(points.reduce((sum,p)=>sum+Math.pow(p.y-mean,2),0)/Math.max(1,points.length-1));
    const sorted=[...points].sort((a,b)=>a.x-b.x);
    const curve=fit?Array.from({length:100},(_,i)=>{const x=sorted[0].x+(sorted.at(-1).x-sorted[0].x)*i/99;return {x,y:fit.predict(x)};}):[];
    if(gradingAnalysisChart)gradingAnalysisChart.destroy();
    gradingAnalysisChart=new Chart($("gradingAnalysisCanvas").getContext("2d"),{type:"scatter",data:{datasets:[
      {label:"学生原始数据",data:points,showLine:false,pointRadius:4},
      ...(fit?[{label:"拟合曲线",data:curve,showLine:true,pointRadius:0,borderWidth:2}]:[])
    ]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{position:"bottom"}},scales:{x:{type:"linear",title:{display:true,text:info.headers[xCol]||"X"}},y:{title:{display:true,text:info.headers[yCol]||"Y"}}}}});
    $("gradingAnalysisResult").textContent="有效点 "+points.length+"；Y 均值 "+mean.toFixed(6)+"；样本标准差 "+sd.toFixed(6)+(fit?"；R² "+fit.r2.toFixed(6)+"；SSE "+fit.sse.toExponential(4):"；未拟合。");
  }
  async function loadReferenceSets(){
    const host=$("referenceSetList"),classId=$("referenceClass")?.value;
    if(!host||!classId||!["teacher","admin"].includes(profile?.role))return;
    const {data,error}=await db.from("experiment_reference_sets")
      .select("id,title,experiment_slug,source_file_name,notes,storage_path,file_size_bytes,mime_type,updated_at")
      .eq("class_id",classId).order("updated_at",{ascending:false}).limit(100);
    if(error){host.textContent="参考工作簿读取失败："+friendlyError(error);return;}
    host.innerHTML=(data||[]).map(row=>'<div class="reference-set-row"><div><strong>'+escapeHtml(row.title)+'</strong><small>'+escapeHtml(experimentName(row.experiment_slug))+' · '+escapeHtml(row.source_file_name||"")+(row.file_size_bytes?" · "+Math.ceil(row.file_size_bytes/1024)+" KB":"")+' · '+new Date(row.updated_at).toLocaleString("zh-CN")+'</small><p>'+escapeHtml(row.notes||"")+'</p></div><button class="btn btn-outline btn-sm" data-reference-delete="'+row.id+'">删除</button></div>').join("")||"该班级尚无参考数据。";
  }
  async function saveReferenceSet(){
    if(!["teacher","admin"].includes(profile?.role)){toast("仅教师和管理员可上传参考数据。",true);return;}
    const classId=$("referenceClass").value,slug=$("referenceExperiment").value,file=$("referenceFile").files?.[0],title=$("referenceTitle").value.trim();
    if(!classId||!slug||!file||!title){toast("请填写名称并选择班级、实验与参考工作簿。",true);return;}
    if(file.size>20*1024*1024){toast("参考工作簿不能超过 20 MB。",true);return;}
    let storagePath=null;
    try{
      if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw new Error("参考数据仅支持 XLSX、XLS 或 CSV 文件。");
      storagePath="teacher-reference/"+classId+"/"+crypto.randomUUID()+"_"+safeFileName(file.name);
      const {error:uploadError}=await db.storage.from("lab-reports").upload(storagePath,file,{upsert:false,contentType:file.type||"application/octet-stream",cacheControl:"31536000"});
      if(uploadError)throw uploadError;
      const {error}=await db.from("experiment_reference_sets").insert({
        class_id:classId,experiment_slug:slug,title,source_file_name:file.name,storage_path:storagePath,
        file_size_bytes:file.size,mime_type:file.type||null,data_json:{schema_version:2,storage:"lab-reports"},
        notes:$("referenceNotes").value.trim(),created_by:user.id
      });
      if(error)throw error;
      $("referenceTitle").value="";$("referenceFile").value="";$("referenceNotes").value="";
      toast("参考工作簿已放入私有文件存储，数据库只记录元信息。");await loadReferenceSets();
    }catch(error){
      if(storagePath)await db.storage.from("lab-reports").remove([storagePath]);
      toast("参考工作簿上传失败："+friendlyError(error),true);
    }
  }
  async function deleteReferenceSet(id){
    if(!confirm("删除这份教师参考工作簿？学生报告不会受到影响。"))return;
    const {data:row,error:readError}=await db.from("experiment_reference_sets").select("id,storage_path").eq("id",id).maybeSingle();
    if(readError||!row){toast("参考数据读取失败："+friendlyError(readError||"未找到记录"),true);return;}
    const {error}=await db.from("experiment_reference_sets").delete().eq("id",id);
    if(error){toast("参考数据删除失败："+friendlyError(error),true);return;}
    if(row.storage_path){
      const result=await db.storage.from("lab-reports").remove([row.storage_path]);
      if(result.error)toast("数据库记录已删除，但 Storage 文件清理失败，请管理员检查。",true);
      else toast("参考工作簿及记录已删除。");
    }else toast("参考数据记录已删除。");
    await loadReferenceSets();
  }
  function numericValue(value){
    if(value===null||value===undefined||String(value).trim()==="")return NaN;
    const number=Number(String(value).replace(/,/g,"").trim());return Number.isFinite(number)?number:NaN;
  }
  function compareWorkbookSheet(sheet){
    const rows=Array.isArray(sheet?.rows)?sheet.rows.filter(Array.isArray):[];if(rows.length<3)return null;
    let headerIndex=rows.findIndex(row=>row.some(value=>typeof value==="string"&&value.trim()!==""));if(headerIndex<0)headerIndex=0;
    const headers=rows[headerIndex]||[],data=rows.slice(headerIndex+1),width=Math.max(headers.length,...data.map(row=>row.length)),cols=[];
    for(let c=0;c<width;c++)if(data.filter(row=>Number.isFinite(numericValue(row[c]))).length>=2)cols.push(c);
    if(cols.length<2)return null;
    const xCol=cols[0],series=cols.slice(1).map(col=>({label:String(headers[col]??("Y"+(col+1))),data:data.map(row=>({x:numericValue(row[xCol]),y:numericValue(row[col])})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))})).filter(item=>item.data.length>=2);
    return series.length?{xLabel:String(headers[xCol]??"X"),series}:null;
  }
  function renderGradingComparison(){
    const host=$("gradingCompareCharts"),summary=$("gradingDataSummary");if(!host||!summary)return;
    host.querySelectorAll("canvas").forEach(canvas=>{const chart=Chart.getChart(canvas);if(chart)chart.destroy();});
    if(!gradingRecord?.data_file_path){host.innerHTML='<p class="muted">此为 1.0 历史报告，没有单独的 Excel 数据附件；不会自动补造数据。</p>';summary.textContent="旧报告仍可正常批阅。";return;}
    const reference=gradingReferenceSets.find(row=>row.id===$("gradingReferenceSelect")?.value),refSheets=gradingReferenceSheets.length?gradingReferenceSheets:(reference?.data_json?.sheets||[]),charts=[];
    gradingStudentSheets.forEach((sheet,index)=>{
      const student=compareWorkbookSheet(sheet);if(!student)return;
      const refSheet=refSheets.find(item=>item.name===sheet.name)||refSheets[index]||refSheets[0],teacher=refSheet?compareWorkbookSheet(refSheet):null;
      const datasets=student.series.map(item=>({label:"学生 · "+item.label,data:item.data,showLine:false,pointRadius:4}));
      if(teacher)teacher.series.forEach(item=>datasets.push({label:"教师参考 · "+item.label,data:item.data,showLine:false,pointStyle:"rectRot",pointRadius:4}));
      charts.push({name:sheet.name,xLabel:student.xLabel,datasets});
    });
    if(!charts.length){host.innerHTML='<p class="muted">已读取工作簿，但没有识别到至少两列有效数值数据。请核对表头与数据行。</p>';summary.textContent="未生成对照图。";return;}
    host.innerHTML=charts.map((item,index)=>'<div class="grading-data-chart"><strong>'+escapeHtml(item.name)+'</strong><canvas id="gradingCompareCanvas'+index+'"></canvas></div>').join("");
    charts.forEach((item,index)=>new Chart($("gradingCompareCanvas"+index).getContext("2d"),{type:"scatter",data:{datasets:item.datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{position:"bottom"}},scales:{x:{type:"linear",title:{display:true,text:item.xLabel}},y:{title:{display:true,text:"实验测量值"}}}}}));
    summary.textContent="已读取 "+gradingStudentSheets.length+" 张学生工作表；"+(reference?"正在叠加教师参考数据："+reference.title:"当前仅显示学生原始数据。");
  }
  async function loadGradingDataComparison(row){
    gradingStudentSheets=[];gradingReferenceSheets=[];gradingReferenceSets=[];
    const host=$("gradingCompareCharts"),select=$("gradingReferenceSelect");
    host.textContent="正在按需读取学生 Excel 与参考工作簿……";
    await Promise.all([
      window.TJUCPEWorkbook.ensureXlsx(),
      ensureExternalLibrary("Chart",["https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js","https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.7/chart.umd.min.js"])
    ]);
    if(row.class_id){
      const {data,error}=await db.from("experiment_reference_sets")
        .select("id,title,data_json,source_file_name,storage_path,file_size_bytes,mime_type")
        .eq("class_id",row.class_id).eq("experiment_slug",row.experiment_slug)
        .order("updated_at",{ascending:false}).limit(30);
      if(error)throw new Error("教师参考数据读取失败："+friendlyError(error));
      gradingReferenceSets=data||[];
    }
    select.innerHTML='<option value="">不选择参考数据</option>'+gradingReferenceSets.map(item=>'<option value="'+item.id+'">'+escapeHtml(item.title)+'</option>').join("");
    if(gradingReferenceSets.length){select.value=gradingReferenceSets[0].id;await loadSelectedReferenceForGrading();}
    if(row.data_file_path){
      const {data,error}=await db.storage.from("lab-reports").download(row.data_file_path);
      if(error)throw new Error("学生 Excel 数据读取失败："+friendlyError(error));
      gradingStudentSheets=await readWorkbookBlob(data);
    }
    renderGradingComparison();populateGradingAnalysisControls();
  }
  async function loadExperimentCatalogManager(){
    const host=$("experimentCatalogAdminList");if(!host)return;
    const {data,error}=await db.from("experiment_catalog").select("id,slug,code,name,category,description,config,is_active").order("code");
    if(error){host.textContent=friendlyError(error);return;}
    catalogRowsCache=data||[];populateTemplateDesigner();
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
  let classCreateRunning=false;
  async function createClass(){
    if(classCreateRunning)return;
    const name=$("newClassName").value.trim();
    if(!name){toast("请填写班级名称。",true);$("newClassName").focus();return;}
    const wasEditing=!!classEditingId;
    const teacherId=profile.role==="admin"?($("newClassTeacher").value||user.id):user.id;
    const payload={name,course_code:$("newClassCode").value.trim(),description:$("newClassDesc").value.trim()};
    const button=$("createClass"),originalText=button.textContent,status=$("createClassStatus");
    const setStatus=(message,isError=false)=>{if(status){status.textContent=message;status.classList.toggle("error",isError);status.classList.toggle("success",!isError&&!!message);}};
    classCreateRunning=true;button.disabled=true;button.textContent=wasEditing?"正在保存…":"正在创建班级…";
    setStatus(wasEditing?"正在保存班级信息…":"正在校验权限并创建班级…");
    try{
      let createdClass=null;
      if(wasEditing){
        const result=await db.from("classes").update({...payload,...(profile.role==="admin"?{teacher_id:teacherId}:{})}).eq("id",classEditingId);
        if(result.error)throw result.error;
        createdClass=classesCache.find(item=>item.id===classEditingId)||null;
      }else{
        const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action:"create_class",...payload,...(profile.role==="admin"?{teacher_id:teacherId}:{})}});
        if(error||!data?.ok||!data?.class?.id)throw error||new Error(data?.error||"服务端未返回新班级编号。");
        createdClass=data.class;
      }
      setStatus(wasEditing?"班级信息已更新。":"班级创建成功，班级码已生成。");
      toast(wasEditing?"班级信息已更新。":"班级创建成功。");
      clearClassForm();await loadClasses();
      if(!wasEditing&&createdClass?.id){activeClassId=createdClass.id;if($("classTaskSelect"))$("classTaskSelect").value=createdClass.id;showClassQr(createdClass.id);}
    }catch(err){
      const message=err?.details?String(err.message||"")+" · "+String(err.details):err;
      const friendly=friendlyError(message);
      setStatus("班级"+(wasEditing?"修改":"创建")+"失败："+friendly,true);
      toast("班级"+(wasEditing?"修改":"创建")+"失败："+friendly,true);
    }finally{classCreateRunning=false;button.disabled=false;button.textContent=originalText;}
  }
  async function publishAssignment(){
    const slug=$("taskExperiment").value,cls=$("classTaskSelect").value,exp=experiments.find(x=>x.slug===slug);
    if(!slug||!cls||!exp){toast("请先选择班级和实验项目。",true);return;}
    const {data:catalog,error:catalogError}=await db.from("experiment_catalog").select("id,is_active").eq("slug",slug).maybeSingle();
    if(catalogError||!catalog?.is_active){toast("实验目录不存在或已停用，不能发布任务。",true);return;}
    const {data:created,error}=await db.from("experiment_assignments").insert({class_id:cls,experiment_id:catalog.id,title:$("taskTitle").value.trim()||exp.name,instructions:$("taskInstructions").value.trim(),due_at:$("taskDue").value?new Date($("taskDue").value).toISOString():null,created_by:user.id,is_open:true,required:true}).select("id").single();
    if(error){toast("任务发布失败："+error.message,true);return;}toast("任务已发布。请在下方在线 Excel 编辑器中设计并保存该任务模板。");await loadClassAssignments();if(created?.id&&$("templateAssignmentSelect"))$("templateAssignmentSelect").value=created.id;
  }
  async function loadSystemAdmin(){
    const {data,error}=await db.from("audit_logs").select("action,details,created_at").order("created_at",{ascending:false}).limit(100);
    $("auditLogBody").innerHTML=error?escapeHtml(friendlyError(error)):(data||[]).map(x=>`<tr><td>${new Date(x.created_at).toLocaleString("zh-CN")}</td><td>${escapeHtml(x.action)}</td><td>${escapeHtml(JSON.stringify(x.details||{}))}</td></tr>`).join("")||'<tr><td colspan="3">暂无审计记录</td></tr>';
  }
  async function bulkAccountAction(action){
    const selected=Array.from(document.querySelectorAll(".user-check:checked")).map(x=>x.value);
    const eligible=selected.filter(id=>{
      const role=adminUsersCache.find(x=>x.id===id)?.role;
      return action==="delete_students"?role==="student":["student","teacher"].includes(role);
    });
    if(!eligible.length){toast(action==="delete_students"?"请先勾选需要删除的学生账号。":"请先勾选需要重置密码的学生或教师账号。",true);return;}
    if(eligible.length!==selected.length)toast(action==="delete_students"?"已自动排除教师和管理员账号，只会删除学生。":"已自动排除管理员账号，只会重置学生和教师密码。");
    if(action==="delete_students"){
      if(!confirm("确认永久删除选中的 "+eligible.length+" 个学生账号及其报告文件？此操作不可撤销。"))return;
      const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action,user_ids:eligible}});
      if(error){toast(error,true);return;}
      const rows=data?.results||[],ok=rows.filter(x=>x.ok).length;
      $("accountActionResult").textContent=rows.map(x=>(x.email||x.user_id||"")+(x.ok?"：删除成功":"："+friendlyError(x.error))).join("\n");
      toast("批量删除完成："+ok+"/"+eligible.length+" 个成功。");await loadUsers();
    }else{
      const sendable=eligible.filter(id=>emailCooldownRemaining(adminUsersCache.find(x=>x.id===id)?.email)===0);
      const skipped=eligible.length-sendable.length;
      if(!sendable.length){toast("选中的账号刚发送过邮件，请稍后再试。",true);return;}
      if(!confirm("向选中的 "+sendable.length+" 个学生/教师账号发送密码重置验证邮件？"+(skipped?"另有 "+skipped+" 个账号仍在发送冷却时间内，将跳过。":"")+"邮箱验证通过后，由本人设置新密码。"))return;
      const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action:"reset_passwords",user_ids:sendable}});
      if(error){toast(error,true);return;}
      const rows=data?.results||[],ok=rows.filter(x=>x.ok).length;
      rows.filter(x=>x.ok).forEach(row=>{const target=adminUsersCache.find(x=>x.id===row.user_id);if(target)markEmailSent(target.email);});
      $("accountActionResult").textContent=rows.map(x=>(x.email||x.user_id||"")+(x.ok?"：重置邮件已发送":"："+friendlyError(x.error))).join("\n");
      toast("重置验证邮件发送完成："+ok+"/"+sendable.length+" 个成功。"+(skipped?" 已跳过 "+skipped+" 个冷却中的账号。":""));
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
      await ensureExternalLibrary("mammoth",["https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js","https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js"]);
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
        const {data,error}=await db.auth.signUp({email,password,options:{data:{full_name:fullName,student_no:studentNo},emailRedirectTo:APP_REDIRECT_URL}});
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
    try{
      await loadProfile();
      if(profile.account_status==="disabled"){
        showAuth();toast("该账号已被管理员停用，请联系平台管理员。",true);await db.auth.signOut();return;
      }
      if(profile.must_change_password){
        showAuth();setAuthMode("forced-change");
        $("newPassword").value="";
        return;
      }
      showApp();updateUserChrome();
      if(["teacher","admin"].includes(profile?.role)){
        await ensureExternalLibrary("TJUCPE_EXPERIMENT_ENGINE",["experiment-engine.js?v=20261111-tjucpe-v2.1"]);
        await renderCatalog();
      }
      $("todayDate").textContent=new Date().toLocaleDateString("zh-CN",{year:"numeric",month:"long",day:"numeric",weekday:"long"});
      go("overview");
    }catch(err){showAuth();toast(err.message||"读取用户资料失败。",true);await db.auth.signOut();}
  }
  async function completeVerifiedPasswordRecovery(reason="recovery"){
    if(recoveryCompletionRunning)return;
    recoveryCompletionRunning=true;
    const passwordMode=reason==="invite"?"forced-change":"recovery";
    showAuth();setAuthMode(passwordMode);
    try{
      // The email link proves control of the mailbox. The user chooses a private password.
      const {data,error}=await invokePlatformFunction("classroom-admin",{body:{action:"mark_password_change_required"}});
      if(error||!data?.ok)throw error||new Error("账号安全状态更新失败。");
      window.history.replaceState(null,"",APP_REDIRECT_URL);
      setAuthMode(passwordMode);
      $("newPassword").value="";
      $("newPassword").focus();
      toast(reason==="invite"?"邀请邮箱验证成功！请在下方设置您自己的登录密码。":"邮箱验证成功！本次邮件已授权密码重置，请在下方设置您自己的新密码。");
    }catch(err){
      setAuthMode(passwordMode);
      toast("邮箱验证成功，但账号安全状态更新失败："+friendlyError(err),true);
    }finally{recoveryCompletionRunning=false;}
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
      output.textContent="浏览器无法访问 Supabase Auth。请检查网络、浏览器扩展/代理或项目 URL。详情："+friendlyError(err);
    }finally{
      button.disabled=false;button.textContent="重新检测 Supabase 连接";
    }
  }
  async function confirmPendingEmailToken(){
    if(!pendingEmailToken)return;
    const pending=pendingEmailToken,button=$("confirmEmailToken");
    button.disabled=true;button.textContent="正在验证邮箱…";
    try{
      const {data,error}=await db.auth.verifyOtp({token_hash:pending.tokenHash,type:pending.type});
      if(error)throw error;
      user=data?.user||data?.session?.user||null;
      if(!user)throw new Error("邮箱验证已完成，但 Supabase 没有建立登录会话。请重新发送验证邮件。");
      pendingEmailToken=null;
      window.history.replaceState(null,"",APP_REDIRECT_URL);
      if(pending.type==="recovery"||pending.type==="invite"){
        await completeVerifiedPasswordRecovery(pending.type==="invite"?"invite":"recovery");
      }else{
        await enterApp();
      }
    }catch(err){
      pendingEmailToken=null;
      window.history.replaceState(null,"",APP_REDIRECT_URL);
      showAuth();setAuthMode("login");
      toast("邮箱验证失败："+friendlyError(err)+"。请重新发送最新验证邮件，再点击邮件链接。",true);
    }finally{
      button.disabled=false;
      button.textContent="确认邮箱并继续";
    }
  }
  async function start(){
    $("connectionHint").textContent=db?"前端密钥格式通过检查；请检测 Supabase 连接。":"Supabase 配置缺失或 Publishable key 格式不正确。";
    if(!hasConfig||!window.supabase?.createClient){
      $("connectionHint").classList.add("error");$("authSubmit").disabled=true;
    }
    $("testConnection").addEventListener("click",testSupabaseConnection);
    if(!db)return;
    let recoveryDetected=false,handlingEmailToken=false;
    const redirectParams=new URLSearchParams(window.location.hash.replace(/^#/,""));
    const queryParams=new URLSearchParams(window.location.search);
    const redirectError=redirectParams.get("error_description")||queryParams.get("error_description");
    if(redirectError){showAuth();toast("邮箱验证失败："+friendlyError(redirectError),true);}
    db.auth.onAuthStateChange((event,session)=>{
      if(event==="PASSWORD_RECOVERY"&&session){
        recoveryDetected=true;user=session.user;profile=null;showAuth();setAuthMode("recovery");
        // Do not make another async Auth call inside this callback. The start() flow below
        // completes the recovery exactly once after the verified session is available.
      }else if(!session&&!handlingEmailToken){user=null;profile=null;showAuth();setAuthMode("login");}
    });

    const tokenHash=queryParams.get("token_hash");
    const tokenType=queryParams.get("type");
    if(tokenHash){
      const allowedTypes=["email","recovery","invite","signup","magiclink","email_change"];
      if(!allowedTypes.includes(tokenType||"")){
        window.history.replaceState(null,"",APP_REDIRECT_URL);
        showAuth();setAuthMode("login");
        toast("邮箱链接类型无效，请重新发送验证邮件。",true);
        return;
      }
      pendingEmailToken={tokenHash,type:tokenType};
      showAuth();setAuthMode("confirm-email");
      return;
    }

    const {data:{session},error:sessionError}=await db.auth.getSession();
    if(sessionError)toast(sessionError,true);
    if(session){
      user=session.user;
      const recoveryInUrl=recoveryDetected||redirectParams.get("type")==="recovery"||queryParams.get("auth")==="recovery";
      if(recoveryInUrl){
        showAuth();setAuthMode("recovery");
        await completeVerifiedPasswordRecovery();
        window.history.replaceState(null,"",APP_REDIRECT_URL);
      }else await enterApp();
    }else showAuth();
  }
  function bindEvents(){
    document.body.addEventListener("change",e=>{const fileInput=e.target.closest(".experiment-table-file");if(fileInput)importExperimentTableFile(fileInput);});
    $("authForm").addEventListener("submit",handleAuthSubmit);
    $("confirmEmailToken").addEventListener("click",confirmPendingEmailToken);
    $("cancelEmailToken").addEventListener("click",()=>{pendingEmailToken=null;window.history.replaceState(null,"",APP_REDIRECT_URL);setAuthMode("login");});
    $("toggleAuth").addEventListener("click",()=>setAuthMode(authMode==="login"?"register":"login"));
    $("backToLogin").addEventListener("click",()=>setAuthMode("login"));
    $("saveNewPassword").addEventListener("click",async()=>{
      const password=$("newPassword").value;
      if(password.length<10){toast("个人新密码至少需要 10 位。",true);return;}
      $("saveNewPassword").disabled=true;
      try{
        const {error}=await db.auth.updateUser({password});
        if(error)throw error;
        const {data, error:flagError}=await invokePlatformFunction("classroom-admin",{body:{action:"complete_password_change"}});
        if(flagError||!data?.ok)throw flagError||new Error("个人密码状态更新失败。");
        $("newPassword").value="";
        window.history.replaceState(null,"",APP_REDIRECT_URL);
        toast("个人密码已更新，正在进入平台。");
        await enterApp();
      }catch(err){toast(err,true);}
      finally{$("saveNewPassword").disabled=false;}
    });
    $("forgotPassword").addEventListener("click",async()=>{
      if(!db)return;
      const email=$("email").value.trim();
      if(!email){toast("请先输入注册邮箱。",true);return;}
      $("forgotPassword").disabled=true;
      try{
        assertEmailCooldown(email);
        const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:APP_REDIRECT_URL});
        if(error)throw error;
        markEmailSent(email);toast("重置验证邮件已发送。请只打开最新的一封邮件；60 秒内请勿重复请求。邮箱验证通过后，可在网页直接设置个人新密码。");
      }catch(err){toast(err,true);}
      finally{$("forgotPassword").disabled=false;}
    });
    $("signOut").addEventListener("click",async()=>{await db.auth.signOut();});
    $("signOutMobile")?.addEventListener("click",async()=>{await db.auth.signOut();});
    $("mainNav").addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(b)go(b.dataset.page);});
    document.body.addEventListener("click",e=>{
      const goto=e.target.closest("[data-goto]");if(goto){if(goto.dataset.experiment)openExperiment(goto.dataset.experiment);else go(goto.dataset.goto);}
      const taskTemplate=e.target.closest("[data-task-template]");if(taskTemplate)downloadStudentAssignmentTemplate(taskTemplate.dataset.taskTemplate);
      const open=e.target.closest("[data-open-experiment]");if(open){activeAssignmentId=null;openExperiment(open.dataset.openExperiment);}
      const txtTemplate=e.target.closest("[data-template-txt]");if(txtTemplate&&currentExperiment)downloadExperimentTxt(currentExperiment.slug,txtTemplate.dataset.templateTxt);
      const xlsxTemplate=e.target.closest("[data-template-xlsx]");if(xlsxTemplate){if(currentExperiment)downloadExperimentWorkbook(currentExperiment.slug);else toast("请先打开一个实验，再下载该实验专属模板。",true);}
      const report=e.target.closest("[data-report-download]");if(report)downloadReport(report.dataset.reportDownload);
      const fb=e.target.closest("[data-report-feedback]");if(fb)showFeedback(fb.dataset.reportFeedback);
      const withdraw=e.target.closest("[data-report-withdraw]");if(withdraw)withdrawReport(withdraw.dataset.reportWithdraw);
      const edit=e.target.closest("[data-report-edit]");if(edit)editReport(edit.dataset.reportEdit);
      const del=e.target.closest("[data-report-delete]");if(del)deleteReport(del.dataset.reportDelete);
      const review=e.target.closest("[data-review-open]");if(review)openGrading(review.dataset.reviewOpen);
      const reviewDownload=e.target.closest("[data-review-download]");if(reviewDownload)downloadReviewFile(reviewDownload.dataset.reviewDownload);
      const classEdit=e.target.closest("[data-class-edit]");if(classEdit)editClass(classEdit.dataset.classEdit);
      const classDelete=e.target.closest("[data-class-delete]");if(classDelete)deleteClass(classDelete.dataset.classDelete);
      const refDelete=e.target.closest("[data-reference-delete]");if(refDelete)deleteReferenceSet(refDelete.dataset.referenceDelete);
      const taskSubmit=e.target.closest("[data-task-submit]");if(taskSubmit){activeAssignmentId=taskSubmit.dataset.taskSubmit;$("reportUploadPanel").classList.remove("hidden");$("reportClass").value=taskSubmit.dataset.classId;$("classTaskSelect").value=taskSubmit.dataset.classId;loadClassAssignments().then(()=>{$("reportAssignment").value=taskSubmit.dataset.taskSubmit;$("reportTitle").value=taskSubmit.closest(".student-task-card").querySelector("strong").textContent;$("reportUploadPanel").scrollIntoView({behavior:"smooth",block:"center"});});}
      const classToggle=e.target.closest("[data-class-toggle]");if(classToggle)toggleClass(classToggle.dataset.classToggle);
      const assignmentEdit=e.target.closest("[data-assignment-edit]");if(assignmentEdit)editAssignment(assignmentEdit.dataset.assignmentEdit);
      const assignmentToggle=e.target.closest("[data-assignment-toggle]");if(assignmentToggle)toggleAssignment(assignmentToggle.dataset.assignmentToggle,assignmentToggle.dataset.open==="true");
      const assignmentExport=e.target.closest("[data-assignment-export]");if(assignmentExport)exportAssignmentReports(assignmentExport.dataset.assignmentExport,assignmentExport);
      const catalogEdit=e.target.closest("[data-catalog-edit]");if(catalogEdit)editCatalogItem(catalogEdit.dataset.catalogEdit);
      const catalogToggle=e.target.closest("[data-catalog-toggle]");if(catalogToggle)toggleCatalogItem(catalogToggle.dataset.catalogToggle,catalogToggle.dataset.active==="true");
      const resetUser=e.target.closest("[data-user-reset]");if(resetUser)resetOneUser(resetUser.dataset.userReset);
      const accountToggle=e.target.closest("[data-account-toggle]");if(accountToggle)changeAccountStatus(accountToggle.dataset.accountToggle,accountToggle.dataset.status);
    });
    $("backExperiments").addEventListener("click",()=>go("experiments"));
    $("runAnalysis").addEventListener("click",runAnalysis);
    $("runDedicatedAnalysis").addEventListener("click",runDedicatedAnalysis);
    $("renderPythonPlot").addEventListener("click",generatePythonPlot);
    $("clearData").addEventListener("click",()=>{$("dataInput").value="";clearAnalysis();$("dataCount").textContent="等待输入数据";});
    $("dataFile").addEventListener("change",async e=>{const file=e.target.files[0];if(file)$("dataInput").value=await file.text();$("dataCount").textContent=file?file.name:"等待输入数据";});
    $("downloadCsv").addEventListener("click",downloadCsv);
    $("downloadChart").addEventListener("click",()=>{const image=$("pythonPlotImage");if(image&&!image.classList.contains("hidden")&&image.src){const a=document.createElement("a");a.href=image.src;a.download=(currentExperiment?.slug||"analysis")+"-matplotlib.png";a.click();}else if(window.Plotly&&plotlyGraph){Plotly.downloadImage("analysisPlotly",{format:"png",filename:(currentExperiment?.slug||"analysis")+"-selection",width:1800,height:1200,scale:2});}else if(chart){const a=document.createElement("a");a.href=chart.toBase64Image("image/png",1);a.download=(currentExperiment?.slug||"analysis")+".png";a.click();}});
    $("saveRecord").addEventListener("click",saveRecord);
    $("newReport").addEventListener("click",()=>{$("reportUploadPanel").classList.remove("hidden");loadClasses();});
    $("closeReportPanel").addEventListener("click",()=>$("reportUploadPanel").classList.add("hidden"));
    $("reportFile").addEventListener("change",e=>$("reportFileName").textContent=e.target.files[0]?.name||"点击选择报告文件");
    $("reportAssignment").addEventListener("change",e=>{activeAssignmentId=e.target.value||null;});
    $("submitReport").addEventListener("click",submitReport);
    $("refreshReviews").addEventListener("click",loadReviews);
    $("refreshUsers").addEventListener("click",loadUsers);
    $("userSearch").addEventListener("input",renderAdminUsers);
    $("adminInviteButton").addEventListener("click",inviteAdminAccount);
    $("bulkDeleteUsers").addEventListener("click",()=>bulkAccountAction("delete_students"));
    $("bulkResetUsers").addEventListener("click",()=>bulkAccountAction("reset_password"));
    $("closeGrading").addEventListener("click",()=>{$("gradingPanel").classList.add("hidden");closeGradingPreview();});
    $("closeGradingPreview").addEventListener("click",closeGradingPreview);
    $("classBulkReset").addEventListener("click",()=>bulkClassAccountAction("reset_password"));
    $("classBulkDelete").addEventListener("click",()=>bulkClassAccountAction("delete_students"));
    $("saveGrade").addEventListener("click",saveGrade);
    $("savePdfAnnotations").addEventListener("click",saveGrade);
    $("usersBody").addEventListener("change",e=>{const el=e.target.closest("[data-role-user]");if(el){el.disabled=true;changeRole(el.dataset.roleUser,el.value).finally(()=>{el.disabled=false;});}});
    $("classList").addEventListener("click",e=>{const qr=e.target.closest("[data-class-qr]");if(qr)showClassQr(qr.dataset.classQr);});
    $("copyClassQrLink")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("classQrLink").value);toast("班级加入链接已复制。");}catch{ $("classQrLink").select();document.execCommand("copy");toast("班级加入链接已复制。");}});
    $("closeClassQr")?.addEventListener("click",()=>$("classQrDialog").close());
    $("createClass").addEventListener("click",e=>{e.preventDefault();createClass();});
    $("createClassForm").addEventListener("submit",e=>{e.preventDefault();createClass();});
    $("clearClassForm").addEventListener("click",clearClassForm);
    $("publishAssignment").addEventListener("click",publishAssignment);
    $("joinClass").addEventListener("click",joinClass);
    $("importRoster").addEventListener("click",importClassRoster);
    $("reportClass").addEventListener("change",()=>{$("classTaskSelect").value=$("reportClass").value;loadClassAssignments();});
    $("classTaskSelect").addEventListener("change",loadClassAssignments);
    $("adminTestConnection").addEventListener("click",runAdminConnectionCheck);
    $("saveCatalogItem").addEventListener("click",saveCatalogItem);
    $("clearCatalogForm").addEventListener("click",clearCatalogForm);
    $("openTeacherWorkbook")?.addEventListener("click",openTeacherWorkbookEditor);
    $("saveTeacherWorkbook")?.addEventListener("click",saveTeacherWorkbookTemplate);
    $("downloadTeacherWorkbook")?.addEventListener("click",downloadTeacherWorkbookTemplate);
    $("templateAssignmentSelect")?.addEventListener("change",()=>{if(teacherWorkbookAssignmentId&&teacherWorkbookAssignmentId!==$("templateAssignmentSelect").value)$("teacherWorkbookStatus").textContent="任务已切换；点击“打开在线 Excel 编辑器”载入对应工作簿。";});
    $("referenceClass")?.addEventListener("change",loadReferenceSets);
    $("saveReferenceSet")?.addEventListener("click",saveReferenceSet);
    $("gradingReferenceSelect")?.addEventListener("change",loadSelectedReferenceForGrading);
    $("gradingAnalysisSheet")?.addEventListener("change",populateGradingAnalysisColumns);
    $("runGradingAnalysis")?.addEventListener("click",runGradingDataAnalysis);
    $("loadMoreReviews")?.addEventListener("click",()=>loadReviews(true));
    $("pdfAnnotationMode")?.addEventListener("change",e=>{pdfAnnotationMode=e.target.value;});
    $("undoPdfAnnotation").addEventListener("click",undoPdfAnnotation);
    $("clearPdfAnnotations").addEventListener("click",clearPdfAnnotations);
    $("closeReportViewer").addEventListener("click",()=>$("reportViewerDialog").close());
    $("closeFeedback").addEventListener("click",()=>$("feedbackDialog").close());
    $("profileButton").addEventListener("click",()=>toast((profile?.full_name||user?.email||"账户")+" · "+roleName(profile?.role)));
  }
  bindEvents();
  start();
})();