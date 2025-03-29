/*
 * 図形作成支援ソフト JavaScript
 * 構造:
 * - データ管理と初期化
 * - undo/redo 用状態管理
 * - ユーティリティ関数
 * - イベントハンドラー
 * - 描画関数
 * - プロパティパネル更新処理
 */

// -------------------------------
// データ管理と初期化
// -------------------------------
let polygons = [];  // 完成した多角形（各 poly は { points: [...], isClosed: true }）
let currentPolygon = { points: [], isClosed: false };

// 現在のモード ("draw", "edit", "delete")
let currentMode = "draw";

// 編集時のドラッグ状態
let draggingVertex = false;
let currentDragPolyIndex = null; // 完成済み: 0～polygons.length-1, 未完成: "current"
let currentDragVertexIndex = null;
let draggingEdgeControl = false;
let currentEdgeControlPolyIndex = null;
let currentEdgeControlIndex = null; // 辺番号内でのインデックス
let draggingPolygon = false;
let polygonDragStart = null;
let initialPolygonPoints = [];    // 選択された多角形の各頂点の初期座標
let initialEdgeControls = [];     // 各頂点の edgeControl 初期値

// 現在選択中の多角形（"current" またはインデックス）
let selectedPolygonIndex = null;

let updateScheduled = false;

// プレビュー線用マウス位置
let currentMousePos = null;

// ズーム用変数
let zoomLevel = 1;

// undo/redo 用のスタック
let undoStack = [];
let redoStack = [];
// ドラッグ操作等で変更があったかのフラグ
let stateChanged = false;

// -------------------------------
// HTML要素
// -------------------------------
const canvas = document.getElementById("drawingArea");
const ctx = canvas.getContext("2d");
const modeDrawRadio = document.getElementById("modeDraw");
const modeEditRadio = document.getElementById("modeEdit");
// 消去モード用ラジオボタン（index.html に追加）
const modeDeleteRadio = document.getElementById("modeDelete");

const showEdgeLengthCheckbox = document.getElementById("showEdgeLength");
const showAngleCheckbox = document.getElementById("showAngle");
const closePolygonBtn = document.getElementById("closePolygonBtn");
const clearBtn = document.getElementById("clearBtn");
const polyPropertiesDiv = document.getElementById("polyProperties");
// グリッド表示チェックボックス
const showGridCheckbox = document.getElementById("showGrid");
// グリッドスナップチェックボックス（index.html に追加）
const snapGridCheckbox = document.getElementById("snapGrid");
// undo/redo ボタン（index.html に追加）
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");

// -------------------------------
// 補助関数：createLabelRange
// -------------------------------
function createLabelRange(labelText, initialValue, min, max, step, onChange) {
  const wrapper = document.createElement("div");
  const label = document.createElement("label");
  label.textContent = labelText + "：";
  const rangeInput = document.createElement("input");
  rangeInput.type = "range";
  rangeInput.min = min;
  rangeInput.max = max;
  rangeInput.step = step;
  rangeInput.value = initialValue;
  rangeInput.style.width = "200px";
  const valueSpan = document.createElement("span");
  valueSpan.textContent = initialValue;
  rangeInput.addEventListener("input", function(ev) {
    valueSpan.textContent = ev.target.value;
    onChange(ev);
  });
  wrapper.appendChild(label);
  wrapper.appendChild(rangeInput);
  wrapper.appendChild(valueSpan);
  return wrapper;
}

// -------------------------------
// undo/redo 関連のユーティリティ
// -------------------------------
function saveState() {
  const state = {
    polygons: JSON.parse(JSON.stringify(polygons)),
    currentPolygon: JSON.parse(JSON.stringify(currentPolygon))
  };
  undoStack.push(state);
  redoStack = [];
}

function restoreState(state) {
  polygons = JSON.parse(JSON.stringify(state.polygons));
  currentPolygon = JSON.parse(JSON.stringify(state.currentPolygon));
  updateDrawing();
}

function undo() {
  if (undoStack.length > 0) {
    const currentState = {
      polygons: JSON.parse(JSON.stringify(polygons)),
      currentPolygon: JSON.parse(JSON.stringify(currentPolygon))
    };
    redoStack.push(currentState);
    const prevState = undoStack.pop();
    restoreState(prevState);
  }
}

function redo() {
  if (redoStack.length > 0) {
    const currentState = {
      polygons: JSON.parse(JSON.stringify(polygons)),
      currentPolygon: JSON.parse(JSON.stringify(currentPolygon))
    };
    undoStack.push(currentState);
    const nextState = redoStack.pop();
    restoreState(nextState);
  }
}

// -------------------------------
// ユーティリティ関数
// -------------------------------

// 座標取得ユーティリティ（ズーム考慮）
function getMousePos(event) {
  const rect = canvas.getBoundingClientRect();
  let x, y;
  if (event.touches && event.touches.length > 0) {
    x = event.touches[0].clientX - rect.left;
    y = event.touches[0].clientY - rect.top;
  } else {
    x = event.clientX - rect.left;
    y = event.clientY - rect.top;
  }
  x /= zoomLevel;
  y /= zoomLevel;
  return { x, y };
}

// グリッドスナップ関数
function snapToGrid(pos) {
  const gridSize = 20;
  return { 
    x: Math.round(pos.x / gridSize) * gridSize, 
    y: Math.round(pos.y / gridSize) * gridSize 
  };
}

// 点が多角形内部にあるか（ray-casting）
function pointInPolygon(point, polyPoints) {
  let inside = false;
  for (let i = 0, j = polyPoints.length - 1; i < polyPoints.length; j = i++) {
    const xi = polyPoints[i].x, yi = polyPoints[i].y;
    const xj = polyPoints[j].x, yj = polyPoints[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// 各辺のコントロールポイントを返す
function getEdgeControlPoint(poly, i) {
  const p1 = poly.points[i];
  const p2 = poly.points[(i+1) % poly.points.length];
  if (p1.edgeControl) {
    return p1.edgeControl;
  } else {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const curvature = p1.edgeProperty.curvature;
    return { x: midX - (dy/dist)*curvature, y: midY + (dx/dist)*curvature };
  }
}

function scheduleUpdate() {
  if (!updateScheduled) {
    updateScheduled = true;
    requestAnimationFrame(() => {
      updateDrawing();
      updateScheduled = false;
    });
  }
}

// 角度補間（ラップアラウンド対応）
function lerpAngle(a, b, t) {
  let diff = b - a;
  while(diff < -Math.PI) diff += 2*Math.PI;
  while(diff > Math.PI) diff -= 2*Math.PI;
  return a + diff * t;
}

// -------------------------------
// グリッド描画
// -------------------------------
function drawGrid() {
  const gridSize = 20;
  ctx.save();
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
  for(let x = 0; x < canvas.width/zoomLevel; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height/zoomLevel);
    ctx.stroke();
  }
  for(let y = 0; y < canvas.height/zoomLevel; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width/zoomLevel, y);
    ctx.stroke();
  }
  ctx.restore();
}

// -------------------------------
// イベントハンドラー
// -------------------------------
modeDrawRadio.addEventListener("change", function() {
  if (modeDrawRadio.checked) {
    currentMode = "draw";
    selectedPolygonIndex = null;
    updateDrawing();
  }
});
modeEditRadio.addEventListener("change", function() {
  if (modeEditRadio.checked) {
    currentMode = "edit";
    updateDrawing();
  }
});
if (modeDeleteRadio) {
  modeDeleteRadio.addEventListener("change", function() {
    if (modeDeleteRadio.checked) {
      currentMode = "delete";
      updateDrawing();
    }
  });
}

if (undoBtn) { undoBtn.addEventListener("click", undo); }
if (redoBtn) { redoBtn.addEventListener("click", redo); }

function handleCanvasDown(e) {
  e.preventDefault();
  let pos = getMousePos(e);
  if (snapGridCheckbox && snapGridCheckbox.checked) {
    pos = snapToGrid(pos);
  }
  
  if (currentMode === "delete") {
    for (let p = polygons.length - 1; p >= 0; p--) {
      if (pointInPolygon(pos, polygons[p].points)) {
        saveState();
        polygons.splice(p, 1);
        updateDrawing();
        return;
      }
    }
    return;
  }
  
  currentMousePos = null;
  if (currentMode === "draw") {
    saveState();
    currentPolygon.points.push({
      x: pos.x,
      y: pos.y,
      edgeProperty: { 
        showEdgeLength: true, 
        curvature: 30, 
        segmentColor: "black", 
        bezierColor: "black", 
        labelColor: "black", 
        labelOverride: "",
        bezierGap: 0.1,
        // 新規追加：ラベル位置・文字サイズ（エッジ）
        labelOffsetX: 0,
        labelOffsetY: 0,
        labelFontSize: 12
      },
      angleProperty: { 
        showAngle: true, 
        radius: 30, 
        labelOverride: "",
        fanPosition: 0,
        // 新規追加：ラベル位置・文字サイズ（角）
        labelOffsetX: 0,
        labelOffsetY: 0,
        labelFontSize: 12
      }
    });
    updateDrawing();
  } else if (currentMode === "edit") {
    const threshold = 8;
    for (let p = 0; p < polygons.length; p++) {
      let poly = polygons[p];
      const edgeCount = poly.points.length > 0 ? (poly.isClosed ? poly.points.length : poly.points.length - 1) : 0;
      for (let i = 0; i < edgeCount; i++) {
        const cp = getEdgeControlPoint(poly, i);
        const dx = pos.x - cp.x;
        const dy = pos.y - cp.y;
        if (Math.sqrt(dx*dx + dy*dy) < threshold) {
          draggingEdgeControl = true;
          currentEdgeControlPolyIndex = p;
          currentEdgeControlIndex = i;
          selectedPolygonIndex = p;
          return;
        }
      }
    }
    if (currentPolygon.points.length > 0) {
      const edgeCount = currentPolygon.points.length - 1;
      for (let i = 0; i < edgeCount; i++) {
        const cp = getEdgeControlPoint(currentPolygon, i);
        const dx = pos.x - cp.x;
        const dy = pos.y - cp.y;
        if (Math.sqrt(dx*dx + dy*dy) < threshold) {
          draggingEdgeControl = true;
          currentEdgeControlPolyIndex = "current";
          currentEdgeControlIndex = i;
          selectedPolygonIndex = "current";
          return;
        }
      }
    }
    for (let p = 0; p < polygons.length; p++) {
      let poly = polygons[p];
      for (let i = 0; i < poly.points.length; i++) {
        const dx = pos.x - poly.points[i].x;
        const dy = pos.y - poly.points[i].y;
        if (Math.sqrt(dx*dx + dy*dy) < threshold) {
          draggingVertex = true;
          currentDragPolyIndex = p;
          currentDragVertexIndex = i;
          selectedPolygonIndex = p;
          return;
        }
      }
    }
    if (currentPolygon.points.length > 0) {
      for (let i = 0; i < currentPolygon.points.length; i++) {
        const dx = pos.x - currentPolygon.points[i].x;
        const dy = pos.y - currentPolygon.points[i].y;
        if (Math.sqrt(dx*dx + dy*dy) < threshold) {
          draggingVertex = true;
          currentDragPolyIndex = "current";
          currentDragVertexIndex = i;
          selectedPolygonIndex = "current";
          return;
        }
      }
    }
    for (let p = 0; p < polygons.length; p++) {
      let poly = polygons[p];
      if (pointInPolygon(pos, poly.points)) {
        draggingPolygon = true;
        currentDragPolyIndex = p;
        selectedPolygonIndex = p;
        polygonDragStart = pos;
        initialPolygonPoints = poly.points.map(pt => ({ x: pt.x, y: pt.y }));
        initialEdgeControls = poly.points.map(pt => pt.edgeControl ? { x: pt.edgeControl.x, y: pt.edgeControl.y } : null);
        return;
      }
    }
    if (currentPolygon.points.length > 0) {
      const xs = currentPolygon.points.map(pt => pt.x);
      const ys = currentPolygon.points.map(pt => pt.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
        draggingPolygon = true;
        currentDragPolyIndex = "current";
        selectedPolygonIndex = "current";
        polygonDragStart = pos;
        initialPolygonPoints = currentPolygon.points.map(pt => ({ x: pt.x, y: pt.y }));
        initialEdgeControls = currentPolygon.points.map(pt => pt.edgeControl ? { x: pt.edgeControl.x, y: pt.edgeControl.y } : null);
        return;
      }
    }
    selectedPolygonIndex = null;
  }
}
canvas.addEventListener("mousedown", handleCanvasDown);
canvas.addEventListener("touchstart", handleCanvasDown);

function handleCanvasMove(e) {
  let pos = getMousePos(e);
  if (snapGridCheckbox && snapGridCheckbox.checked) {
    pos = snapToGrid(pos);
  }
  if (draggingEdgeControl && currentEdgeControlPolyIndex !== null && currentEdgeControlIndex !== null) {
    e.preventDefault();
    if (currentEdgeControlPolyIndex === "current") {
      currentPolygon.points[currentEdgeControlIndex].edgeControl = { x: pos.x, y: pos.y };
    } else {
      polygons[currentEdgeControlPolyIndex].points[currentEdgeControlIndex].edgeControl = { x: pos.x, y: pos.y };
    }
    stateChanged = true;
    scheduleUpdate();
  }
  else if (draggingVertex && currentDragPolyIndex !== null && currentDragVertexIndex !== null) {
    e.preventDefault();
    if (currentDragPolyIndex === "current") {
      currentPolygon.points[currentDragVertexIndex].x = pos.x;
      currentPolygon.points[currentDragVertexIndex].y = pos.y;
    } else {
      polygons[currentDragPolyIndex].points[currentDragVertexIndex].x = pos.x;
      polygons[currentDragPolyIndex].points[currentDragVertexIndex].y = pos.y;
    }
    stateChanged = true;
    scheduleUpdate();
  }
  else if (draggingPolygon && polygonDragStart) {
    e.preventDefault();
    const dx = pos.x - polygonDragStart.x;
    const dy = pos.y - polygonDragStart.y;
    if (currentDragPolyIndex === "current") {
      for (let i = 0; i < currentPolygon.points.length; i++) {
        currentPolygon.points[i].x = initialPolygonPoints[i].x + dx;
        currentPolygon.points[i].y = initialPolygonPoints[i].y + dy;
        if (currentPolygon.points[i].edgeControl && initialEdgeControls[i]) {
          currentPolygon.points[i].edgeControl.x = initialEdgeControls[i].x + dx;
          currentPolygon.points[i].edgeControl.y = initialEdgeControls[i].y + dy;
        }
      }
    } else {
      for (let i = 0; i < polygons[currentDragPolyIndex].points.length; i++) {
        polygons[currentDragPolyIndex].points[i].x = initialPolygonPoints[i].x + dx;
        polygons[currentDragPolyIndex].points[i].y = initialPolygonPoints[i].y + dy;
        if (polygons[currentDragPolyIndex].points[i].edgeControl && initialEdgeControls[i]) {
          polygons[currentDragPolyIndex].points[i].edgeControl.x = initialEdgeControls[i].x + dx;
          polygons[currentDragPolyIndex].points[i].edgeControl.y = initialEdgeControls[i].y + dy;
        }
      }
    }
    stateChanged = true;
    scheduleUpdate();
  }
  else if (currentMode === "draw") {
    currentMousePos = pos;
    scheduleUpdate();
  }
}
canvas.addEventListener("mousemove", handleCanvasMove);
canvas.addEventListener("touchmove", handleCanvasMove);

function endDrag(e) {
  if (stateChanged) {
    saveState();
    stateChanged = false;
  }
  draggingEdgeControl = false;
  draggingVertex = false;
  draggingPolygon = false;
  currentEdgeControlPolyIndex = null;
  currentEdgeControlIndex = null;
  currentDragPolyIndex = null;
  currentDragVertexIndex = null;
  polygonDragStart = null;
}
canvas.addEventListener("mouseup", endDrag);
canvas.addEventListener("touchend", endDrag);

clearBtn.addEventListener("click", function() {
  saveState();
  polygons = [];
  currentPolygon = { points: [], isClosed: false };
  selectedPolygonIndex = null;
  updateDrawing();
});
closePolygonBtn.addEventListener("click", function() {
  if (currentMode === "draw") {
    if (currentPolygon.points.length > 2) {
      saveState();
      currentPolygon.isClosed = true;
      polygons.push(currentPolygon);
      currentPolygon = { points: [], isClosed: false };
      updateDrawing();
    } else {
      alert("ポリゴンを閉じるには3点以上必要です。");
    }
  }
});
showEdgeLengthCheckbox.addEventListener("change", function() {
  saveState();
  updateDrawing();
});
showAngleCheckbox.addEventListener("change", function() {
  saveState();
  updateDrawing();
});
showGridCheckbox.addEventListener("change", updateDrawing);
if(snapGridCheckbox) { snapGridCheckbox.addEventListener("change", updateDrawing); }

// -------------------------------
// ズーム機能：wheel イベントリスナー
// -------------------------------
canvas.addEventListener("wheel", function(e) {
  e.preventDefault();
  const scaleFactor = 1.1;
  if (e.deltaY < 0) {
    zoomLevel *= scaleFactor;
  } else {
    zoomLevel /= scaleFactor;
  }
  zoomLevel = Math.max(0.5, Math.min(zoomLevel, 3));
  scheduleUpdate();
});

// -------------------------------
// 描画関数
// -------------------------------
function updateDrawing() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(zoomLevel, zoomLevel);
  if (showGridCheckbox.checked) {
    drawGrid();
  }
  polygons.forEach(poly => {
    if (poly.points.length > 1) {
      const segCount = poly.isClosed ? poly.points.length : poly.points.length - 1;
      for (let i = 0; i < segCount; i++) {
        const p1 = poly.points[i];
        const p2 = poly.points[(i+1) % poly.points.length];
        ctx.beginPath();
        ctx.strokeStyle = p1.edgeProperty.segmentColor;
        ctx.lineWidth = 2;
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        if (showEdgeLengthCheckbox.checked && p1.edgeProperty.showEdgeLength) {
          const cp = getEdgeControlPoint(poly, i);
          drawEdgeLengthBezier(p1, p2, cp);
        }
      }
      if (showAngleCheckbox.checked) {
        if (poly.isClosed) {
          for (let i = 0; i < poly.points.length; i++) {
            if (poly.points[i].angleProperty.showAngle) {
              const prev = poly.points[(i-1+poly.points.length)%poly.points.length];
              const curr = poly.points[i];
              const next = poly.points[(i+1)%poly.points.length];
              drawAngleFan(prev, curr, next, poly.points[i].angleProperty.radius);
            }
          }
        } else if (poly.points.length >= 3) {
          for (let i = 1; i < poly.points.length - 1; i++) {
            if (poly.points[i].angleProperty.showAngle) {
              const prev = poly.points[i-1];
              const curr = poly.points[i];
              const next = poly.points[i+1];
              drawAngleFan(prev, curr, next, poly.points[i].angleProperty.radius);
            }
          }
        }
      }
      if (currentMode === "edit") {
        poly.points.forEach(p => drawVertex(p));
        const segCount = poly.points.length > 0 ? (poly.isClosed ? poly.points.length : poly.points.length - 1) : 0;
        for (let i = 0; i < segCount; i++) {
          const cp = getEdgeControlPoint(poly, i);
          drawEdgeControl(cp);
        }
      }
    }
  });
  if (currentPolygon.points.length > 0) {
    if (currentPolygon.points.length > 1) {
      const segCount = currentPolygon.points.length - 1;
      for (let i = 0; i < segCount; i++) {
        const p1 = currentPolygon.points[i];
        const p2 = currentPolygon.points[i+1];
        ctx.beginPath();
        ctx.strokeStyle = p1.edgeProperty.segmentColor;
        ctx.lineWidth = 2;
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        if (showEdgeLengthCheckbox.checked && p1.edgeProperty.showEdgeLength) {
          const cp = getEdgeControlPoint(currentPolygon, i);
          drawEdgeLengthBezier(p1, p2, cp);
        }
      }
      if (showAngleCheckbox.checked && currentPolygon.points.length >= 3) {
        for (let i = 1; i < currentPolygon.points.length - 1; i++) {
          if (currentPolygon.points[i].angleProperty.showAngle) {
            const prev = currentPolygon.points[i-1];
            const curr = currentPolygon.points[i];
            const next = currentPolygon.points[i+1];
            drawAngleFan(prev, curr, next, currentPolygon.points[i].angleProperty.radius);
          }
        }
      }
    }
    if (currentMode === "edit") {
      currentPolygon.points.forEach(p => drawVertex(p));
      const segCount = currentPolygon.points.length > 0 ? currentPolygon.points.length - 1 : 0;
      for (let i = 0; i < segCount; i++) {
        const cp = getEdgeControlPoint(currentPolygon, i);
        drawEdgeControl(cp);
      }
    }
    if (currentMode === "draw" && currentMousePos) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      const lastPoint = currentPolygon.points[currentPolygon.points.length - 1];
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(currentMousePos.x, currentMousePos.y);
      ctx.stroke();
      ctx.restore();
    }
  }
  updatePropertyPanel();
  ctx.restore();
}

function drawEdgeLengthBezier(p1, p2, cp) {
  ctx.strokeStyle = p1.edgeProperty.bezierColor;
  ctx.lineWidth = 2;
  let gap = p1.edgeProperty.bezierGap;
  if (gap >= 1) {
    // gapが1以上なら描画しない
  } else if (gap <= 0) {
    drawQuadraticSegment(p1, cp, p2, 0, 1);
  } else {
    let t1 = 0.5 - gap/2;
    let t2 = 0.5 + gap/2;
    drawQuadraticSegment(p1, cp, p2, 0, t1);
    drawQuadraticSegment(p1, cp, p2, t2, 1);
  }
  const len = approximateQuadraticBezierLength(p1, cp, p2);
  const mid = quadraticBezierPoint(0.5, p1, cp, p2);
  const pt1 = quadraticBezierPoint(0.48, p1, cp, p2);
  const pt2 = quadraticBezierPoint(0.52, p1, cp, p2);
  const derivative = { x: pt2.x - pt1.x, y: pt2.y - pt1.y };
  const norm = Math.sqrt(derivative.x*derivative.x + derivative.y*derivative.y);
  const normal = { x: -derivative.y/norm, y: derivative.x/norm };
  // もともとのオフセットと固定シフトに加え、edgeProperty.labelOffsetX/Yを反映
  const baseOffset = 5;
  const verticalShift = -10;
  const xAdj = p1.edgeProperty.labelOffsetX || 0;
  const yAdj = p1.edgeProperty.labelOffsetY || 0;
  const fontSize = p1.edgeProperty.labelFontSize || 12;
  const textPos = { 
    x: mid.x + normal.x * baseOffset + xAdj, 
    y: mid.y + normal.y * baseOffset + verticalShift + yAdj 
  };
  ctx.fillStyle = p1.edgeProperty.labelColor;
  ctx.font = fontSize + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = p1.edgeProperty.labelOverride.trim() !== "" ? p1.edgeProperty.labelOverride : len.toFixed(1);
  ctx.fillText(label, textPos.x, textPos.y);
}

function quadraticBezierPoint(t, p0, cp, p1) {
  const x = (1-t)*(1-t)*p0.x + 2*(1-t)*t*cp.x + t*t*p1.x;
  const y = (1-t)*(1-t)*p0.y + 2*(1-t)*t*cp.y + t*t*p1.y;
  return { x, y };
}

function drawQuadraticSegment(p0, cp, p1, t0, t1) {
  const numSegments = 20;
  const dt = (t1 - t0) / numSegments;
  ctx.beginPath();
  let start = quadraticBezierPoint(t0, p0, cp, p1);
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i <= numSegments; i++) {
    const t = t0 + dt*i;
    const pt = quadraticBezierPoint(t, p0, cp, p1);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
}

function approximateQuadraticBezierLength(p0, cp, p1) {
  const numSegments = 20;
  let length = 0;
  let prev = p0;
  for (let i = 1; i <= numSegments; i++) {
    const t = i/numSegments;
    const pt = quadraticBezierPoint(t, p0, cp, p1);
    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;
    length += Math.sqrt(dx*dx + dy*dy);
    prev = pt;
  }
  return length;
}

function drawAngleFan(pPrev, p, pNext, radius) {
  const v1 = { x: pPrev.x - p.x, y: pPrev.y - p.y };
  const v2 = { x: pNext.x - p.x, y: pNext.y - p.y };
  let angle1 = Math.atan2(v1.y, v1.x);
  let angle2 = Math.atan2(v2.y, v2.x);
  let diff = angle2 - angle1;
  while(diff < -Math.PI) diff += 2*Math.PI;
  while(diff > Math.PI) diff -= 2*Math.PI;
  const absDiff = Math.abs(diff);
  const internalCenter = Math.atan2(Math.sin(angle1)+Math.sin(angle2), Math.cos(angle1)+Math.cos(angle2));
  const internalHalfAngle = absDiff / 2;
  const externalCenter = (internalCenter + Math.PI) % (2*Math.PI);
  const externalHalfAngle = (2*Math.PI - absDiff) / 2;
  const fanPos = (p.angleProperty.fanPosition !== undefined) ? p.angleProperty.fanPosition : 0;
  const center = lerpAngle(internalCenter, externalCenter, fanPos);
  const halfAngle = internalHalfAngle * (1 - fanPos) + externalHalfAngle * fanPos;
  const startAngle = center - halfAngle;
  const endAngle = center + halfAngle;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.arc(p.x, p.y, radius, startAngle, endAngle, false);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,0,0,0.3)";
  ctx.fill();
  ctx.strokeStyle = "red";
  ctx.lineWidth = 1;
  ctx.stroke();
  // テキスト位置：もともとの位置に加え、angleProperty.labelOffsetX/Yを反映
  const baseX = p.x + (radius+10)*Math.cos(center);
  const baseY = p.y + (radius+10)*Math.sin(center);
  const xAdj = p.angleProperty.labelOffsetX || 0;
  const yAdj = p.angleProperty.labelOffsetY || 0;
  const fontSize = p.angleProperty.labelFontSize || 12;
  const textX = baseX + xAdj;
  const textY = baseY + yAdj;
  ctx.fillStyle = "red";
  ctx.font = fontSize + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = p.angleProperty.labelOverride.trim() !== "" ? p.angleProperty.labelOverride : (absDiff*180/Math.PI).toFixed(1)+"°";
  ctx.fillText(label, textX, textY);
}

function drawVertex(p) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, 2*Math.PI);
  ctx.fillStyle = "yellow";
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawEdgeControl(cp) {
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, 5, 0, 2*Math.PI);
  ctx.fillStyle = "blue";
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// -------------------------------
// ポリゴン複製機能（ディープコピーして polygons に追加）
function duplicatePolygon(poly) {
  const newPoly = JSON.parse(JSON.stringify(poly));
  polygons.push(newPoly);
  saveState();
  updateDrawing();
}

// -------------------------------
// プロパティパネル更新処理
// -------------------------------
function updatePropertyPanel() {
  polyPropertiesDiv.innerHTML = "";
  if (currentMode !== "edit" || selectedPolygonIndex === null) {
    polyPropertiesDiv.innerHTML = "<p>ポリゴンが選択されていません</p>";
    return;
  }
  let poly, headerText;
  if (selectedPolygonIndex === "current") {
    poly = currentPolygon;
    headerText = "未完成ポリゴン";
  } else {
    poly = polygons[selectedPolygonIndex];
    headerText = `ポリゴン ${selectedPolygonIndex+1}`;
  }
  const polyContainer = document.createElement("div");
  polyContainer.className = "polyContainer";
  const header = document.createElement("h3");
  header.textContent = headerText;
  polyContainer.appendChild(header);
  
  if (selectedPolygonIndex !== "current") {
    const duplicateBtn = document.createElement("button");
    duplicateBtn.textContent = "複製";
    duplicateBtn.addEventListener("click", function() {
      duplicatePolygon(poly);
    });
    polyContainer.appendChild(duplicateBtn);
  }
  
  const edgeHeader = document.createElement("div");
  edgeHeader.className = "subHeader";
  edgeHeader.textContent = "辺のプロパティ";
  polyContainer.appendChild(edgeHeader);
  const edgeCount = poly.points.length > 0 ? (poly.isClosed ? poly.points.length : poly.points.length - 1) : 0;
  for (let i = 0; i < edgeCount; i++) {
    const container = document.createElement("div");
    container.className = "propItem";
    
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = poly.points[i].edgeProperty.showEdgeLength;
    cb.addEventListener("change", function() {
      poly.points[i].edgeProperty.showEdgeLength = cb.checked;
      saveState();
      updateDrawing();
    });
    container.appendChild(cb);
    const label = document.createElement("label");
    label.textContent = `辺 ${i+1} 表示`;
    container.appendChild(label);
    
    const segmentColorInput = document.createElement("input");
    segmentColorInput.type = "color";
    segmentColorInput.value = poly.points[i].edgeProperty.segmentColor;
    segmentColorInput.addEventListener("input", function() {
      poly.points[i].edgeProperty.segmentColor = segmentColorInput.value;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 線分色: "));
    container.appendChild(segmentColorInput);
    
    const bezierColorInput = document.createElement("input");
    bezierColorInput.type = "color";
    bezierColorInput.value = poly.points[i].edgeProperty.bezierColor;
    bezierColorInput.addEventListener("input", function() {
      poly.points[i].edgeProperty.bezierColor = bezierColorInput.value;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" ベジェ色: "));
    container.appendChild(bezierColorInput);
    
    const labelColorInput = document.createElement("input");
    labelColorInput.type = "color";
    labelColorInput.value = poly.points[i].edgeProperty.labelColor;
    labelColorInput.addEventListener("input", function() {
      poly.points[i].edgeProperty.labelColor = labelColorInput.value;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" ラベル色: "));
    container.appendChild(labelColorInput);
    
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.placeholder = "自動値";
    textInput.value = poly.points[i].edgeProperty.labelOverride || "";
    textInput.addEventListener("change", function() {
      poly.points[i].edgeProperty.labelOverride = textInput.value;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 表示ラベル: "));
    container.appendChild(textInput);
    
    const gapRangeElem = createLabelRange("ベジェ切れ目", poly.points[i].edgeProperty.bezierGap, 0, 1, 0.05, (ev) => {
      poly.points[i].edgeProperty.bezierGap = parseFloat(ev.target.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(gapRangeElem);
    
    // 追加：ラベル位置X, Y, 文字サイズ（エッジ）
    const offsetXInput = document.createElement("input");
    offsetXInput.type = "number";
    offsetXInput.value = poly.points[i].edgeProperty.labelOffsetX || 0;
    offsetXInput.style.width = "60px";
    offsetXInput.addEventListener("change", function() {
      poly.points[i].edgeProperty.labelOffsetX = parseFloat(offsetXInput.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" ラベルX: "));
    container.appendChild(offsetXInput);
    
    const offsetYInput = document.createElement("input");
    offsetYInput.type = "number";
    offsetYInput.value = poly.points[i].edgeProperty.labelOffsetY || 0;
    offsetYInput.style.width = "60px";
    offsetYInput.addEventListener("change", function() {
      poly.points[i].edgeProperty.labelOffsetY = parseFloat(offsetYInput.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" ラベルY: "));
    container.appendChild(offsetYInput);
    
    const fontSizeInput = document.createElement("input");
    fontSizeInput.type = "number";
    fontSizeInput.value = poly.points[i].edgeProperty.labelFontSize || 12;
    fontSizeInput.style.width = "60px";
    fontSizeInput.addEventListener("change", function() {
      poly.points[i].edgeProperty.labelFontSize = parseFloat(fontSizeInput.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 文字サイズ: "));
    container.appendChild(fontSizeInput);
    
    polyContainer.appendChild(container);
  }
  
  const angleHeader = document.createElement("div");
  angleHeader.className = "subHeader";
  angleHeader.textContent = "角のプロパティ";
  polyContainer.appendChild(angleHeader);
  let angleIndices = [];
  if (poly.isClosed) {
    for (let i = 0; i < poly.points.length; i++) { angleIndices.push(i); }
  } else if (poly.points.length >= 3) {
    for (let i = 1; i < poly.points.length - 1; i++) { angleIndices.push(i); }
  }
  angleIndices.forEach(i => {
    const container = document.createElement("div");
    container.className = "propItem";
    const angleCb = document.createElement("input");
    angleCb.type = "checkbox";
    angleCb.checked = poly.points[i].angleProperty.showAngle;
    angleCb.addEventListener("change", function() {
      poly.points[i].angleProperty.showAngle = angleCb.checked;
      saveState();
      updateDrawing();
    });
    container.appendChild(angleCb);
    const angleLabel = document.createElement("label");
    angleLabel.textContent = `頂点 ${i+1} 表示`;
    container.appendChild(angleLabel);
    
    const radiusSlider = document.createElement("input");
    radiusSlider.type = "range";
    radiusSlider.min = "10";
    radiusSlider.max = "100";
    radiusSlider.value = poly.points[i].angleProperty.radius;
    const radiusSpan = document.createElement("span");
    radiusSpan.textContent = radiusSlider.value;
    radiusSlider.addEventListener("input", function() {
      poly.points[i].angleProperty.radius = parseFloat(radiusSlider.value);
      radiusSpan.textContent = radiusSlider.value;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 半径: "));
    container.appendChild(radiusSlider);
    container.appendChild(radiusSpan);
    
    const fanCheckbox = document.createElement("input");
    fanCheckbox.type = "checkbox";
    fanCheckbox.checked = (poly.points[i].angleProperty.fanPosition === 1);
    fanCheckbox.addEventListener("change", function() {
      poly.points[i].angleProperty.fanPosition = fanCheckbox.checked ? 1 : 0;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 外側扇形: "));
    container.appendChild(fanCheckbox);
    
    const angleTextInput = document.createElement("input");
    angleTextInput.type = "text";
    angleTextInput.placeholder = "自動値";
    angleTextInput.value = poly.points[i].angleProperty.labelOverride || "";
    angleTextInput.addEventListener("change", function() {
      poly.points[i].angleProperty.labelOverride = angleTextInput.value;
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 表示ラベル: "));
    container.appendChild(angleTextInput);
    
    // 追加：角ラベルの位置・文字サイズ
    const angleOffsetXInput = document.createElement("input");
    angleOffsetXInput.type = "number";
    angleOffsetXInput.value = poly.points[i].angleProperty.labelOffsetX || 0;
    angleOffsetXInput.style.width = "60px";
    angleOffsetXInput.addEventListener("change", function() {
      poly.points[i].angleProperty.labelOffsetX = parseFloat(angleOffsetXInput.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" ラベルX: "));
    container.appendChild(angleOffsetXInput);
    
    const angleOffsetYInput = document.createElement("input");
    angleOffsetYInput.type = "number";
    angleOffsetYInput.value = poly.points[i].angleProperty.labelOffsetY || 0;
    angleOffsetYInput.style.width = "60px";
    angleOffsetYInput.addEventListener("change", function() {
      poly.points[i].angleProperty.labelOffsetY = parseFloat(angleOffsetYInput.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" ラベルY: "));
    container.appendChild(angleOffsetYInput);
    
    const angleFontSizeInput = document.createElement("input");
    angleFontSizeInput.type = "number";
    angleFontSizeInput.value = poly.points[i].angleProperty.labelFontSize || 12;
    angleFontSizeInput.style.width = "60px";
    angleFontSizeInput.addEventListener("change", function() {
      poly.points[i].angleProperty.labelFontSize = parseFloat(angleFontSizeInput.value);
      saveState();
      updateDrawing();
    });
    container.appendChild(document.createTextNode(" 文字サイズ: "));
    container.appendChild(angleFontSizeInput);
    
    polyContainer.appendChild(container);
  });
  
  polyPropertiesDiv.appendChild(polyContainer);
}

// -------------------------------
// 初期描画
// -------------------------------
updateDrawing();
