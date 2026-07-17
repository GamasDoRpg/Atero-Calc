import {
  clampSpan,
  SERIES_COLORS
} from "./plot-model.js?v=1";


function niceStep(span, targetLines = 9) {
  const rough = span / targetLines;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;

  if (fraction <= 1) {
    return power;
  }

  if (fraction <= 2) {
    return 2 * power;
  }

  if (fraction <= 5) {
    return 5 * power;
  }

  return 10 * power;
}


export function formatAxisValue(value, step) {
  if (Math.abs(value) < step * 1e-8) {
    return "0";
  }

  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-4) {
    return value.toExponential(3).replace("+", "");
  }

  const decimals = Math.max(
    0,
    Math.min(8, -Math.floor(Math.log10(step)) + 1)
  );

  return Number(value.toFixed(decimals)).toString();
}


export class PlotRenderer {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.state = state;
    this.resultsById = new Map();
  }


  setResults(resultsById) {
    this.resultsById = resultsById;
  }


  enforceAspectRatio(width, height) {
    if (width <= 0 || height <= 0) {
      return;
    }

    const viewport = this.state.viewport;
    const xCenter = (viewport.xMin + viewport.xMax) / 2;
    const yCenter = (viewport.yMin + viewport.yMax) / 2;
    const xSpan = clampSpan(viewport.xMax - viewport.xMin);
    const ySpan = clampSpan(viewport.yMax - viewport.yMin);
    const canvasAspect = width / height;
    const viewportAspect = xSpan / ySpan;

    let correctedXSpan = xSpan;
    let correctedYSpan = ySpan;

    if (viewportAspect > canvasAspect) {
      correctedYSpan = clampSpan(xSpan / canvasAspect);
    } else {
      correctedXSpan = clampSpan(ySpan * canvasAspect);
    }

    viewport.xMin = xCenter - correctedXSpan / 2;
    viewport.xMax = xCenter + correctedXSpan / 2;
    viewport.yMin = yCenter - correctedYSpan / 2;
    viewport.yMax = yCenter + correctedYSpan / 2;
  }


  metrics() {
    const rectangle = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rectangle.width);
    const height = Math.max(1, rectangle.height);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);

    if (
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight
    ) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }

    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.enforceAspectRatio(width, height);

    return { width, height, rectangle };
  }


  mathToScreen(x, y, width, height) {
    const {
      xMin,
      xMax,
      yMin,
      yMax
    } = this.state.viewport;

    const pixelsPerUnit = Math.min(
      width / (xMax - xMin),
      height / (yMax - yMin)
    );

    return {
      x: (x - xMin) * pixelsPerUnit,
      y: (yMax - y) * pixelsPerUnit
    };
  }


  screenToMath(x, y, width, height) {
    const {
      xMin,
      xMax,
      yMin,
      yMax
    } = this.state.viewport;

    const pixelsPerUnit = Math.min(
      width / (xMax - xMin),
      height / (yMax - yMin)
    );

    return {
      x: xMin + x / pixelsPerUnit,
      y: yMax - y / pixelsPerUnit
    };
  }


  coordinateAt(clientX, clientY) {
    const { width, height, rectangle } = this.metrics();

    return this.screenToMath(
      clientX - rectangle.left,
      clientY - rectangle.top,
      width,
      height
    );
  }


  panFrom(startViewport, deltaX, deltaY, width, height) {
    const xSpan = startViewport.xMax - startViewport.xMin;
    const ySpan = startViewport.yMax - startViewport.yMin;
    const pixelsPerUnit = Math.min(
      width / xSpan,
      height / ySpan
    );
    const xShift = -deltaX / pixelsPerUnit;
    const yShift = deltaY / pixelsPerUnit;

    this.state.viewport = {
      xMin: startViewport.xMin + xShift,
      xMax: startViewport.xMax + xShift,
      yMin: startViewport.yMin + yShift,
      yMax: startViewport.yMax + yShift
    };
  }


  zoomAt(clientX, clientY, deltaY) {
    const { width, height, rectangle } = this.metrics();
    const localX = clientX - rectangle.left;
    const localY = clientY - rectangle.top;
    const anchor = this.screenToMath(
      localX,
      localY,
      width,
      height
    );
    const factor = Math.exp(deltaY * 0.0014);
    const oldXSpan =
      this.state.viewport.xMax - this.state.viewport.xMin;
    const oldYSpan =
      this.state.viewport.yMax - this.state.viewport.yMin;
    const newXSpan = clampSpan(oldXSpan * factor);
    const newYSpan = clampSpan(oldYSpan * factor);
    const xRatio = localX / width;
    const yRatio = localY / height;

    this.state.viewport.xMin = anchor.x - xRatio * newXSpan;
    this.state.viewport.xMax = this.state.viewport.xMin + newXSpan;
    this.state.viewport.yMax = anchor.y + yRatio * newYSpan;
    this.state.viewport.yMin = this.state.viewport.yMax - newYSpan;
    this.enforceAspectRatio(width, height);
  }


  resetViewport() {
    this.state.viewport = {
      xMin: -10,
      xMax: 10,
      yMin: -6,
      yMax: 6
    };

    const rectangle = this.canvas.getBoundingClientRect();
    this.enforceAspectRatio(
      Math.max(1, rectangle.width),
      Math.max(1, rectangle.height)
    );
  }


  drawGrid(width, height) {
    const {
      xMin,
      xMax,
      yMin,
      yMax
    } = this.state.viewport;
    const xStep = niceStep(xMax - xMin);
    const yStep = niceStep(yMax - yMin);
    const origin = this.mathToScreen(0, 0, width, height);
    const context = this.context;

    context.save();
    context.lineWidth = 1;
    context.font = "11px Inter, system-ui, sans-serif";
    context.textBaseline = "top";

    if (this.state.showGrid) {
      context.strokeStyle = "rgba(47, 66, 91, 0.10)";
      context.fillStyle = "rgba(65, 78, 96, 0.72)";

      const firstX = Math.ceil(xMin / xStep) * xStep;

      for (
        let value = firstX, guard = 0;
        value <= xMax + xStep * 0.25 && guard < 200;
        value += xStep, guard += 1
      ) {
        const point = this.mathToScreen(value, 0, width, height);
        context.beginPath();
        context.moveTo(point.x, 0);
        context.lineTo(point.x, height);
        context.stroke();

        if (Math.abs(value) > xStep * 1e-8) {
          context.fillText(
            formatAxisValue(value, xStep),
            point.x + 4,
            Math.min(height - 17, Math.max(4, origin.y + 5))
          );
        }
      }

      const firstY = Math.ceil(yMin / yStep) * yStep;

      for (
        let value = firstY, guard = 0;
        value <= yMax + yStep * 0.25 && guard < 200;
        value += yStep, guard += 1
      ) {
        const point = this.mathToScreen(0, value, width, height);
        context.beginPath();
        context.moveTo(0, point.y);
        context.lineTo(width, point.y);
        context.stroke();

        if (Math.abs(value) > yStep * 1e-8) {
          context.fillText(
            formatAxisValue(value, yStep),
            Math.min(width - 58, Math.max(5, origin.x + 6)),
            point.y + 4
          );
        }
      }
    }

    context.strokeStyle = "rgba(28, 41, 60, 0.52)";
    context.lineWidth = 1.25;

    if (origin.x >= 0 && origin.x <= width) {
      context.beginPath();
      context.moveTo(origin.x, 0);
      context.lineTo(origin.x, height);
      context.stroke();
    }

    if (origin.y >= 0 && origin.y <= height) {
      context.beginPath();
      context.moveTo(0, origin.y);
      context.lineTo(width, origin.y);
      context.stroke();
    }

    context.restore();
  }


  drawCurves(width, height) {
    const context = this.context;

    context.save();
    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();
    context.lineJoin = "round";
    context.lineCap = "round";
    context.lineWidth = 2.35;

    for (const item of this.state.expressions) {
      if (!item.visible) {
        continue;
      }

      const plot = this.resultsById.get(item.id);

      if (!plot || !Array.isArray(plot.segments)) {
        continue;
      }

      context.strokeStyle = SERIES_COLORS[item.colorIndex];

      for (const segment of plot.segments) {
        if (!Array.isArray(segment) || segment.length === 0) {
          continue;
        }

        context.beginPath();

        for (const [index, point] of segment.entries()) {
          const screen = this.mathToScreen(
            point.x,
            point.y,
            width,
            height
          );

          if (index === 0) {
            context.moveTo(screen.x, screen.y);
          } else {
            context.lineTo(screen.x, screen.y);
          }
        }

        if (segment.length === 1) {
          const screen = this.mathToScreen(
            segment[0].x,
            segment[0].y,
            width,
            height
          );
          context.arc(screen.x, screen.y, 2.5, 0, Math.PI * 2);
          context.fillStyle = SERIES_COLORS[item.colorIndex];
          context.fill();
        } else {
          context.stroke();
        }
      }
    }

    context.restore();
  }


  draw() {
    const { width, height } = this.metrics();
    const context = this.context;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    this.drawGrid(width, height);
    this.drawCurves(width, height);
  }
}
