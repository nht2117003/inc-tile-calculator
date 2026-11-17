"use strict";
const MATERIAL_NAME = "마루";
const DEFAULT_MODE = "coverage";
// 길이는 1/1000m, 면적은 1/1,000,000㎡ 정수로 계산합니다.
function parseDecimal(value, min, max, name) {
  const input = String(value ?? "").trim();
  if (!input) return { error: name + "을 입력해 주세요." };
  if (input.length > 16 || !/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(input))
    return { error: "숫자를 소수점 셋째 자리까지 입력해 주세요." };
  const n = Number(input);
  if (!Number.isFinite(n) || n < min || n > max) return { error: min + "~" + max.toLocaleString("ko-KR") + " 범위로 입력해 주세요." };
  const [whole, fraction = ""] = input.split(".");
  return { scaled: BigInt(whole || "0") * 1000n + BigInt(fraction.padEnd(3, "0")) };
}
function parseInteger(value, max, name) {
  const input = String(value ?? "").trim();
  if (!/^\d{1,5}$/.test(input) || Number(input) < 1 || Number(input) > max)
    return { error: name + "은 1~" + max.toLocaleString("ko-KR") + " 사이의 정수로 입력해 주세요." };
  return { value: BigInt(input) };
}
function ceilRatio(n, d) { return (n + d - 1n) / d; }
function calculateMaterial(input = {}) {
  const { mode = "dimensions", width = "", length = "", area = "", productMode = DEFAULT_MODE,
    coverage = "", pieceWidth = "", pieceLength = "", perBox = "", extra = "10" } = input;
  const errors = {};
  let a, cover, piece, boxSize = null;
  if (mode === "dimensions") {
    const w = parseDecimal(width, .01, 100, "가로 길이");
    const l = parseDecimal(length, .01, 100, "세로 길이");
    if (w.error) errors.width = w.error;
    if (l.error) errors.length = l.error;
    if (!w.error && !l.error) a = w.scaled * l.scaled;
  } else if (mode === "area") {
    const direct = parseDecimal(area, .01, 10000, "시공 면적");
    if (direct.error) errors["direct-area"] = direct.error;
    else a = direct.scaled * 1000n;
  } else errors.mode = "면적 입력 방법을 다시 선택해 주세요.";
  if (productMode === "coverage") {
    const c = parseDecimal(coverage, .01, 100, "박스당 시공 면적");
    if (c.error) errors.coverage = c.error;
    else cover = c.scaled * 1000n;
  } else if (productMode === "size") {
    const w = parseInteger(pieceWidth, 10000, "한 장 폭");
    const l = parseInteger(pieceLength, 10000, "한 장 길이");
    if (w.error) errors["piece-width"] = w.error;
    if (l.error) errors["piece-length"] = l.error;
    if (!w.error && !l.error) piece = w.value * l.value;
    if (String(perBox).trim()) {
      const b = parseInteger(perBox, 1000, "박스당 장수");
      if (b.error) errors["per-box"] = b.error;
      else boxSize = b.value;
    }
  } else errors.productMode = "제품 정보 입력 방법을 다시 선택해 주세요.";
  if (!["5", "10", "15"].includes(String(extra))) errors.extra = "여유분을 다시 선택해 주세요.";
  if (Object.keys(errors).length) return { errors };
  const numerator = a * BigInt(100 + Number(extra));
  const pieces = productMode === "size" ? ceilRatio(numerator, piece * 100n) : null;
  const boxes = productMode === "coverage" ? ceilRatio(numerator, cover * 100n) :
    (boxSize === null ? null : ceilRatio(pieces, boxSize));
  return { area: Number(a) / 1000000, neededArea: Number(numerator) / 100000000,
    pieces: pieces === null ? null : Number(pieces), boxes: boxes === null ? null : Number(boxes),
    purchasePieces: boxes !== null && boxSize !== null ? Number(boxes * boxSize) : null,
    pieceWidth: productMode === "size" ? Number(pieceWidth) : null,
    pieceLength: productMode === "size" ? Number(pieceLength) : null,
    perBox: boxSize === null ? null : Number(boxSize),
    coverage: productMode === "coverage" ? Number(cover) / 1000000 : null,
    extra: Number(extra), productMode };
}
function setupCalculator() {
  const el = id => document.getElementById(id);
  const form = el("material-form");
  const format = n => n.toLocaleString("ko-KR", {minimumFractionDigits:2,maximumFractionDigits:2});
  let current, revision = 0, copying = false;
  const group = (id, active) => {
    el(id).hidden = !active;
    for (const field of el(id).querySelectorAll("input,select")) field.disabled = !active;
  };
  function update() {
    revision++;
    el("copy-status").textContent = "";
    el("manual-copy").hidden = true;
    el("copy-text").value = "";
    const mode = el("area-mode").value, productMode = el("product-mode").value;
    group("dimensions-fields", mode === "dimensions");
    group("direct-area-field", mode === "area");
    group("coverage-fields", productMode === "coverage");
    group("size-fields", productMode === "size");
    current = calculateMaterial({mode, productMode, width:el("width").value, length:el("length").value,
      area:el("direct-area").value, coverage:el("coverage").value, pieceWidth:el("piece-width").value,
      pieceLength:el("piece-length").value, perBox:el("per-box").value, extra:el("extra").value});
    for (const id of ["width","length","direct-area","coverage","piece-width","piece-length","per-box"]) {
      el(id + "-error").textContent = current.errors?.[id] || "";
      el(id).setAttribute("aria-invalid", String(Boolean(current.errors?.[id])));
    }
    const valid = !current.errors;
    el("copy").disabled = !valid || copying;
    el("quantity").textContent = valid ? (current.boxes ?? current.pieces).toLocaleString("ko-KR") : "—";
    el("quantity-unit").textContent = valid && current.boxes === null ? "장" : "박스";
    el("area-result").textContent = valid ? format(current.area) : "—";
    el("needed-area").textContent = valid ? format(current.neededArea) : "—";
    el("extra-result").textContent = valid ? current.extra + "%" : "—";
    el("pieces-row").hidden = !valid || current.pieces === null;
    el("purchase-row").hidden = !valid || current.purchasePieces === null;
    el("pieces").textContent = valid && current.pieces !== null ? current.pieces.toLocaleString("ko-KR") : "—";
    el("purchase-pieces").textContent = valid && current.purchasePieces !== null ? current.purchasePieces.toLocaleString("ko-KR") : "—";
    el("result-description").textContent = valid ?
      (current.boxes === null ? "여유분을 더한 면적을 한 장 단위로 올림했어요. 박스당 장수를 입력하면 박스 수도 보여드려요." :
      "여유분을 더한 뒤 박스 단위로 올림했어요. 제품 표기의 실제 시공 면적과 포장 수량을 확인하세요.") :
      (current.errors.mode || current.errors.productMode || current.errors.extra || "바닥 크기와 제품 규격을 확인해 주세요.");
  }
  function legacyCopy(text) {
    const focus = document.activeElement;
    el("manual-copy").hidden = false;
    el("copy-text").value = text;
    el("copy-text").focus(); el("copy-text").select();
    let success = false;
    try { success = document.execCommand("copy"); } catch (_) {}
    if (success) { el("manual-copy").hidden = true; focus?.focus(); }
    return success;
  }
  el("copy").addEventListener("click", async () => {
    if (!current || current.errors || copying) return;
    const lines = [MATERIAL_NAME + " 수량 계산 결과", "실제 시공 면적: " + format(current.area) + "㎡",
      "여유분: " + current.extra + "% · 포함 필요 면적: " + format(current.neededArea) + "㎡"];
    if (current.productMode === "coverage") lines.push("박스당 시공 면적: " + current.coverage + "㎡");
    else lines.push("한 장 크기: " + current.pieceWidth + "×" + current.pieceLength + "mm", "예상 필요 장수: " + current.pieces + "장");
    if (current.boxes !== null) lines.push("예상 구매: " + current.boxes + "박스");
    if (current.purchasePieces !== null) lines.push("박스당 " + current.perBox + "장 · 총 구매 " + current.purchasePieces + "장");
    lines.push("면적 기준 추정치입니다. 실제 배치·절단에 따른 구매량은 판매처나 시공 담당자와 확인하세요.");
    const text = lines.join("\n"), start = revision;
    copying = true; el("copy").disabled = true;
    let success = false;
    try {
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(text); success = true; }
        catch (_) { if (revision === start) success = legacyCopy(text); }
      } else success = legacyCopy(text);
      if (revision === start) el("copy-status").textContent = success ? "계산 결과를 복사했어요." : "자동 복사가 지원되지 않습니다. 아래 결과를 직접 복사해 주세요.";
    } finally { copying = false; el("copy").disabled = Boolean(current.errors); }
  });
  form.addEventListener("input", update); form.addEventListener("change", update);
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("reset", () => setTimeout(update, 0));
  update();
}
if (typeof document !== "undefined") setupCalculator();
if (typeof module !== "undefined" && module.exports) module.exports = { calculateMaterial };
