// core.js

// -------------------------------
// データ管理と初期化
// -------------------------------
window.polygons = [];
window.currentPolygon = { points: [], isClosed: false };
window.texts = [];    // テキストオブジェクト { x, y, content, fontSize, color }

// スタック関連
window.undoStack = [];
window.redoStack = [];
window.stateChanged = false;
window.updateScheduled = false;

// ズームレベル
window.zoomLevel = 1;

// 選択状態
window.selectedPolygonIndex = null;  // ポリゴンが選択されているときにインデックスを格納
window.selectedTextIndex = null;     // テキストが選択されているときにインデックスを格納

// 現在のモード ("draw", "edit", "delete", "text")
window.currentMode = "draw";

// -------------------------------
// canvas, ctx, 各種DOM要素を取得
// -------------------------------
window.canvas = document.getElementById("drawingArea");
window.ctx = canvas.getContext("2d");

window.modeDrawRadio = document.getElementById("modeDraw");
window.modeEditRadio = document.getElementById("modeEdit");
window.modeDeleteRadio = document.getElementById("modeDelete");
window.modeTextRadio = document.getElementById("modeText");

window.showEdgeLengthCheckbox = document.getElementById("showEdgeLength");
window.showAngleCheckbox = document.getElementById("showAngle");
window.showGridCheckbox = document.getElementById("showGrid");
window.snapGridCheckbox = document.getElementById("snapGrid");

window.closePolygonBtn = document.getElementById("closePolygonBtn");
window.clearBtn = document.getElementById("clearBtn");
window.undoBtn = document.getElementById("undoBtn");
window.redoBtn = document.getElementById("redoBtn");

window.propertyPanel = document.getElementById("propertyPanel");
window.polyPropertiesDiv = document.getElementById("polyProperties");

// -------------------------------
// 共通ユーティリティ関数
// -------------------------------
window.getMousePos = function(event) {
  const rect = canvas.getBoundingClientRect();
  let x, y;
  if (event.touches && event.touches.length > 0) {
    x = event.touches[0].clientX - rect.left;
    y = event.touches[0].clientY - rect.top;
  } else {
    x = event.clientX - rect.left;
    y = event.clientY - rect.top;
  }
  return { x: x / window.zoomLevel, y: y / window.zoomLevel };
};

window.snapToGrid = function(pos) {
  const gridSize = 20;
  return {
    x: Math.round(pos.x / gridSize) * gridSize,
    y: Math.round(pos.y / gridSize) * gridSize
  };
};

window.pointInPolygon = function(point, polyPoints) {
  let inside = false;
  for (let i = 0, j = polyPoints.length - 1; i < polyPoints.length; j = i++) {
    const xi = polyPoints[i].x, yi = polyPoints[i].y;
    const xj = polyPoints[j].x, yj = polyPoints[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

window.getEdgeControlPoint = function(poly, i) {
  const p1 = poly.points[i];
  const p2 = poly.points[(i+1) % poly.points.length];
  if (p1.edgeControl) return p1.edgeControl;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const dist = Math.sqrt(dx*dx + dy*dy);
  const curvature = p1.edgeProperty.curvature;
  return { x: midX - (dy/dist)*curvature, y: midY + (dx/dist)*curvature };
};

window.scheduleUpdate = function() {
  if (!window.updateScheduled) {
    window.updateScheduled = true;
    requestAnimationFrame(() => {
      updateDrawing();
      window.updateScheduled = false;
    });
  }
};

window.lerpAngle = function(a, b, t) {
  let diff = b - a;
  while(diff < -Math.PI) diff += 2*Math.PI;
  while(diff > Math.PI) diff -= 2*Math.PI;
  return a + diff * t;
};

// -------------------------------
// undo/redo 状態管理
// -------------------------------
window.saveState = function() {
  const state = {
    polygons: JSON.parse(JSON.stringify(window.polygons)),
    currentPolygon: JSON.parse(JSON.stringify(window.currentPolygon)),
    texts: JSON.parse(JSON.stringify(window.texts))
  };
  window.undoStack.push(state);
  window.redoStack = [];
};

window.restoreState = function(state) {
  window.polygons = JSON.parse(JSON.stringify(state.polygons));
  window.currentPolygon = JSON.parse(JSON.stringify(state.currentPolygon));
  window.texts = JSON.parse(JSON.stringify(state.texts));
  updateDrawing();
};

window.undo = function() {
  if (window.undoStack.length > 0) {
    const currentState = {
      polygons: JSON.parse(JSON.stringify(window.polygons)),
      currentPolygon: JSON.parse(JSON.stringify(window.currentPolygon)),
      texts: JSON.parse(JSON.stringify(window.texts))
    };
    window.redoStack.push(currentState);
    const prevState = window.undoStack.pop();
    window.restoreState(prevState);
  }
};

window.redo = function() {
  if (window.redoStack.length > 0) {
    const currentState = {
      polygons: JSON.parse(JSON.stringify(window.polygons)),
      currentPolygon: JSON.parse(JSON.stringify(window.currentPolygon)),
      texts: JSON.parse(JSON.stringify(window.texts))
    };
    window.undoStack.push(currentState);
    const nextState = window.redoStack.pop();
    window.restoreState(nextState);
  }
};
