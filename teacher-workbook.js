(function () {
  "use strict";
  const VERSION = "1.4.0";
  const CDN = ["https://cdn.jsdelivr.net/npm/", "https://unpkg.com/"];
  const resourceCache = new Map();
  let univer = null;
  let univerAPI = null;
  let activeWorkbook = null;

  const styles = [
    "@univerjs/design@" + VERSION + "/lib/index.css",
    "@univerjs/ui@" + VERSION + "/lib/index.css",
    "@univerjs/docs-ui@" + VERSION + "/lib/index.css",
    "@univerjs/sheets-ui@" + VERSION + "/lib/index.css",
    "@univerjs/sheets-formula-ui@" + VERSION + "/lib/index.css",
    "@univerjs/sheets-numfmt-ui@" + VERSION + "/lib/index.css"
  ];
  const scripts = [
    "react@18.3.1/umd/react.production.min.js",
    "react-dom@18.3.1/umd/react-dom.production.min.js",
    "rxjs@7.8.2/dist/bundles/rxjs.umd.min.js",
    "@wendellhu/redi@1.1.3/dist/umd/index.js",
    "@wendellhu/redi@1.1.3/dist/umd/react-bindings/index.js",
    "@univerjs/themes@" + VERSION + "/lib/umd/index.js",
    "@univerjs/protocol@" + VERSION + "/lib/umd/index.js",
    "@univerjs/core@" + VERSION + "/lib/umd/index.js",
    "@univerjs/network@" + VERSION + "/lib/umd/index.js",
    "@univerjs/rpc@" + VERSION + "/lib/umd/index.js",
    "@univerjs/design@" + VERSION + "/lib/umd/index.js",
    "@univerjs/engine-render@" + VERSION + "/lib/umd/index.js",
    "@univerjs/engine-formula@" + VERSION + "/lib/umd/index.js",
    "@univerjs/drawing@" + VERSION + "/lib/umd/index.js",
    "@univerjs/telemetry@" + VERSION + "/lib/umd/index.js",
    "@univerjs/ui@" + VERSION + "/lib/umd/index.js",
    "@univerjs/docs@" + VERSION + "/lib/umd/index.js",
    "@univerjs/docs-ui@" + VERSION + "/lib/umd/index.js",
    "@univerjs/sheets@" + VERSION + "/lib/umd/index.js",
    "@univerjs/sheets-ui@" + VERSION + "/lib/umd/index.js",
    "@univerjs/sheets-formula@" + VERSION + "/lib/umd/index.js",
    "@univerjs/sheets-formula-ui@" + VERSION + "/lib/umd/index.js",
    "@univerjs/sheets-numfmt@" + VERSION + "/lib/umd/index.js",
    "@univerjs/sheets-numfmt-ui@" + VERSION + "/lib/umd/index.js",
    "@univerjs/core@" + VERSION + "/lib/umd/facade.js",
    "@univerjs/engine-formula@" + VERSION + "/lib/umd/facade.js",
    "@univerjs/ui@" + VERSION + "/lib/umd/facade.js",
    "@univerjs/docs@" + VERSION + "/lib/umd/facade.js",
    "@univerjs/docs-ui@" + VERSION + "/lib/umd/facade.js",
    "@univerjs/sheets@" + VERSION + "/lib/umd/facade.js",
    "@univerjs/sheets-ui@" + VERSION + "/lib/umd/facade.js",
    "@univerjs/sheets-formula@" + VERSION + "/lib/umd/facade.js",
    "@univerjs/sheets-numfmt@" + VERSION + "/lib/umd/facade.js",
    "@univerjs/design@" + VERSION + "/lib/umd/locale/zh-CN.js",
    "@univerjs/ui@" + VERSION + "/lib/umd/locale/zh-CN.js",
    "@univerjs/sheets@" + VERSION + "/lib/umd/locale/zh-CN.js",
    "@univerjs/sheets-ui@" + VERSION + "/lib/umd/locale/zh-CN.js",
    "@univerjs/docs-ui@" + VERSION + "/lib/umd/locale/zh-CN.js",
    "@univerjs/sheets-formula-ui@" + VERSION + "/lib/umd/locale/zh-CN.js",
    "@univerjs/sheets-numfmt-ui@" + VERSION + "/lib/umd/locale/zh-CN.js"
  ];
  function loadResource(path, tag) {
    const key = tag + ":" + path;
    if (resourceCache.has(key)) return resourceCache.get(key);
    const promise = (async () => {
      for (const base of CDN) {
        const element = document.createElement(tag);
        const url = base + path;
        element.crossOrigin = "anonymous";
        if (tag === "link") {
          element.rel = "stylesheet";
          element.href = url;
        } else {
          element.src = url;
          element.async = false;
        }
        try {
          await new Promise((resolve, reject) => {
            element.onload = resolve;
            element.onerror = () => reject(new Error(url));
            document.head.appendChild(element);
          });
          return;
        } catch (_) {
          element.remove();
        }
      }
      throw new Error("在线 Excel 组件加载失败：" + path + "。请检查网络或稍后重试。");
    })();
    resourceCache.set(key, promise);
    promise.catch(() => resourceCache.delete(key));
    return promise;
  }
  async function ensureXlsx() {
    if (window.XLSX && window.XLSX.utils && window.XLSX.write) return window.XLSX;
    await loadResource("xlsx-js-style@1.2.0/dist/xlsx.bundle.js", "script");
    if (!window.XLSX || !window.XLSX.utils) throw new Error("Excel 文件组件未能初始化。");
    return window.XLSX;
  }
  async function ensureUniver() {
    if (univer && univerAPI) return;
    for (const path of styles) await loadResource(path, "link");
    for (const path of scripts) await loadResource(path, "script");
    if (!window.React || !window.ReactDOM) throw new Error("React 运行环境未加载。");
    window.React.jsx = (type, props, key) => window.React.createElement(type, key === undefined ? props : { ...props, key });
    window.React.jsxs = window.React.jsx;
    const core = window.UniverCore || {};
    const { Univer, LocaleType, mergeLocales, UniverInstanceType } = core;
    const { FUniver } = window.UniverCoreFacade || {};
    if (!Univer || !FUniver) throw new Error("在线 Excel 组件未完整加载。");
    const plugins = [
      [window.UniverEngineRender, "UniverRenderEnginePlugin"],
      [window.UniverEngineFormula, "UniverFormulaEnginePlugin"],
      [window.UniverUi, "UniverUIPlugin"],
      [window.UniverDocs, "UniverDocsPlugin"],
      [window.UniverDocsUi, "UniverDocsUIPlugin"],
      [window.UniverSheets, "UniverSheetsPlugin"],
      [window.UniverSheetsUi, "UniverSheetsUIPlugin"],
      [window.UniverSheetsFormula, "UniverSheetsFormulaPlugin"],
      [window.UniverSheetsFormulaUi, "UniverSheetsFormulaUIPlugin"],
      [window.UniverSheetsNumfmt, "UniverSheetsNumfmtPlugin"],
      [window.UniverSheetsNumfmtUi, "UniverSheetsNumfmtUIPlugin"]
    ];
    for (const [module, name] of plugins) {
      if (!module || !module[name]) throw new Error("在线 Excel 插件缺失：" + name);
    }
    univer = new Univer({
      locale: LocaleType.ZH_CN,
      locales: {
        [LocaleType.ZH_CN]: mergeLocales(
          window.UniverDesignZhCN,
          window.UniverUiZhCN,
          window.UniverSheetsZhCN,
          window.UniverSheetsUiZhCN,
          window.UniverDocsUiZhCN,
          window.UniverSheetsFormulaUiZhCN,
          window.UniverSheetsNumfmtUiZhCN
        )
      }
    });
    univer.registerPlugin(window.UniverEngineRender.UniverRenderEnginePlugin);
    univer.registerPlugin(window.UniverEngineFormula.UniverFormulaEnginePlugin);
    univer.registerPlugin(window.UniverUi.UniverUIPlugin, { container: "teacherWorkbookEditor" });
    univer.registerPlugin(window.UniverDocs.UniverDocsPlugin);
    univer.registerPlugin(window.UniverDocsUi.UniverDocsUIPlugin);
    univer.registerPlugin(window.UniverSheets.UniverSheetsPlugin);
    univer.registerPlugin(window.UniverSheetsUi.UniverSheetsUIPlugin);
    univer.registerPlugin(window.UniverSheetsFormula.UniverSheetsFormulaPlugin);
    univer.registerPlugin(window.UniverSheetsFormulaUi.UniverSheetsFormulaUIPlugin);
    univer.registerPlugin(window.UniverSheetsNumfmt.UniverSheetsNumfmtPlugin);
    univer.registerPlugin(window.UniverSheetsNumfmtUi.UniverSheetsNumfmtUIPlugin);
    univerAPI = FUniver.newAPI(univer);
  }
  function colName(n) {
    let result = "";
    for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
    return result;
  }
  function buildRows(def) {
    const rows = [
      ["TJUCPE · 实验数据工作簿", def && def.name ? def.name : ""],
      ["填写提示", "请按照实验指导书录入原始数据；公式和分析由教师在批阅时处理。"],
      []
    ];
    const tables = Array.isArray(def && def.tables) ? def.tables : [];
    for (const table of tables) {
      const headers = Array.isArray(table.headers) && table.headers.length ? table.headers : (table.columns || []);
      rows.push(["数据表", table.title || table.key || "实验数据"]);
      rows.push(headers.map(x => String(x || "")));
      for (let i = 0; i < 40; i++) rows.push(headers.map(() => ""));
      rows.push([]);
    }
    if (!tables.length) {
      rows.push(["测量序号", "实验数据", "单位/说明"]);
      for (let i = 0; i < 40; i++) rows.push(["", "", ""]);
    }
    const width = Math.max(2, ...rows.map(row => row.length));
    return rows.map(row => row.concat(Array(Math.max(0, width - row.length)).fill("")));
  }
  async function mount(containerId, snapshot, def, title) {
    if (!document.getElementById(containerId)) throw new Error("未找到在线 Excel 编辑区域。");
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    try {
      await ensureUniver();
      if (activeWorkbook && univerAPI) {
        const unitId = activeWorkbook.getId && activeWorkbook.getId();
        if (unitId) univerAPI.disposeUnit(unitId);
      }
      const workbookData = snapshot && typeof snapshot === "object" && snapshot.sheets
        ? snapshot
        : { id: "tjucpe-" + Date.now(), name: title || "实验数据模板" };
      activeWorkbook = univerAPI.createWorkbook(workbookData);
      if (!snapshot || !snapshot.sheets) {
        const rows = buildRows(def);
        const width = Math.max(1, ...rows.map(row => row.length));
        const lastCol = colName(width - 1);
        const sheet = activeWorkbook.getActiveSheet();
        sheet.getRange("A1:" + lastCol + rows.length).setValues(rows);
        try { sheet.getRange("A1:" + lastCol + "1").setWrap(true); } catch (_) {}
      }
      return activeWorkbook;
    } catch (error) {
      container.innerHTML = "";
      throw error;
    }
  }
  function snapshot() {
    if (!univerAPI) throw new Error("请先打开在线 Excel 编辑器。");
    const workbook = univerAPI.getActiveWorkbook();
    if (!workbook) throw new Error("当前没有可保存的工作簿。");
    return workbook.save();
  }
  function styleFromUniver(snapshotData, cell) {
    if (!cell || !cell.s) return undefined;
    const stylesMap = snapshotData.styles || {};
    const style = typeof cell.s === "object" ? cell.s : stylesMap[cell.s];
    if (!style || typeof style !== "object") return undefined;
    const out = {};
    if (style.bl || style.it || style.ff || style.fs) {
      out.font = {};
      if (style.bl) out.font.bold = true;
      if (style.it) out.font.italic = true;
      if (style.ff) out.font.name = style.ff;
      if (style.fs) out.font.sz = Number(style.fs) || 11;
      const color = style.cl && (style.cl.rgb || style.cl);
      if (typeof color === "string") out.font.color = { rgb: color.replace("#", "").toUpperCase() };
    }
    const fill = style.bg && (style.bg.rgb || style.bg);
    if (typeof fill === "string") out.fill = { patternType: "solid", fgColor: { rgb: fill.replace("#", "").toUpperCase() } };
    if (style.ht !== undefined || style.vt !== undefined || style.tb !== undefined) {
      out.alignment = {
        horizontal: style.ht === 2 ? "center" : style.ht === 3 ? "right" : "left",
        vertical: style.vt === 2 ? "center" : "bottom",
        wrapText: !!style.tb
      };
    }
    return Object.keys(out).length ? out : undefined;
  }
  function snapshotToWorkbook(XLSX, snapshotData, def, title) {
    const wb = XLSX.utils.book_new();
    if (!snapshotData || !snapshotData.sheets || !snapshotData.sheetOrder || !snapshotData.sheetOrder.length) {
      const tables = Array.isArray(def && def.tables) ? def.tables : [];
      if (!tables.length) {
        const ws = XLSX.utils.aoa_to_sheet(buildRows(def));
        XLSX.utils.book_append_sheet(wb, ws, "实验数据");
      } else {
        tables.forEach((table, index) => {
          const headers = Array.isArray(table.headers) && table.headers.length ? table.headers : (table.columns || []);
          const rows = [headers, ...Array.from({ length: 40 }, () => headers.map(() => ""))];
          const ws = XLSX.utils.aoa_to_sheet(rows);
          ws["!cols"] = headers.map(() => ({ wch: 20 }));
          headers.forEach((_, col) => {
            const address = XLSX.utils.encode_cell({ r: 0, c: col });
            if (ws[address]) ws[address].s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: "176B68" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true } };
          });
          XLSX.utils.book_append_sheet(wb, ws, String(table.title || ("数据表" + (index + 1))).slice(0, 31));
        });
      }
      return wb;
    }
    for (const sheetId of snapshotData.sheetOrder) {
      const source = snapshotData.sheets[sheetId];
      if (!source) continue;
      const cellData = source.cellData || {};
      const rowNums = Object.keys(cellData).map(Number).filter(Number.isFinite);
      const maxRow = Math.max(0, ...rowNums);
      const maxCol = Math.max(0, ...rowNums.flatMap(r => Object.keys(cellData[r] || {}).map(Number).filter(Number.isFinite)));
      const rows = [];
      for (let r = 0; r <= maxRow; r++) {
        const row = [];
        for (let c = 0; c <= maxCol; c++) {
          const cell = cellData[r] && cellData[r][c];
          let value = cell && typeof cell === "object" ? (cell.v !== undefined ? cell.v : "") : (cell === undefined ? "" : cell);
          row[c] = value;
        }
        rows.push(row);
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      for (let r = 0; r <= maxRow; r++) {
        for (let c = 0; c <= maxCol; c++) {
          const cell = cellData[r] && cellData[r][c];
          if (!cell || typeof cell !== "object") continue;
          const address = XLSX.utils.encode_cell({ r, c });
          if (cell.f && ws[address]) ws[address].f = String(cell.f).replace(/^=/, "");
          const style = styleFromUniver(snapshotData, cell);
          if (style && ws[address]) ws[address].s = style;
        }
      }
      ws["!cols"] = Array.from({ length: maxCol + 1 }, () => ({ wch: 18 }));
      XLSX.utils.book_append_sheet(wb, ws, String(source.name || source.sheetName || ("数据表" + (wb.SheetNames.length + 1))).slice(0, 31));
    }
    if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildRows(def)), "实验数据");
    return wb;
  }
  async function downloadXlsx(snapshotData, fileName, def) {
    const XLSX = await ensureXlsx();
    const wb = snapshotToWorkbook(XLSX, snapshotData, def, fileName);
    const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
    if (!bytes || !bytes.byteLength) throw new Error("Excel 工作簿生成失败。");
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = String(fileName || "实验数据模板.xlsx").replace(/[\\/:*?"<>|]/g, "_");
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  window.TJUCPEWorkbook = {
    version: VERSION,
    ensureXlsx,
    mount,
    snapshot,
    downloadXlsx,
    dispose: function () {
      try { if (univer) univer.dispose(); } catch (_) {}
      univer = null; univerAPI = null; activeWorkbook = null;
    }
  };
})();