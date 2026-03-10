const presets = [
  {
    id: "meme-chase",
    label: "追高 BRETT",
    intent: "Base 上用 0.2 ETH 买入 BRETT，优先看价格影响，回撤上限 4%",
    amount: "0.2",
    fromToken: "ETH",
    toToken: "BRETT",
    riskMode: "balanced"
  },
  {
    id: "defense-rotate",
    label: "ETH 换 USDC",
    intent: "Base 上把 0.75 ETH 换成 USDC，优先保住收益，可分两次成交",
    amount: "0.75",
    fromToken: "ETH",
    toToken: "USDC",
    riskMode: "conservative"
  },
  {
    id: "dip-buy",
    label: "USDC 买 AERO",
    intent: "用 1000 USDC 分三次买入 AERO，优先流动性，单次不超过 350 USDC",
    amount: "1000",
    fromToken: "USDC",
    toToken: "AERO",
    riskMode: "aggressive"
  },
  {
    id: "profit-lock",
    label: "BRETT 换 USDC",
    intent: "把 1200 BRETT 换成 USDC，优先落袋，避免一次性冲击",
    amount: "1200",
    fromToken: "BRETT",
    toToken: "USDC",
    riskMode: "balanced"
  }
];

const intentEl = document.querySelector("#scenario-intent");
const verdictEl = document.querySelector("#scenario-verdict");
const confidenceEl = document.querySelector("#scenario-confidence");
const sizeEl = document.querySelector("#scenario-size");
const routeEl = document.querySelector("#scenario-route");
const chainEl = document.querySelector("#scenario-chain");
const juryGridEl = document.querySelector("#jury-grid");
const scenarioButtonsEl = document.querySelector("#scenario-buttons");
const evidenceGridEl = document.querySelector("#evidence-grid");
const hearingLogListEl = document.querySelector("#hearing-log-list");
const inputIntentEl = document.querySelector("#input-intent");
const inputRiskEl = document.querySelector("#input-risk");
const conveneBtnEl = document.querySelector("#convene-btn");
const inputAmountEl = document.querySelector("#input-amount");
const inputFromTokenEl = document.querySelector("#input-from-token");
const inputToTokenEl = document.querySelector("#input-to-token");
const providerBadgeEl = document.querySelector("#quote-provider");
const quoteToolEl = document.querySelector("#quote-tool");
const quoteReceiveEl = document.querySelector("#quote-receive");
const quoteCostEl = document.querySelector("#quote-cost");
const quoteImpactEl = document.querySelector("#quote-impact");
const quoteNoteEl = document.querySelector("#quote-note");
const verdictCardEl = document.querySelector('[data-role="verdict"]');
const appCardsEls = document.querySelectorAll(".app-card");

let logTimer;

function renderPresetButtons() {
  presets.forEach((preset, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.label;
    button.dataset.presetId = preset.id;
    if (index === 0) {
      button.classList.add("active");
    }
    button.addEventListener("click", () => {
      setActivePresetSelection(preset.id);
      applyPreset(preset);
      runHearing();
    });
    scenarioButtonsEl.appendChild(button);
  });
}

function setActivePresetSelection(id) {
  document.querySelectorAll(".scenario-buttons button").forEach((item) => {
    item.classList.toggle("active", item.dataset.presetId === id);
  });

  appCardsEls.forEach((item) => {
    item.classList.toggle("active", item.dataset.presetId === id);
  });
}

function clearActivePresetSelection() {
  document.querySelectorAll(".scenario-buttons button").forEach((item) => {
    item.classList.remove("active");
  });

  appCardsEls.forEach((item) => {
    item.classList.remove("active");
  });
}

function applyPreset(preset) {
  inputIntentEl.value = preset.intent;
  inputAmountEl.value = preset.amount;
  inputFromTokenEl.value = preset.fromToken;
  inputToTokenEl.value = preset.toToken;
  inputRiskEl.value = preset.riskMode;
  syncTokenSelectors();
}

function renderEvidence(evidence) {
  evidenceGridEl.innerHTML = "";
  evidence.forEach((item) => {
    const card = document.createElement("article");
    card.className = "evidence-card";
    card.innerHTML = `
      <div class="evidence-topline">
        <span class="evidence-label">${item.label}</span>
        <strong>${item.note}</strong>
      </div>
      <div class="meter-track">
        <span class="meter-fill" style="width:${item.score}%"></span>
      </div>
      <div class="evidence-meta">${item.detail}</div>
    `;
    evidenceGridEl.appendChild(card);
  });
}

function renderJury(jury) {
  juryGridEl.innerHTML = "";
  jury.forEach((entry) => {
    const card = document.createElement("article");
    card.className = `jury-card ${entry.vote}`;
    card.innerHTML = `
      <div class="jury-role">${entry.role}</div>
      <strong>${entry.title}</strong>
      <div class="jury-vote ${entry.vote}">${entry.vote === "approve" ? "支持" : entry.vote === "conditional" ? "附条件" : "否决"}</div>
      <p>${entry.body}</p>
    `;
    juryGridEl.appendChild(card);
  });
}

function appendLogEntry(entry) {
  const item = document.createElement("article");
  item.className = "log-item";
  item.innerHTML = `
    <div class="log-speaker">${entry.speaker}</div>
    <div class="log-body">${entry.body}</div>
  `;
  hearingLogListEl.appendChild(item);
}

function renderLog(logEntries, animateLog = false) {
  clearTimeout(logTimer);
  hearingLogListEl.innerHTML = "";

  if (!animateLog) {
    logEntries.forEach((entry) => appendLogEntry(entry));
    return;
  }

  const queue = [...logEntries];

  function pump() {
    const entry = queue.shift();
    if (!entry) {
      return;
    }
    appendLogEntry(entry);
    logTimer = window.setTimeout(pump, 220);
  }

  pump();
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

function renderQuoteSummary(quote) {
  providerBadgeEl.textContent = quote.providerLabel;
  quoteToolEl.textContent = quote.toolName;
  quoteReceiveEl.textContent = `${quote.toAmountFormatted} ${quote.toToken.symbol}`;
  quoteCostEl.textContent = `${formatUsd(quote.totalCostsUsd)} · ${formatPct(-quote.totalDragPct)}`;
  quoteImpactEl.textContent = `${formatPct(quote.priceImpactPct)}`;
  quoteNoteEl.textContent = quote.providerNote;
}

function renderHearing(payload) {
  const { hearing, quote } = payload;

  chainEl.textContent = quote.chainLabel;
  intentEl.textContent = hearing.intent;
  verdictEl.textContent = hearing.verdict;
  confidenceEl.textContent = hearing.confidence;
  sizeEl.textContent = hearing.recommendedSize;
  routeEl.textContent = hearing.routeAdvice;
  verdictCardEl.dataset.tone =
    hearing.verdict === "通过执行" ? "approve" : hearing.verdict === "拒绝执行" ? "reject" : "conditional";

  renderEvidence(hearing.evidence);
  renderJury(hearing.jury);
  renderLog(hearing.log, true);
  renderQuoteSummary(quote);
}

function setLoadingState(isLoading) {
  conveneBtnEl.disabled = isLoading;
  conveneBtnEl.textContent = isLoading ? "正在判断..." : "开始判断";
}

function renderBootState() {
  const currentIntent = inputIntentEl.value.trim() || "等待输入交易意图";
  intentEl.textContent = currentIntent;
  verdictEl.textContent = "等待判断";
  confidenceEl.textContent = "--";
  sizeEl.textContent = "--";
  routeEl.textContent = "输入交易意图后，这里会给出执行建议";
  providerBadgeEl.textContent = "等待连接";
  quoteToolEl.textContent = "报价服务";
  quoteReceiveEl.textContent = "--";
  quoteCostEl.textContent = "--";
  quoteImpactEl.textContent = "--";
  quoteNoteEl.textContent = "当前还没有拿到实时报价";
  verdictCardEl.dataset.tone = "idle";
  renderEvidence([
    {
      label: "执行质量",
      score: 0,
      note: "等待报价",
      detail: "路径返回后更新"
    },
    {
      label: "综合成本",
      score: 0,
      note: "等待报价",
      detail: "成本返回后更新"
    },
    {
      label: "目标风险",
      score: 0,
      note: "等待判断",
      detail: "目标确认后更新"
    },
    {
      label: "路径结构",
      score: 0,
      note: "等待判断",
      detail: "路径确认后更新"
    }
  ]);
  renderJury([
    {
      role: "系统",
      vote: "conditional",
      title: "等待本次判断",
      body: "提交交易意图后，这里会显示裁决结果"
    }
  ]);
  renderLog(
    [
      {
        speaker: "系统",
        body: "当前为待机状态"
      }
    ],
    false
  );
}

function renderPendingState() {
  intentEl.textContent = inputIntentEl.value.trim() || "正在解析输入意图";
  verdictEl.textContent = "正在判断";
  confidenceEl.textContent = "--";
  sizeEl.textContent = "--";
  routeEl.textContent = "正在拉取报价并生成裁决";
  providerBadgeEl.textContent = "正在连接";
  quoteToolEl.textContent = "报价服务";
  quoteReceiveEl.textContent = "--";
  quoteCostEl.textContent = "--";
  quoteImpactEl.textContent = "--";
  quoteNoteEl.textContent = "系统正在请求实时条件";
  verdictCardEl.dataset.tone = "loading";
}

function syncTokenSelectors(changedField = "") {
  const fromValue = inputFromTokenEl.value;
  const toValue = inputToTokenEl.value;

  if (fromValue === toValue) {
    if (changedField === "from") {
      const fallback = [...inputToTokenEl.options].find((option) => option.value !== fromValue);
      if (fallback) {
        inputToTokenEl.value = fallback.value;
      }
    } else {
      const fallback = [...inputFromTokenEl.options].find((option) => option.value !== toValue);
      if (fallback) {
        inputFromTokenEl.value = fallback.value;
      }
    }
  }

  const currentFrom = inputFromTokenEl.value;
  const currentTo = inputToTokenEl.value;

  [...inputToTokenEl.options].forEach((option) => {
    option.disabled = option.value === currentFrom;
  });

  [...inputFromTokenEl.options].forEach((option) => {
    option.disabled = option.value === currentTo;
  });
}

function handleManualEdit() {
  clearActivePresetSelection();
  renderBootState();
}

function handleIntentShortcut(event) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    runHearing();
  }
}

async function runHearing() {
  setLoadingState(true);
  renderPendingState();

  try {
    const response = await fetch("/api/hearing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        intent: inputIntentEl.value.trim(),
        amount: inputAmountEl.value.trim(),
        fromToken: inputFromTokenEl.value,
        toToken: inputToTokenEl.value,
        riskMode: inputRiskEl.value
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Unknown error");
    }

    renderHearing(payload);
  } catch (error) {
    renderLog(
      [
        {
          speaker: "系统",
          body: `实时报价拉取失败：${error.message}`
        },
        {
          speaker: "备用通道",
          body: "请检查网络或稍后重试；如果你有 OKX API 凭证，也可以把它们放进 .env.local 后重启本地服务"
        }
      ],
      false
    );
    providerBadgeEl.textContent = "当前不可用";
    quoteToolEl.textContent = "报价服务";
    quoteReceiveEl.textContent = "--";
    quoteCostEl.textContent = "--";
    quoteImpactEl.textContent = "--";
    quoteNoteEl.textContent = "当前没有拿到实时报价";
  } finally {
    setLoadingState(false);
  }
}

function setupReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
        }
      });
    },
    {
      threshold: 0.18
    }
  );

  document.querySelectorAll(".reveal").forEach((item) => observer.observe(item));
}

renderPresetButtons();
applyPreset(presets[0]);
setActivePresetSelection(presets[0].id);
syncTokenSelectors();
setupReveal();
renderBootState();
conveneBtnEl.addEventListener("click", runHearing);

appCardsEls.forEach((card) => {
  card.addEventListener("click", () => {
    const preset = presets.find((item) => item.id === card.dataset.presetId);
    if (!preset) {
      return;
    }

    setActivePresetSelection(preset.id);
    applyPreset(preset);
    document.querySelector("#demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    runHearing();
  });
});

inputIntentEl.addEventListener("input", handleManualEdit);
inputIntentEl.addEventListener("keydown", handleIntentShortcut);
inputAmountEl.addEventListener("input", handleManualEdit);
inputRiskEl.addEventListener("change", handleManualEdit);
inputFromTokenEl.addEventListener("change", () => {
  syncTokenSelectors("from");
  handleManualEdit();
});
inputToTokenEl.addEventListener("change", () => {
  syncTokenSelectors("to");
  handleManualEdit();
});

runHearing();
