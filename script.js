"use strict";

// 각 변 0.01~100m, 소수점 3자리까지 입력. 화면과 README에도 같은 범위 표시.
// 정수 mm로 변환하고 BigInt 분수 계산으로 부동소수점 올림 오차 방지.
function parseLength(value) {
  const text = String(value).trim();
  if (!text) return { error: "길이를 입력해 주세요." };
  if (!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(text)) {
    return { error: "숫자를 소수점 셋째 자리까지 입력해 주세요." };
  }
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0.01 || number > 100) {
    return { error: "0.01~100m 사이로 입력해 주세요." };
  }
  const [whole, decimal = ""] = text.split(".");
  return { mm: BigInt(whole || "0") * 1000n + BigInt(decimal.padEnd(3, "0")), text };
}

function calculateTiles(width, length, tileSize, extra) {
  const w = parseLength(width);
  const l = parseLength(length);
  if (w.error || l.error) return { errors: { width: w.error || "", length: l.error || "" } };
  const tile = Number(tileSize);
  const allowance = Number(extra);
  if (![300, 600, 800].includes(tile) || ![5, 10, 15].includes(allowance)) {
    return { errors: {}, error: "타일 크기와 여유분을 다시 선택해 주세요." };
  }
  const areaMm2 = w.mm * l.mm;
  const numerator = areaMm2 * BigInt(100 + allowance);
  const denominator = BigInt(tile * tile * 100);
  const count = (numerator + denominator - 1n) / denominator;
  return { area: Number(areaMm2) / 1000000, count: Number(count), tile, extra: allowance, width: w.text, length: l.text };
}

function setupCalculator() {
  const byId = (id) => document.getElementById(id);
  const form = byId("tile-form");
  const copyButton = byId("copy");
  let current = null;
  let revision = 0;
  let copying = false;
  const formatNumber = (value) => value.toLocaleString("ko-KR");
  function update() {
    revision += 1;
    byId("copy-status").textContent = "";
    byId("manual-copy").hidden = true;
    byId("copy-text").value = "";
    current = calculateTiles(byId("width").value, byId("length").value, byId("tile-size").value, byId("extra").value);
    for (const id of ["width", "length"]) {
      const error = current.errors?.[id] || "";
      byId(id + "-error").textContent = error;
      byId(id).setAttribute("aria-invalid", String(Boolean(error)));
    }
    const valid = !current.errors;
    copyButton.disabled = !valid || copying;
    byId("quantity").textContent = valid ? formatNumber(current.count) : "—";
    byId("area").textContent = valid ? current.area.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
    byId("tile-label").textContent = valid ? `${current.tile} × ${current.tile} mm` : "—";
    byId("extra-label").textContent = valid ? `${current.extra}%` : "—";
    byId("result-description").textContent = valid ? "입력한 바닥 면적에 여유분을 더해, 타일 한 장 단위로 올림했어요." : (current.error || "바닥 길이를 확인하면 예상 수량이 표시됩니다.");
  }
  function copyText() {
    return ["타일 수량 계산 결과", `바닥: 가로 ${current.width}m × 세로 ${current.length}m`, `시공 면적: ${current.area.toFixed(2)}㎡`, `타일: ${current.tile} × ${current.tile}mm`, `여유분: ${current.extra}%`, `예상 타일 수량: ${formatNumber(current.count)}장`, "면적 기준 추정치입니다. 실제 시공·구매 수량은 배치, 절단, 깨짐, 포장 단위에 따라 달라질 수 있습니다."].join("\n");
  }
  function legacyCopy(text) {
    const focus = document.activeElement;
    const field = byId("copy-text");
    byId("manual-copy").hidden = false;
    field.value = text;
    field.focus();
    field.select();
    let success = false;
    try { success = document.execCommand("copy"); } catch (_) { /* 수동 복사 안내 유지 */ }
    if (success) { byId("manual-copy").hidden = true; focus?.focus(); }
    return success;
  }
  copyButton.addEventListener("click", async () => {
    if (!current || current.errors || copying) return;
    const text = copyText();
    const startRevision = revision;
    copying = true;
    copyButton.disabled = true;
    let success = false;
    try {
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(text); success = true; }
        catch (_) { if (revision === startRevision) success = legacyCopy(text); }
      } else { success = legacyCopy(text); }
      if (revision === startRevision) byId("copy-status").textContent = success ? "계산 결과를 복사했어요." : "자동 복사가 지원되지 않습니다. 아래 결과를 직접 복사해 주세요.";
    } finally { copying = false; copyButton.disabled = Boolean(current.errors); }
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("reset", () => setTimeout(update, 0));
  update();
}

if (typeof document !== "undefined") setupCalculator();
if (typeof module !== "undefined" && module.exports) module.exports = { parseLength, calculateTiles };
