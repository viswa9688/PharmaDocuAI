import sharp from 'sharp';
import { createCanvas, loadImage, ImageData as CanvasImageData } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import type { 
  VisualAnomaly, 
  VisualAnomalyType, 
  VisualAnalysisResult, 
  BoundingBox,
  AlertSeverity 
} from '../../shared/schema';
import type { PageExtractionData, BoundingBox as DocAIBoundingBox } from './document-ai';

interface PixelData {
  r: number;
  g: number;
  b: number;
  a: number;
}

type ImageDataLike = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

interface DetectedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angle: number;
  length: number;
  thickness: number;
}

interface ColorRegion {
  boundingBox: BoundingBox;
  dominantColor: { r: number; g: number; b: number };
  pixelCount: number;
}

export class VisualAnalyzer {
  private thumbnailDir: string;
  private minLineLength: number = 50; // Increased minimum - real strike-throughs are usually longer
  private lineAngleTolerance: number = 15;

  constructor(thumbnailDir: string = 'uploads/thumbnails') {
    this.thumbnailDir = thumbnailDir;
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }
  }

  async analyzePageImage(
    imagePath: string,
    pageNumber: number,
    textRegions: BoundingBox[],
    documentId: string
  ): Promise<VisualAnalysisResult> {
    const startTime = Date.now();
    const anomalies: VisualAnomaly[] = [];

    try {
      if (!fs.existsSync(imagePath)) {
        console.warn(`Image not found: ${imagePath}`);
        return {
          pageNumber,
          imagePath,
          anomalies: [],
          analysisTimestamp: new Date(),
          processingTimeMs: Date.now() - startTime,
        };
      }

      const imageBuffer = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true });
      const { data, info } = imageBuffer;
      const { width, height, channels } = info;

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      const img = await loadImage(imagePath);
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, width, height);

      // Build layout mask from text regions to identify form structure borders
      const layoutMask = this.buildLayoutMask(textRegions, width, height);

      const lines = await this.detectStrikethroughLines(imageData, width, height);
      
      // Filter out lines that are part of form structure (table borders, cell edges)
      const filteredLines = this.filterFormStructureLines(lines, textRegions, layoutMask, width);
      
      // Further filter: remove lines that form grid patterns (repeating at regular intervals)
      const nonGridLines = this.filterGridPatternLines(filteredLines);

      for (const line of nonGridLines) {
        // Use stricter intersection check with midline and width coverage requirements
        const affectedRegions = this.findAffectedTextRegionsStrict(line, textRegions);
        
        for (const region of affectedRegions) {
          const anomalyId = `strike_${documentId}_p${pageNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const thumbnailPath = await this.generateThumbnail(
            imagePath,
            region,
            anomalyId
          );

          anomalies.push({
            id: anomalyId,
            type: 'strike_through',
            confidence: 85,
            pageNumber,
            boundingBox: this.lineToBoundingBox(line),
            affectedTextRegion: region,
            affectedText: null,
            thumbnailPath,
            severity: 'high',
            description: `Strike-through line detected crossing text region`,
            detectionMethod: 'line_detection',
          });
        }
      }

      const redRegions = await this.detectRedInkRegions(imageData, width, height);
      for (const region of redRegions) {
        const affectedRegions = this.findTextRegionsInArea(region.boundingBox, textRegions);
        
        if (affectedRegions.length > 0 || region.pixelCount > 100) {
          const anomalyId = `red_${documentId}_p${pageNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const thumbnailPath = await this.generateThumbnail(
            imagePath,
            region.boundingBox,
            anomalyId
          );

          anomalies.push({
            id: anomalyId,
            type: 'red_mark',
            confidence: 75,
            pageNumber,
            boundingBox: region.boundingBox,
            affectedTextRegion: affectedRegions[0] || null,
            affectedText: null,
            thumbnailPath,
            severity: this.getRedMarkSeverity(region, affectedRegions),
            description: `Red ink/pen mark detected${affectedRegions.length > 0 ? ' near text' : ''}`,
            detectionMethod: 'color_mask',
          });
        }
      }

      const erasureRegions = await this.detectErasureRegions(imageData, width, height, textRegions);
      for (const region of erasureRegions) {
        const anomalyId = `erasure_${documentId}_p${pageNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const thumbnailPath = await this.generateThumbnail(
          imagePath,
          region,
          anomalyId
        );

        anomalies.push({
          id: anomalyId,
          type: 'erasure',
          confidence: 60,
          pageNumber,
          boundingBox: region,
          affectedTextRegion: region,
          affectedText: null,
          thumbnailPath,
          severity: 'medium',
          description: 'Possible erasure or correction fluid detected',
          detectionMethod: 'brightness_analysis',
        });
      }

      const consolidatedAnomalies = this.consolidateNearbyAnomalies(anomalies);

      return {
        pageNumber,
        imagePath,
        anomalies: consolidatedAnomalies,
        analysisTimestamp: new Date(),
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`Visual analysis error for page ${pageNumber}:`, error);
      return {
        pageNumber,
        imagePath,
        anomalies: [],
        analysisTimestamp: new Date(),
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  private async detectStrikethroughLines(
    imageData: ImageDataLike,
    width: number,
    height: number
  ): Promise<DetectedLine[]> {
    const lines: DetectedLine[] = [];
    const data = imageData.data;

    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      grayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    const edges = this.sobelEdgeDetection(grayscale, width, height);

    for (let y = 5; y < height - 5; y++) {
      let lineStart = -1;
      let consecutiveDark = 0;
      
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const isDark = grayscale[idx] < 100;
        const isEdge = edges[idx] > 50;
        
        if (isDark || isEdge) {
          if (lineStart === -1) lineStart = x;
          consecutiveDark++;
        } else {
          if (consecutiveDark >= this.minLineLength) {
            const isHorizontalLine = this.validateHorizontalLine(
              grayscale, width, height, lineStart, y, x - 1
            );
            
            if (isHorizontalLine) {
              lines.push({
                x1: lineStart,
                y1: y,
                x2: x - 1,
                y2: y,
                angle: 0,
                length: x - 1 - lineStart,
                thickness: this.estimateLineThickness(grayscale, width, height, lineStart, y, x - 1),
              });
            }
          }
          lineStart = -1;
          consecutiveDark = 0;
        }
      }
    }

    const diagonalLines = this.detectDiagonalLines(grayscale, edges, width, height);
    lines.push(...diagonalLines);

    return this.filterValidStrikethroughLines(lines);
  }

  private sobelEdgeDetection(
    grayscale: Uint8Array,
    width: number,
    height: number
  ): Uint8Array {
    const edges = new Uint8Array(width * height);
    
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixel = grayscale[(y + ky) * width + (x + kx)];
            const kidx = (ky + 1) * 3 + (kx + 1);
            gx += pixel * sobelX[kidx];
            gy += pixel * sobelY[kidx];
          }
        }
        
        edges[y * width + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      }
    }

    return edges;
  }

  private validateHorizontalLine(
    grayscale: Uint8Array,
    width: number,
    height: number,
    x1: number,
    y: number,
    x2: number
  ): boolean {
    const lineLength = x2 - x1;
    if (lineLength < this.minLineLength) return false;

    let darkPixels = 0;
    for (let x = x1; x <= x2; x++) {
      if (grayscale[y * width + x] < 120) darkPixels++;
    }
    const continuity = darkPixels / lineLength;

    let aboveAvg = 0, belowAvg = 0;
    const checkRange = 3;
    for (let x = x1; x <= x2; x += 5) {
      for (let dy = 1; dy <= checkRange; dy++) {
        if (y - dy >= 0) aboveAvg += grayscale[(y - dy) * width + x];
        if (y + dy < height) belowAvg += grayscale[(y + dy) * width + x];
      }
    }
    
    const samplesPerSide = Math.floor((x2 - x1) / 5) * checkRange;
    if (samplesPerSide > 0) {
      aboveAvg /= samplesPerSide;
      belowAvg /= samplesPerSide;
    }

    const lineAvg = darkPixels > 0 ? 
      Array.from({ length: x2 - x1 + 1 }, (_, i) => grayscale[y * width + x1 + i])
        .reduce((a, b) => a + b, 0) / (x2 - x1 + 1) : 128;

    const contrastAbove = aboveAvg - lineAvg;
    const contrastBelow = belowAvg - lineAvg;

    return continuity > 0.7 && (contrastAbove > 30 || contrastBelow > 30);
  }

  private detectDiagonalLines(
    grayscale: Uint8Array,
    edges: Uint8Array,
    width: number,
    height: number
  ): DetectedLine[] {
    const lines: DetectedLine[] = [];
    const visited = new Set<string>();
    const minDiagLength = this.minLineLength * 1.4;

    for (let y = 0; y < height; y += 3) {
      for (let x = 0; x < width; x += 3) {
        if (edges[y * width + x] < 50) continue;
        
        const key = `${x},${y}`;
        if (visited.has(key)) continue;

        for (const angle of [30, 45, 60, 120, 135, 150]) {
          const rad = angle * Math.PI / 180;
          const dx = Math.cos(rad);
          const dy = Math.sin(rad);
          
          let length = 0;
          let cx = x, cy = y;
          
          while (cx >= 0 && cx < width && cy >= 0 && cy < height) {
            const idx = Math.floor(cy) * width + Math.floor(cx);
            if (grayscale[idx] < 100 || edges[idx] > 40) {
              length++;
              visited.add(`${Math.floor(cx)},${Math.floor(cy)}`);
            } else {
              break;
            }
            cx += dx;
            cy += dy;
          }

          if (length >= minDiagLength) {
            lines.push({
              x1: x,
              y1: y,
              x2: Math.floor(cx),
              y2: Math.floor(cy),
              angle,
              length,
              thickness: 2,
            });
          }
        }
      }
    }

    return lines;
  }

  private estimateLineThickness(
    grayscale: Uint8Array,
    width: number,
    height: number,
    x1: number,
    y: number,
    x2: number
  ): number {
    let totalThickness = 0;
    let samples = 0;
    
    for (let x = x1; x <= x2; x += 10) {
      let upCount = 0, downCount = 0;
      
      for (let dy = 1; dy <= 10; dy++) {
        if (y - dy >= 0 && grayscale[(y - dy) * width + x] < 120) upCount++;
        else break;
      }
      
      for (let dy = 1; dy <= 10; dy++) {
        if (y + dy < height && grayscale[(y + dy) * width + x] < 120) downCount++;
        else break;
      }
      
      totalThickness += 1 + upCount + downCount;
      samples++;
    }
    
    return samples > 0 ? totalThickness / samples : 1;
  }

  private filterValidStrikethroughLines(lines: DetectedLine[]): DetectedLine[] {
    return lines.filter(line => {
      const isNearlyHorizontal = Math.abs(line.angle) < this.lineAngleTolerance || 
                                  Math.abs(line.angle - 180) < this.lineAngleTolerance;
      const isNearlyDiagonal = Math.abs(line.angle - 45) < this.lineAngleTolerance ||
                                Math.abs(line.angle - 135) < this.lineAngleTolerance;
      
      const hasGoodLength = line.length >= this.minLineLength;
      const hasReasonableThickness = line.thickness >= 1 && line.thickness <= 15;

      return (isNearlyHorizontal || isNearlyDiagonal) && hasGoodLength && hasReasonableThickness;
    });
  }

  /**
   * Build a layout mask identifying form structure borders
   * Lines at cell edges (top/bottom boundaries) are likely form borders, not strike-throughs
   */
  private buildLayoutMask(textRegions: BoundingBox[], imageWidth: number, imageHeight: number): Set<number> {
    const borderMask = new Set<number>();
    const borderThickness = 5; // pixels tolerance for border detection

    for (const region of textRegions) {
      // Mark top edge of each text region as potential form border
      const topY = Math.floor(region.y);
      for (let dy = -borderThickness; dy <= borderThickness; dy++) {
        const y = topY + dy;
        if (y >= 0 && y < imageHeight) {
          for (let x = Math.floor(region.x); x < Math.floor(region.x + region.width); x++) {
            if (x >= 0 && x < imageWidth) {
              borderMask.add(y * imageWidth + x);
            }
          }
        }
      }

      // Mark bottom edge of each text region as potential form border
      const bottomY = Math.floor(region.y + region.height);
      for (let dy = -borderThickness; dy <= borderThickness; dy++) {
        const y = bottomY + dy;
        if (y >= 0 && y < imageHeight) {
          for (let x = Math.floor(region.x); x < Math.floor(region.x + region.width); x++) {
            if (x >= 0 && x < imageWidth) {
              borderMask.add(y * imageWidth + x);
            }
          }
        }
      }
    }

    return borderMask;
  }

  /**
   * Filter out lines that align with form structure (table/cell borders)
   * Note: We intentionally do NOT filter by line length - real strike-throughs can span
   * wide fields (long comments, signature lines, multi-column entries)
   */
  private filterFormStructureLines(
    lines: DetectedLine[],
    textRegions: BoundingBox[],
    layoutMask: Set<number>,
    imageWidth: number
  ): DetectedLine[] {
    return lines.filter(line => {
      // Check 1: Skip lines whose Y coordinate aligns with cell edges
      // Sample points along the line to check if they fall on the layout mask
      let borderPixelCount = 0;
      const sampleCount = Math.min(20, Math.floor(line.length / 5));
      
      for (let i = 0; i <= sampleCount; i++) {
        const t = sampleCount > 0 ? i / sampleCount : 0;
        const x = Math.floor(line.x1 + t * (line.x2 - line.x1));
        const y = Math.floor(line.y1 + t * (line.y2 - line.y1));
        const idx = y * imageWidth + x;
        
        if (layoutMask.has(idx)) {
          borderPixelCount++;
        }
      }

      // If >60% of line samples fall on form borders, it's likely a table border
      const borderRatio = borderPixelCount / (sampleCount + 1);
      if (borderRatio > 0.6) {
        return false;
      }

      // Check 2: Skip purely horizontal lines at exactly text region boundaries
      if (Math.abs(line.angle) < 3) { // Nearly perfectly horizontal
        const lineY = line.y1;
        
        for (const region of textRegions) {
          const regionTop = region.y;
          const regionBottom = region.y + region.height;
          
          // Line is within 3 pixels of a region's top or bottom edge
          if (Math.abs(lineY - regionTop) < 3 || Math.abs(lineY - regionBottom) < 3) {
            // And the line spans most of the region width
            const lineLeft = Math.min(line.x1, line.x2);
            const lineRight = Math.max(line.x1, line.x2);
            const overlap = Math.min(lineRight, region.x + region.width) - Math.max(lineLeft, region.x);
            
            if (overlap > region.width * 0.7) {
              return false; // This is likely a cell border
            }
          }
        }
      }

      return true;
    });
  }

  /**
   * Filter out lines that form grid patterns (regular spacing = table structure)
   */
  private filterGridPatternLines(lines: DetectedLine[]): DetectedLine[] {
    if (lines.length < 3) return lines;

    // Group horizontal lines by Y coordinate (within tolerance)
    const horizontalLines = lines.filter(l => Math.abs(l.angle) < 10);
    const yCoords = horizontalLines.map(l => l.y1).sort((a, b) => a - b);
    
    if (yCoords.length < 3) return lines;

    // Calculate spacing between consecutive lines
    const spacings: number[] = [];
    for (let i = 1; i < yCoords.length; i++) {
      spacings.push(yCoords[i] - yCoords[i - 1]);
    }

    // Check if spacings are regular (typical of table rows)
    const avgSpacing = spacings.reduce((a, b) => a + b, 0) / spacings.length;
    const regularSpacingCount = spacings.filter(s => Math.abs(s - avgSpacing) < avgSpacing * 0.15).length;
    
    // If >70% of spacings are regular, these are likely table row borders
    if (regularSpacingCount / spacings.length > 0.7 && horizontalLines.length > 4) {
      // Remove all the regular-spaced horizontal lines (they're table borders)
      const gridYCoordsArray = yCoords;
      return lines.filter(l => {
        if (Math.abs(l.angle) >= 10) return true; // Keep non-horizontal lines
        
        // Check if this line's Y is part of the grid pattern
        for (let i = 0; i < gridYCoordsArray.length; i++) {
          if (Math.abs(l.y1 - gridYCoordsArray[i]) < 5) {
            return false; // Part of grid pattern, filter out
          }
        }
        return true;
      });
    }

    return lines;
  }

  /**
   * Stricter version of findAffectedTextRegions with midline intersection and width coverage checks
   * A true strike-through must:
   * 1. Cross through the middle 30% of text height (35-65% of box height)
   * 2. Span at least 40% of the text box width
   */
  private findAffectedTextRegionsStrict(line: DetectedLine, textRegions: BoundingBox[]): BoundingBox[] {
    const affected: BoundingBox[] = [];

    for (const region of textRegions) {
      if (this.doesLineIntersectBoxStrict(line, region)) {
        affected.push(region);
      }
    }

    return affected;
  }

  /**
   * Strict intersection check requiring midline crossing and width coverage
   */
  private doesLineIntersectBoxStrict(line: DetectedLine, box: BoundingBox): boolean {
    const boxTop = box.y;
    const boxBottom = box.y + box.height;
    const boxLeft = box.x;
    const boxRight = box.x + box.width;

    const lineLeft = Math.min(line.x1, line.x2);
    const lineRight = Math.max(line.x1, line.x2);
    const lineTop = Math.min(line.y1, line.y2);
    const lineBottom = Math.max(line.y1, line.y2);

    // Check 1: Basic bounding box overlap
    const horizontalOverlap = lineLeft < boxRight && lineRight > boxLeft;
    const verticalOverlap = lineTop < boxBottom && lineBottom > boxTop;
    if (!horizontalOverlap || !verticalOverlap) return false;

    // Check 2: Line must span at least 40% of text box width
    const overlapLeft = Math.max(lineLeft, boxLeft);
    const overlapRight = Math.min(lineRight, boxRight);
    const widthCoverage = (overlapRight - overlapLeft) / box.width;
    if (widthCoverage < 0.4) return false;

    // Check 3: Line must cross through the middle 30% of the text box (35-65% height)
    // This is the key discriminator - form borders run at edges, strike-throughs cross centers
    const midlineTop = boxTop + box.height * 0.35;
    const midlineBottom = boxTop + box.height * 0.65;

    if (Math.abs(line.angle) < 15) {
      // For horizontal lines, the Y coordinate must fall in the middle band
      const lineY = (line.y1 + line.y2) / 2;
      if (lineY < midlineTop || lineY > midlineBottom) return false;
    } else {
      // For diagonal lines, at least part of the line must cross the middle band
      // Calculate Y values where line intersects the box's left and right edges
      if (line.x2 === line.x1) return false; // Avoid division by zero
      
      const slope = (line.y2 - line.y1) / (line.x2 - line.x1);
      const yAtBoxLeft = line.y1 + slope * (boxLeft - line.x1);
      const yAtBoxRight = line.y1 + slope * (boxRight - line.x1);
      
      const lineMinY = Math.min(yAtBoxLeft, yAtBoxRight);
      const lineMaxY = Math.max(yAtBoxLeft, yAtBoxRight);
      
      // Check if line's Y range within the box overlaps with the midline band
      if (lineMaxY < midlineTop || lineMinY > midlineBottom) return false;
    }

    return true;
  }

  private async detectRedInkRegions(
    imageData: ImageDataLike,
    width: number,
    height: number
  ): Promise<ColorRegion[]> {
    const regions: ColorRegion[] = [];
    const data = imageData.data;
    const visited = new Set<number>();
    const minRedPixels = 20;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited.has(idx)) continue;

        const r = data[idx * 4];
        const g = data[idx * 4 + 1];
        const b = data[idx * 4 + 2];

        if (this.isRedishPixel(r, g, b)) {
          const region = this.floodFillRed(data, width, height, x, y, visited);
          
          if (region.pixelCount >= minRedPixels) {
            regions.push(region);
          }
        }
      }
    }

    return this.mergeNearbyColorRegions(regions);
  }

  private isRedishPixel(r: number, g: number, b: number): boolean {
    const isBrightRed = r > 150 && r > g * 1.5 && r > b * 1.5;

    const isDarkRed = r > 80 && r > 50 && 
                       r > g * 1.3 && r > b * 1.3 &&
                       g < 100 && b < 100;

    const isPinkRed = r > 180 && g > 80 && g < 160 && b > 80 && b < 160 &&
                       r > g && r > b;

    return isBrightRed || isDarkRed || isPinkRed;
  }

  private floodFillRed(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    startX: number,
    startY: number,
    visited: Set<number>
  ): ColorRegion {
    const stack: [number, number][] = [[startX, startY]];
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    let totalR = 0, totalG = 0, totalB = 0;
    let pixelCount = 0;

    while (stack.length > 0 && pixelCount < 10000) {
      const [x, y] = stack.pop()!;
      const idx = y * width + x;
      
      if (visited.has(idx)) continue;
      visited.add(idx);

      const r = data[idx * 4];
      const g = data[idx * 4 + 1];
      const b = data[idx * 4 + 2];

      if (!this.isRedishPixel(r, g, b)) continue;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      
      totalR += r;
      totalG += g;
      totalB += b;
      pixelCount++;

      if (x > 0) stack.push([x - 1, y]);
      if (x < width - 1) stack.push([x + 1, y]);
      if (y > 0) stack.push([x, y - 1]);
      if (y < height - 1) stack.push([x, y + 1]);
    }

    return {
      boundingBox: {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      },
      dominantColor: {
        r: pixelCount > 0 ? Math.round(totalR / pixelCount) : 0,
        g: pixelCount > 0 ? Math.round(totalG / pixelCount) : 0,
        b: pixelCount > 0 ? Math.round(totalB / pixelCount) : 0,
      },
      pixelCount,
    };
  }

  private mergeNearbyColorRegions(regions: ColorRegion[]): ColorRegion[] {
    if (regions.length <= 1) return regions;

    const merged: ColorRegion[] = [];
    const used = new Set<number>();
    const mergeDistance = 20;

    for (let i = 0; i < regions.length; i++) {
      if (used.has(i)) continue;

      let current = { ...regions[i] };
      used.add(i);

      for (let j = i + 1; j < regions.length; j++) {
        if (used.has(j)) continue;

        const other = regions[j];
        const distance = this.boundingBoxDistance(current.boundingBox, other.boundingBox);

        if (distance < mergeDistance) {
          current = this.mergeTwoRegions(current, other);
          used.add(j);
        }
      }

      merged.push(current);
    }

    return merged;
  }

  private boundingBoxDistance(a: BoundingBox, b: BoundingBox): number {
    const aCenterX = a.x + a.width / 2;
    const aCenterY = a.y + a.height / 2;
    const bCenterX = b.x + b.width / 2;
    const bCenterY = b.y + b.height / 2;

    return Math.sqrt(Math.pow(aCenterX - bCenterX, 2) + Math.pow(aCenterY - bCenterY, 2));
  }

  private mergeTwoRegions(a: ColorRegion, b: ColorRegion): ColorRegion {
    const minX = Math.min(a.boundingBox.x, b.boundingBox.x);
    const minY = Math.min(a.boundingBox.y, b.boundingBox.y);
    const maxX = Math.max(a.boundingBox.x + a.boundingBox.width, b.boundingBox.x + b.boundingBox.width);
    const maxY = Math.max(a.boundingBox.y + a.boundingBox.height, b.boundingBox.y + b.boundingBox.height);

    const totalPixels = a.pixelCount + b.pixelCount;

    return {
      boundingBox: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
      dominantColor: {
        r: Math.round((a.dominantColor.r * a.pixelCount + b.dominantColor.r * b.pixelCount) / totalPixels),
        g: Math.round((a.dominantColor.g * a.pixelCount + b.dominantColor.g * b.pixelCount) / totalPixels),
        b: Math.round((a.dominantColor.b * a.pixelCount + b.dominantColor.b * b.pixelCount) / totalPixels),
      },
      pixelCount: totalPixels,
    };
  }

  private async detectErasureRegions(
    imageData: ImageDataLike,
    width: number,
    height: number,
    textRegions: BoundingBox[]
  ): Promise<BoundingBox[]> {
    const erasures: BoundingBox[] = [];
    const data = imageData.data;

    for (const region of textRegions) {
      const startX = Math.max(0, Math.floor(region.x));
      const startY = Math.max(0, Math.floor(region.y));
      const endX = Math.min(width, Math.floor(region.x + region.width));
      const endY = Math.min(height, Math.floor(region.y + region.height));

      let whitePixels = 0;
      let totalPixels = 0;
      let avgBrightness = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          const brightness = (r + g + b) / 3;
          avgBrightness += brightness;
          totalPixels++;

          if (brightness > 240 && Math.abs(r - g) < 10 && Math.abs(g - b) < 10) {
            whitePixels++;
          }
        }
      }

      if (totalPixels === 0) continue;

      const whiteRatio = whitePixels / totalPixels;
      avgBrightness /= totalPixels;

      if (whiteRatio > 0.6 && avgBrightness > 220) {
        erasures.push(region);
      }
    }

    return erasures;
  }

  private findAffectedTextRegions(line: DetectedLine, textRegions: BoundingBox[]): BoundingBox[] {
    const affected: BoundingBox[] = [];
    const lineBbox = this.lineToBoundingBox(line);

    for (const region of textRegions) {
      if (this.doesLineIntersectBox(line, region)) {
        affected.push(region);
      }
    }

    return affected;
  }

  private doesLineIntersectBox(line: DetectedLine, box: BoundingBox): boolean {
    const boxTop = box.y;
    const boxBottom = box.y + box.height;
    const boxLeft = box.x;
    const boxRight = box.x + box.width;

    const lineLeft = Math.min(line.x1, line.x2);
    const lineRight = Math.max(line.x1, line.x2);
    const lineTop = Math.min(line.y1, line.y2);
    const lineBottom = Math.max(line.y1, line.y2);

    const horizontalOverlap = lineLeft < boxRight && lineRight > boxLeft;
    const verticalOverlap = lineTop < boxBottom && lineBottom > boxTop;

    if (!horizontalOverlap || !verticalOverlap) return false;

    const verticalCenter = (boxTop + boxBottom) / 2;
    const verticalTolerance = box.height * 0.4;

    if (Math.abs(line.angle) < 15) {
      return Math.abs(line.y1 - verticalCenter) < verticalTolerance;
    }

    return true;
  }

  private lineToBoundingBox(line: DetectedLine): BoundingBox {
    const padding = Math.max(line.thickness, 3);
    return {
      x: Math.min(line.x1, line.x2) - padding,
      y: Math.min(line.y1, line.y2) - padding,
      width: Math.abs(line.x2 - line.x1) + padding * 2,
      height: Math.abs(line.y2 - line.y1) + padding * 2 + line.thickness,
    };
  }

  private findTextRegionsInArea(area: BoundingBox, textRegions: BoundingBox[]): BoundingBox[] {
    return textRegions.filter(region => {
      const overlapX = Math.max(0, Math.min(area.x + area.width, region.x + region.width) - Math.max(area.x, region.x));
      const overlapY = Math.max(0, Math.min(area.y + area.height, region.y + region.height) - Math.max(area.y, region.y));
      const overlapArea = overlapX * overlapY;
      const regionArea = region.width * region.height;
      
      return overlapArea > 0 && overlapArea / regionArea > 0.1;
    });
  }

  private getRedMarkSeverity(region: ColorRegion, affectedTextRegions: BoundingBox[]): AlertSeverity {
    if (affectedTextRegions.length > 0 && region.pixelCount > 200) {
      return 'high';
    }
    if (affectedTextRegions.length > 0 || region.pixelCount > 500) {
      return 'medium';
    }
    return 'low';
  }

  private async generateThumbnail(
    imagePath: string,
    region: BoundingBox,
    anomalyId: string
  ): Promise<string | null> {
    try {
      const metadata = await sharp(imagePath).metadata();
      if (!metadata.width || !metadata.height) return null;

      const padding = 20;
      const x = Math.max(0, Math.floor(region.x - padding));
      const y = Math.max(0, Math.floor(region.y - padding));
      const width = Math.min(
        Math.floor(region.width + padding * 2),
        metadata.width - x
      );
      const height = Math.min(
        Math.floor(region.height + padding * 2),
        metadata.height - y
      );

      if (width <= 0 || height <= 0) return null;

      const thumbnailFilename = `${anomalyId}.png`;
      const thumbnailPath = path.join(this.thumbnailDir, thumbnailFilename);

      await sharp(imagePath)
        .extract({ left: x, top: y, width, height })
        .resize({ width: Math.min(400, width), fit: 'inside' })
        .png()
        .toFile(thumbnailPath);

      return thumbnailPath;
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      return null;
    }
  }

  private consolidateNearbyAnomalies(anomalies: VisualAnomaly[]): VisualAnomaly[] {
    if (anomalies.length <= 1) return anomalies;

    const consolidated: VisualAnomaly[] = [];
    const used = new Set<string>();
    const mergeDistance = 30;

    for (const anomaly of anomalies) {
      if (used.has(anomaly.id)) continue;
      used.add(anomaly.id);

      let merged = { ...anomaly };

      for (const other of anomalies) {
        if (used.has(other.id) || anomaly.type !== other.type) continue;

        const distance = this.boundingBoxDistance(merged.boundingBox, other.boundingBox);

        if (distance < mergeDistance) {
          merged = {
            ...merged,
            boundingBox: this.expandBoundingBox(merged.boundingBox, other.boundingBox),
            confidence: Math.max(merged.confidence, other.confidence),
          };
          used.add(other.id);
        }
      }

      consolidated.push(merged);
    }

    return consolidated;
  }

  private expandBoundingBox(a: BoundingBox, b: BoundingBox): BoundingBox {
    const minX = Math.min(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxX = Math.max(a.x + a.width, b.x + b.width);
    const maxY = Math.max(a.y + a.height, b.y + b.height);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  extractTextRegionsFromOCR(pageData: PageExtractionData): BoundingBox[] {
    const regions: BoundingBox[] = [];

    for (const textBlock of pageData.textBlocks || []) {
      if (textBlock.boundingBox) {
        regions.push({
          x: textBlock.boundingBox.x,
          y: textBlock.boundingBox.y,
          width: textBlock.boundingBox.width,
          height: textBlock.boundingBox.height,
        });
      }
    }

    for (const field of pageData.formFields || []) {
      if (field.valueBoundingBox) {
        regions.push({
          x: field.valueBoundingBox.x,
          y: field.valueBoundingBox.y,
          width: field.valueBoundingBox.width,
          height: field.valueBoundingBox.height,
        });
      }
    }

    for (const table of pageData.tables || []) {
      for (const cell of table.cells || []) {
        if (cell.boundingBox && cell.text && cell.text.trim().length > 0) {
          regions.push({
            x: cell.boundingBox.x,
            y: cell.boundingBox.y,
            width: cell.boundingBox.width,
            height: cell.boundingBox.height,
          });
        }
      }
    }

    for (const handwritten of pageData.handwrittenRegions || []) {
      if (handwritten.boundingBox) {
        regions.push({
          x: handwritten.boundingBox.x,
          y: handwritten.boundingBox.y,
          width: handwritten.boundingBox.width,
          height: handwritten.boundingBox.height,
        });
      }
    }

    return regions;
  }
}
