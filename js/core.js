// core.js

// -------------------------------
// データ管理と初期化
// -------------------------------
window.polygons = [];  // 各 poly は { points: [...], isClosed: true }
window.currentPolygon = { points: [], isClosed: false };
window.texts = [];     // 各テキストオブジェクトは { x, y, content, fontSize, color }

window.undoStack = [];
window.redoStack = [];
window.stateChanged = false;
window.updateScheduled = false;
window.zoomLevel = 1;

// 選択中のオブジェクト
window.selectedPolygonIndex = null;
window.selectedTextIndex = null;

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
  return { x: x / zoomLevel, y: y / zoomLevel };
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
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
  const dist = Math.sqrt(dx*dx + dy*dy);
  const curvature = p1.edgeProperty.curvature;
  return { x: midX - (dy/dist)*curvature, y: midY + (dx/dist)*curvature };
};

window.scheduleUpdate = function() {
  if (!updateScheduled) {
    updateScheduled = true;
    requestAnimationFrame(() => {
      updateDrawing();
      updateScheduled = false;
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
    polygons: JSON.parse(JSON.stringify(polygons)),
    currentPolygon: JSON.parse(JSON.stringify(currentPolygon)),
    texts: JSON.parse(JSON.stringify(texts))
  };
  undoStack.push(state);
  redoStack = [];
};

window.restoreState = function(state) {
  polygons = JSON.parse(JSON.stringify(state.polygons));
  currentPolygon = JSON.parse(JSON.stringify(state.currentPolygon));
  texts = JSON.parse(JSON.stringify(state.texts));
  updateDrawing();
};

window.undo = function() {
  if (undoStack.length > 0) {
    const currentState = {
      polygons: JSON.parse(JSON.stringify(polygons)),
      currentPolygon: JSON.parse(JSON.stringify(currentPolygon)),
      texts: JSON.parse(JSON.stringify(texts))
    };
    redoStack.push(currentState);
    const prevState = undoStack.pop();
    restoreState(prevState);
  }
};

window.redo = function() {
  if (redoStack.length > 0) {
    const currentState = {
      polygons: JSON.parse(JSON.stringify(polygons)),
      currentPolygon: JSON.parse(JSON.stringify(currentPolygon)),
      texts: JSON.parse(JSON.stringify(texts))
    };
    undoStack.push(currentState);
    const nextState = redoStack.pop();
    restoreState(nextState);
  }
};
