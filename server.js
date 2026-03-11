#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 4173);

loadEnvFile(path.join(ROOT_DIR, ".env.local"));

const TOKENS = {
  ETH: {
    symbol: "ETH",
    name: "Ether",
    address: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    risk: "major",
    stable: false
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    risk: "stable",
    stable: true
  },
  AERO: {
    symbol: "AERO",
    name: "Aerodrome Finance",
    address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
    decimals: 18,
    risk: "defi",
    stable: false
  },
  BRETT: {
    symbol: "BRETT",
    name: "Brett",
    address: "0x532f27101965dd16442E59d40670FaF5eBB142E4",
    decimals: 18,
    risk: "meme",
    stable: false
  }
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const OKX_CONFIG = {
  key: process.env.OKX_DEX_API_KEY || "",
  secret: process.env.OKX_DEX_SECRET_KEY || "",
  passphrase: process.env.OKX_DEX_PASSPHRASE || ""
};

const server = http.createServer((req, res) => {
  void handleRequest(req, res);
});

const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`Trade Jury running at http://${HOST}:${PORT}/index.html`);
});

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        okxConfigured: hasOkxCredentials(),
        providerMode: hasOkxCredentials() ? "okx-preferred" : "fallback-only"
      });
    }

    if (url.pathname === "/api/hearing" && req.method === "POST") {
      const body = await readJsonBody(req);
      const payload = normalizePayload(body);
      const result = await buildHearing(payload);
      return sendJson(res, 200, result);
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    return serveStatic(url.pathname, res, req.method === "HEAD");
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const index = line.indexOf("=");
    if (index === -1) {
      continue;
    }

    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function hasOkxCredentials() {
  return Boolean(OKX_CONFIG.key && OKX_CONFIG.secret && OKX_CONFIG.passphrase);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[".json"],
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function serveStatic(urlPath, res, headOnly) {
  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  const safeRelativePath = path.normalize(requestedPath).replace(/^[/\\]+/u, "");
  const filePath = path.join(ROOT_DIR, safeRelativePath);
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });

  if (headOnly) {
    res.end();
    return;
  }

  fs.createReadStream(resolvedPath).pipe(res);
}

function normalizePayload(body) {
  const inferredSymbols = inferSymbols(body.intent || "");
  const fromToken = TOKENS[body.fromToken] || TOKENS[inferredSymbols.fromSymbol] || TOKENS.ETH;
  const toToken = TOKENS[body.toToken] || TOKENS[inferredSymbols.toSymbol] || TOKENS.USDC;

  if (fromToken.symbol === toToken.symbol) {
    throw new Error("卖出和买入代币不能相同");
  }

  const inferredAmount = inferAmount(body.intent || "");
  const amountString = sanitizeAmount(body.amount) || inferredAmount || defaultAmountForToken(fromToken.symbol);

  return {
    chainId: 8453,
    chainLabel: "Base · 8453",
    riskMode: ["conservative", "balanced", "aggressive"].includes(body.riskMode)
      ? body.riskMode
      : "balanced",
    intent:
      (body.intent || "").trim() ||
      `在 Base 上把 ${amountString} ${fromToken.symbol} 换成 ${toToken.symbol}`,
    amount: amountString,
    fromToken,
    toToken
  };
}

function inferSymbols(intent) {
  const symbols = Object.keys(TOKENS).filter((symbol) =>
    new RegExp(`\\b${symbol}\\b`, "i").test(intent)
  );

  return {
    fromSymbol: symbols[0] ? symbols[0].toUpperCase() : "",
    toSymbol: symbols[1] ? symbols[1].toUpperCase() : ""
  };
}

function inferAmount(intent) {
  const match = intent.match(/(\d+(?:\.\d+)?)/);
  return match ? sanitizeAmount(match[1]) : "";
}

function sanitizeAmount(input) {
  if (!input) {
    return "";
  }
  const normalized = String(input).trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return "";
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }
  return normalized;
}

function defaultAmountForToken(symbol) {
  return symbol === "USDC" ? "1000" : "0.1";
}

async function buildHearing(payload) {
  const providerErrors = [];
  let quote;

  if (hasOkxCredentials()) {
    try {
      quote = await fetchOkxQuote(payload);
    } catch (error) {
      providerErrors.push(`OKX 报价失败：${normalizeOkxError(error)}`);
    }
  } else {
    providerErrors.push("未配置 OKX API 凭证");
  }

  if (!quote) {
    try {
      quote = await fetchLifiQuote(payload);
    } catch (error) {
      providerErrors.push(`备用报价失败：${error.message}`);
      throw new Error(providerErrors.join(" "));
    }
  }

  quote.providerNote =
    providerErrors.length > 0
      ? `当前来源：${quote.providerLabel}，${providerErrors[0]}`
      : `当前来源：${quote.providerLabel}，OKX 路由可用`;

  return {
    request: {
      intent: payload.intent,
      riskMode: payload.riskMode,
      amount: payload.amount,
      fromToken: payload.fromToken.symbol,
      toToken: payload.toToken.symbol
    },
    quote,
    hearing: simulateVerdict(payload, quote)
  };
}

async function fetchOkxQuote(payload) {
  const amountMinimal = toMinimalUnits(payload.amount, payload.fromToken.decimals);
  const requestPath = `/api/v6/dex/aggregator/quote?${new URLSearchParams({
    chainIndex: String(payload.chainId),
    amount: amountMinimal.toString(),
    fromTokenAddress: normalizeNativeAddressForOkx(payload.fromToken.address),
    toTokenAddress: normalizeNativeAddressForOkx(payload.toToken.address),
    priceImpactProtectionPercentage: "0.9"
  }).toString()}`;

  const timestamp = new Date().toISOString();
  const prehash = `${timestamp}GET${requestPath}`;
  const sign = crypto
    .createHmac("sha256", OKX_CONFIG.secret)
    .update(prehash)
    .digest("base64");

  const response = await fetchJson(`https://web3.okx.com${requestPath}`, {
    headers: {
      "OK-ACCESS-KEY": OKX_CONFIG.key,
      "OK-ACCESS-PASSPHRASE": OKX_CONFIG.passphrase,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-SIGN": sign
    }
  });

  if (response.code && response.code !== "0") {
    throw new Error(formatOkxError(response));
  }

  const item = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!item) {
    throw new Error("OKX returned no quote payload");
  }

  const routerResult = item.routerResult || item;
  const primaryRoute = firstDefined(
    routerResult.dexRouterList?.[0],
    item.dexRouterList?.[0],
    item.quoteCompareList?.[0]
  );

  const fromAmountHuman = payload.amount;
  const toAmountMinimal = firstDefined(routerResult.toTokenAmount, item.toTokenAmount, item.amountOut, "0");
  const toAmountHuman = fromMinimalUnits(toAmountMinimal, payload.toToken.decimals);
  const fromPriceUsd = parseFloat(
    firstDefined(routerResult.fromToken?.tokenUnitPrice, item.fromToken?.tokenUnitPrice, "0")
  );
  const toPriceUsd = parseFloat(
    firstDefined(routerResult.toToken?.tokenUnitPrice, item.toToken?.tokenUnitPrice, "0")
  );
  const fromAmountUsd =
    parseFloat(firstDefined(routerResult.fromTokenAmountUsd, item.fromTokenAmountUsd, item.fromTokenValue, "0")) ||
    Number(fromAmountHuman) * fromPriceUsd;
  const toAmountUsd =
    parseFloat(firstDefined(routerResult.toTokenAmountUsd, item.toTokenAmountUsd, item.toTokenValue, "0")) ||
    Number(toAmountHuman) * toPriceUsd;
  const gasUsd = parseFloat(
    firstDefined(routerResult.tradeFee, routerResult.networkFee, item.tradeFee, item.networkFee, "0")
  ) || 0;
  const priceImpactPct = normalizePct(
    firstDefined(routerResult.priceImpactPercentage, item.priceImpactPercentage, "0")
  );
  const honeypot = Boolean(firstDefined(routerResult.toToken?.isHoneyPot, item.toToken?.isHoneyPot, false));
  const buyTaxPct = normalizePct(firstDefined(routerResult.toToken?.taxRate, item.toToken?.taxRate, "0"));
  const routeCount = Array.isArray(routerResult.dexRouterList)
    ? routerResult.dexRouterList.length
    : Array.isArray(item.quoteCompareList)
      ? item.quoteCompareList.length
      : 1;

  return {
    provider: "okx",
    providerLabel: "OKX 实时报价",
    toolName: firstDefined(
      primaryRoute?.dexName,
      primaryRoute?.router,
      primaryRoute?.dexProtocol?.dexName,
      "OKX Aggregator"
    ),
    chainLabel: payload.chainLabel,
    fromToken: payload.fromToken,
    toToken: payload.toToken,
    fromAmountFormatted: fromAmountHuman,
    toAmountFormatted: formatTokenAmount(toAmountHuman),
    fromAmountUsd,
    toAmountUsd,
    gasUsd,
    protocolFeeUsd: 0,
    totalCostsUsd: gasUsd,
    totalDragPct: computeTotalDragPct(fromAmountUsd, toAmountUsd, gasUsd, 0),
    priceImpactPct,
    routeSteps: routeCount,
    honeypot,
    buyTaxPct
  };
}

function normalizeNativeAddressForOkx(address) {
  return address === TOKENS.ETH.address
    ? "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    : address;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return "";
}

async function fetchLifiQuote(payload) {
  const fromAmount = toMinimalUnits(payload.amount, payload.fromToken.decimals);
  const url = new URL("https://li.quest/v1/quote");
  url.searchParams.set("fromChain", String(payload.chainId));
  url.searchParams.set("toChain", String(payload.chainId));
  url.searchParams.set("fromToken", payload.fromToken.address);
  url.searchParams.set("toToken", payload.toToken.address);
  url.searchParams.set("fromAmount", fromAmount.toString());
  url.searchParams.set("fromAddress", "0x0000000000000000000000000000000000000001");
  url.searchParams.set("slippage", "0.005");

  const response = await fetchJson(url.toString());
  if (response.code && response.code !== 0) {
    throw new Error(response.message || `LiFi code ${response.code}`);
  }

  const gasUsd = sumCosts(response.estimate?.gasCosts);
  const protocolFeeUsd = sumCosts(response.estimate?.feeCosts);
  const fromAmountUsd = parseFloat(response.estimate?.fromAmountUSD || "0");
  const toAmountUsd = parseFloat(response.estimate?.toAmountUSD || "0");

  return {
    provider: "lifi",
    providerLabel: "备用实时报价",
    toolName: response.toolDetails?.name || response.tool || "LiFi",
    chainLabel: payload.chainLabel,
    fromToken: payload.fromToken,
    toToken: payload.toToken,
    fromAmountFormatted: trimNumber(payload.amount),
    toAmountFormatted: formatTokenAmount(
      fromMinimalUnits(response.estimate?.toAmount || "0", payload.toToken.decimals)
    ),
    fromAmountUsd,
    toAmountUsd,
    gasUsd,
    protocolFeeUsd,
    totalCostsUsd: gasUsd + protocolFeeUsd,
    totalDragPct: computeTotalDragPct(fromAmountUsd, toAmountUsd, gasUsd, protocolFeeUsd),
    priceImpactPct: ((toAmountUsd - fromAmountUsd) / Math.max(fromAmountUsd, 1)) * 100,
    routeSteps: Array.isArray(response.includedSteps) ? response.includedSteps.length : 1,
    honeypot: false,
    buyTaxPct: 0
  };
}

function sumCosts(items) {
  if (!Array.isArray(items)) {
    return 0;
  }
  return items.reduce((total, item) => total + parseFloat(item.amountUSD || "0"), 0);
}

function computeTotalDragPct(fromUsd, toUsd, gasUsd, feeUsd) {
  if (!fromUsd) {
    return 0;
  }
  return ((fromUsd - toUsd + gasUsd + feeUsd) / fromUsd) * 100;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
    }

    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

function formatOkxError(response) {
  if (response.code === "50114" || /invalid authority/i.test(response.msg || "")) {
    return "当前 API key 没有 Web3 DEX 访问权限";
  }
  return response.msg || `OKX code ${response.code}`;
}

function normalizeOkxError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/50114|invalid authority/i.test(message)) {
    return "当前 API key 没有 Web3 DEX 访问权限";
  }
  if (/fetch failed|timeout|aborted/i.test(message)) {
    return "无法连接 OKX Web3 API";
  }
  return message;
}

function simulateVerdict(payload, quote) {
  const intent = payload.intent;
  const targetRisk = payload.toToken.risk;
  const dragPct = quote.totalDragPct;
  const priceImpactPct = quote.priceImpactPct;
  const routeSteps = quote.routeSteps;
  const riskMode = payload.riskMode;
  const amountUsd = quote.fromAmountUsd || 0;
  const chasing = /(追高|追涨|冲高|打板|meme|pump|热度|翻倍)/i.test(intent) || targetRisk === "meme";
  const defensive = /(防守|保住|锁定|落袋|稳|换成\s*USDC)/i.test(intent) || payload.toToken.stable;
  const dipBuying = /(回调|抄底|分批|试单|企稳)/i.test(intent);

  const executionQualityScore = clamp(Math.round(96 - dragPct * 18 - Math.max(routeSteps - 1, 0) * 6), 8, 98);
  const costScore = clamp(Math.round(95 - dragPct * 22), 6, 98);
  const targetRiskScore = {
    stable: 92,
    major: 74,
    defi: 58,
    meme: 24
  }[targetRisk];
  const routeScore = clamp(94 - Math.max(routeSteps - 1, 0) * 14, 25, 96);

  const jury = [];
  const log = [];

  log.push({
    speaker: "意图解析",
    body: `识别为 ${payload.fromToken.symbol} -> ${payload.toToken.symbol}，金额约 ${trimNumber(
      payload.amount
    )} ${payload.fromToken.symbol}，风险模式为 ${
      riskMode === "conservative" ? "保守" : riskMode === "balanced" ? "平衡" : "激进"
    }`
  });

  log.push({
    speaker: "实时报价",
    body: `${quote.providerLabel} / ${quote.toolName} 返回实时报价：预计到手 ${quote.toAmountFormatted} ${
      payload.toToken.symbol
    }，综合成本 ${formatUsd(quote.totalCostsUsd)}，总执行损耗 ${formatPct(-dragPct)}`
  });

  if (chasing) {
    jury.push({
      role: "动量法官",
      vote: "approve",
      title: "趋势可能还在，但不是低风险进场",
      body: "报价证明路径可成交，但这类目标更像顺势追价，不应把可成交误判为值得成交"
    });
  } else if (defensive) {
    jury.push({
      role: "动量法官",
      vote: "reject",
      title: "继续持有高波动资产没有明显优势",
      body: "当前实时报价足够干净，更适合把波动敞口收缩到防守资产"
    });
  } else {
    jury.push({
      role: "动量法官",
      vote: "approve",
      title: "允许小仓位跟踪，不支持一把梭",
      body: "方向并非完全错误，但只能支持试单级别的风险暴露"
    });
  }

  if (chasing) {
    jury.push({
      role: "逆向法官",
      vote: "reject",
      title: "热度过高，盈亏比不够",
      body: "目标资产偏情绪驱动，逆向视角认为现在更接近拥挤交易而不是舒服买点"
    });
  } else if (defensive) {
    jury.push({
      role: "逆向法官",
      vote: "approve",
      title: "现在收缩风险比赌反弹更合理",
      body: "在报价足够干净时先落袋，可以把错误成本压到最低"
    });
  } else {
    jury.push({
      role: "逆向法官",
      vote: "approve",
      title: "回调参与优于追涨参与",
      body: "如果必须做，这种结构更适合用分批方式而不是追价方式"
    });
  }

  let riskVote = "approve";
  let riskTitle = "风险可控";
  let riskBody = "没有发现硬性否决项，可以在仓位受限的前提下继续";

  if (quote.honeypot || quote.buyTaxPct >= 5) {
    riskVote = "reject";
    riskTitle = "税率或蜜罐风险过高";
    riskBody = "实时报价已出现异常交易风险信号，直接否决";
  } else if (chasing && riskMode !== "aggressive") {
    riskVote = "reject";
    riskTitle = "目标风险与用户偏好不匹配";
    riskBody = "在保守或平衡模式下，情绪币追涨不应该被放行";
  } else if (dragPct > 2) {
    riskVote = "reject";
    riskTitle = "执行损耗过大";
    riskBody = "实时报价显示成交损耗过高，哪怕方向正确，执行质量也不够";
  } else if (dipBuying || targetRisk === "defi") {
    riskVote = "conditional";
    riskTitle = "允许试单，但必须分批";
    riskBody = "可以开第一笔，但后续加仓必须再次听证";
  }

  jury.push({
    role: "风险法官",
    vote: riskVote,
    title: riskTitle,
    body: riskBody
  });

  const executionVote = dragPct < 1.25 && routeSteps <= 3 ? "approve" : "conditional";
  jury.push({
    role: "执行法官",
    vote: executionVote,
    title: executionVote === "approve" ? "路径干净，成交成本可接受" : "能做，但成本开始抬头",
    body:
      executionVote === "approve"
        ? "实时报价显示当前路径可以承受，作为执行建议是成立的"
        : "报价不是不能用，但成本和路径复杂度已经提醒我们要降低仓位"
  });

  const supportCount = jury.filter((entry) => entry.vote === "approve").length;
  let verdict = "条件通过";
  let confidence = 76;
  let recommendedSize = "25%";

  if (riskVote === "reject") {
    verdict = "拒绝执行";
    confidence = chasing ? 92 : 86;
    recommendedSize = "0%";
  } else if (supportCount >= 3 && executionVote === "approve" && defensive) {
    verdict = "通过执行";
    confidence = 93;
    recommendedSize = riskMode === "conservative" ? "70%" : "55%";
  } else if (supportCount >= 3 && executionVote === "approve") {
    verdict = "条件通过";
    confidence = 81;
    recommendedSize = riskMode === "aggressive" ? "35%" : "28%";
  } else {
    verdict = "条件通过";
    confidence = 74;
    recommendedSize = "20%";
  }

  log.push({
    speaker: "风险法官",
    body: riskBody
  });
  log.push({
    speaker: "执行法官",
    body:
      executionVote === "approve"
        ? "路径、费用和到手额都在可接受范围内"
        : "可以成交，但不该按重仓逻辑去成交"
  });

  const routeAdvice =
    verdict === "拒绝执行"
      ? `当前实时报价证明“能成交”，但陪审团裁决是“不值得成交”，建议改为观察，或切换到 ${payload.toToken.stable ? payload.toToken.symbol : "USDC"} 这类更匹配风险偏好的目标`
      : verdict === "通过执行"
        ? `建议按 ${recommendedSize} 的目标仓位执行第一笔，沿用 ${quote.toolName} 返回的当前路径；若市场继续恶化，再召集下一轮听证`
        : `允许先开 ${recommendedSize} 的试单，路径以 ${quote.toolName} 的当前报价为准，但后续加仓必须基于新的实时报价重新裁决`;

  return {
    intent,
    verdict,
    confidence: `${confidence}%`,
    recommendedSize,
    routeAdvice,
    evidence: [
      {
        label: "执行质量",
        score: executionQualityScore,
        note: executionQualityScore >= 80 ? "路径健康" : executionQualityScore >= 55 ? "谨慎可做" : "质量偏弱",
        detail: `${quote.toolName} · ${quote.toAmountFormatted} ${payload.toToken.symbol}`
      },
      {
        label: "综合成本",
        score: costScore,
        note: dragPct < 0.8 ? "成本轻" : dragPct < 1.8 ? "成本可控" : "成本偏重",
        detail: `${formatUsd(quote.totalCostsUsd)} · ${formatPct(-dragPct)}`
      },
      {
        label: "目标风险",
        score: targetRiskScore,
        note: payload.toToken.stable ? "防守型" : targetRisk === "meme" ? "高波动" : "可试单",
        detail: `${payload.toToken.symbol} · ${payload.toToken.name}`
      },
      {
        label: "路径结构",
        score: routeScore,
        note: routeSteps <= 2 ? "路径简洁" : "路径较复杂",
        detail: `${routeSteps} 跳 · 价格影响 ${formatPct(priceImpactPct)}`
      }
    ],
    jury,
    log
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function trimNumber(value) {
  return String(value).replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "");
}

function formatTokenAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return trimNumber(value);
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: numeric >= 1000 ? 2 : numeric >= 1 ? 4 : 6
  }).format(numeric);
}

function toMinimalUnits(value, decimals) {
  const [wholePartRaw, fractionPartRaw = ""] = String(value).split(".");
  const wholePart = wholePartRaw || "0";
  const fractionPart = `${fractionPartRaw}${"0".repeat(decimals)}`.slice(0, decimals);
  return BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(fractionPart.slice(0, decimals) || "0");
}

function fromMinimalUnits(value, decimals) {
  const bigint = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = bigint / base;
  const fraction = bigint % base;
  if (fraction === 0n) {
    return whole.toString();
  }
  return `${whole}.${fraction.toString().padStart(decimals, "0")}`.replace(/0+$/u, "");
}

function normalizePct(value) {
  const numeric = parseFloat(value || "0");
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 2 : 4
  }).format(value);
}

function formatPct(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
