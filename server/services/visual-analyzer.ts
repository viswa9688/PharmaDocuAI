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

      // BALANCED APPROACH: Detect high-confidence anomalies with smart filtering
      // 1. Diagonal lines (always suspicious - form structure is horizontal/vertical)
      // 2. Horizontal lines that cross through TEXT CONTENT (not at edges/baseline)
      // 3. Red ink marks (clear correction signal)
      // 4. Erasures with local contrast anomalies

      // Step 1: Detect diagonal strike-throughs (high confidence)
      const diagonalLines = await this.detectDiagonalStrikethroughsOnly(imageData, width, height);
      
      for (const line of diagonalLines) {
        const affectedRegions = this.findAffectedTextRegions(line, textRegions);
        
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
            confidence: 90,
            pageNumber,
            boundingBox: this.lineToBoundingBox(line),
            affectedTextRegion: region,
            affectedText: null,
            thumbnailPath,
            severity: 'high',
            description: `Diagonal strike-through line detected crossing text region`,
            detectionMethod: 'line_detection',
          });
        }
      }

      // Step 2: Detect horizontal lines that cross through text content
      const horizontalLines = await this.detectHorizontalStrikethroughs(imageData, width, height, textRegions);
      
      for (const line of horizontalLines) {
        const affectedRegions = this.findAffectedTextRegionsWithContentCheck(line, textRegions);
        
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
            confidence: 80,
            pageNumber,
            boundingBox: this.lineToBoundingBox(line),
            affectedTextRegion: region,
            affectedText: null,
            thumbnailPath,
            severity: 'high',
            description: `Horizontal strike-through line detected crossing text content`,
            detectionMethod: 'line_detection',
          });
        }
      }

      // Step 3: Red ink detection - highly reliable signal for corrections
      const redRegions = await this.detectRedInkRegions(imageData, width, height);
      for (const region of redRegions) {
        const affectedRegions = this.findTextRegionsInArea(region.boundingBox, textRegions);
        
        if (affectedRegions.length > 0 || region.pixelCount > 150) {
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

      // Step 4: Erasure detection with local contrast comparison
      const erasureRegions = await this.detectErasureRegionsWithLocalContrast(imageData, width, height, textRegions);
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
          confidence: 65,
          pageNumber,
          boundingBox: region,
          affectedTextRegion: region,
          affectedText: null,
          thumbnailPath,
          severity: 'medium',
          description: 'Possible erasure or correction detected (local contrast anomaly)',
          detectionMethod: 'local_contrast_analysis',
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
   * CONSERVATIVE APPROACH: Only detect diagonal lines (15-75 degrees or 105-165 degrees)
   * Form borders, table lines, underlines are all horizontal or vertical
   * Real strike-throughs from pen/pencil are often diagonal
   */
  private async detectDiagonalStrikethroughsOnly(
    imageData: ImageDataLike,
    width: number,
    height: number
  ): Promise<DetectedLine[]> {
    const data = imageData.data;
    const lines: DetectedLine[] = [];
    const visited = new Set<string>();

    // Convert to grayscale
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      grayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    const edges = this.sobelEdgeDetection(grayscale, width, height);
    const minDiagLength = 70; // Require longer lines for diagonal detection

    // Only scan for diagonal lines at specific angles (excluding horizontal/vertical)
    const diagonalAngles = [30, 45, 60, 120, 135, 150]; // Skip 0, 90, 180 degrees

    for (let y = 0; y < height; y += 5) {
      for (let x = 0; x < width; x += 5) {
        if (edges[y * width + x] < 60) continue; // Higher edge threshold
        
        const key = `${x},${y}`;
        if (visited.has(key)) continue;

        for (const angle of diagonalAngles) {
          const rad = angle * Math.PI / 180;
          const dx = Math.cos(rad);
          const dy = Math.sin(rad);
          
          let length = 0;
          let cx = x, cy = y;
          let darkPixelCount = 0;
          
          while (cx >= 0 && cx < width && cy >= 0 && cy < height && length < 500) {
            const idx = Math.floor(cy) * width + Math.floor(cx);
            const isDark = grayscale[idx] < 100;
            const isEdge = edges[idx] > 50;
            
            if (isDark || isEdge) {
              length++;
              if (isDark) darkPixelCount++;
              visited.add(`${Math.floor(cx)},${Math.floor(cy)}`);
            } else {
              break;
            }
            cx += dx;
            cy += dy;
          }

          // Require: minimum length AND high continuity of dark pixels
          const darkRatio = length > 0 ? darkPixelCount / length : 0;
          
          if (length >= minDiagLength && darkRatio > 0.7) {
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

  /**
   * Detect horizontal strike-throughs that cross through text content
   * Key insight: underlines are at bottom edge, borders at top/bottom edges
   * Real strike-throughs cross through the MIDDLE where text characters are
   */
  private async detectHorizontalStrikethroughs(
    imageData: ImageDataLike,
    width: number,
    height: number,
    textRegions: BoundingBox[]
  ): Promise<DetectedLine[]> {
    const data = imageData.data;
    const lines: DetectedLine[] = [];

    // Convert to grayscale
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      grayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    // Use per-region tracking instead of global Y to avoid missing multi-column strikes
    const regionLineMap = new Map<string, Set<number>>();

    // Scan each text region for horizontal lines crossing through the middle
    for (const region of textRegions) {
      const regionKey = `${region.x}_${region.y}`;
      if (!regionLineMap.has(regionKey)) {
        regionLineMap.set(regionKey, new Set());
      }
      const regionProcessed = regionLineMap.get(regionKey)!;

      const startX = Math.max(0, Math.floor(region.x));
      const endX = Math.min(width, Math.floor(region.x + region.width));
      const startY = Math.max(0, Math.floor(region.y));
      const endY = Math.min(height, Math.floor(region.y + region.height));

      // Define the "content zone" - middle 60% of the text region
      // Skip top 20% and bottom 20% which are typically borders/underlines
      const contentTop = startY + Math.floor(region.height * 0.20);
      const contentBottom = startY + Math.floor(region.height * 0.80);

      // Dynamic minimum length: at least 35% of region width, but minimum 25 pixels
      const minHorizontalLength = Math.max(25, Math.floor(region.width * 0.35));

      for (let y = contentTop; y < contentBottom; y++) {
        if (regionProcessed.has(y)) continue;

        let lineStart = -1;
        let consecutiveDark = 0;

        for (let x = startX; x < endX; x++) {
          const idx = y * width + x;
          const isDark = grayscale[idx] < 100; // Slightly relaxed threshold

          if (isDark) {
            if (lineStart === -1) lineStart = x;
            consecutiveDark++;
          } else {
            if (consecutiveDark >= minHorizontalLength) {
              // Validate this is a line, not just text
              const isLine = this.validateStrikethroughLine(grayscale, width, height, lineStart, y, x - 1, minHorizontalLength);
              
              if (isLine) {
                lines.push({
                  x1: lineStart,
                  y1: y,
                  x2: x - 1,
                  y2: y,
                  angle: 0,
                  length: consecutiveDark,
                  thickness: this.estimateLineThickness(grayscale, width, height, lineStart, y, x - 1),
                });
                regionProcessed.add(y);
              }
            }
            lineStart = -1;
            consecutiveDark = 0;
          }
        }

        // Check end of row
        if (consecutiveDark >= minHorizontalLength) {
          const isLine = this.validateStrikethroughLine(grayscale, width, height, lineStart, y, endX - 1, minHorizontalLength);
          if (isLine) {
            lines.push({
              x1: lineStart,
              y1: y,
              x2: endX - 1,
              y2: y,
              angle: 0,
              length: consecutiveDark,
              thickness: this.estimateLineThickness(grayscale, width, height, lineStart, y, endX - 1),
            });
            regionProcessed.add(y);
          }
        }
      }
    }

    return lines;
  }

  /**
   * Validate that a horizontal line segment is a strike-through, not a table/form border
   * 
   * Border characteristics (REJECT):
   * - Has perpendicular connectors forming corners
   * - Perfectly uniform thickness/intensity (std dev ≈ 0)
   * - Extends significantly beyond text width
   * 
   * Strike-through characteristics (ACCEPT):
   * - Crosses through character middle, not at edges
   * - Has slight variations (hand-drawn appearance)
   * - Bounded by text width
   */
  private validateStrikethroughLine(
    grayscale: Uint8Array,
    width: number,
    height: number,
    x1: number,
    y: number,
    x2: number,
    minLength: number = 25
  ): boolean {
    const lineLength = x2 - x1;
    if (lineLength < minLength) return false;

    // Check 1: Detect perpendicular connectors (corners) - indicates table border
    if (this.hasPerpendicularConnectors(grayscale, width, height, x1, y, x2)) {
      return false; // This is a table/form border, not a strike-through
    }

    // Check 2: Calculate uniformity variance - perfectly uniform = border
    const uniformityCheck = this.checkLineUniformity(grayscale, width, x1, y, x2);
    if (uniformityCheck.isPerfectlyUniform) {
      return false; // Too uniform to be hand-drawn strike-through
    }

    // Check 3: Line should have consistent darkness (but not perfect)
    let darkCount = 0;
    for (let x = x1; x <= x2; x++) {
      if (grayscale[y * width + x] < 100) darkCount++;
    }
    const continuity = darkCount / lineLength;
    if (continuity < 0.75) return false; // Too fragmented

    // Check 4: There should be lighter pixels above OR below the line
    let lighterAbove = 0, lighterBelow = 0;
    const checkDistance = 3;
    const samplePoints = Math.min(10, Math.floor(lineLength / 10));

    for (let i = 0; i < samplePoints; i++) {
      const x = x1 + Math.floor(i * lineLength / samplePoints);
      
      if (y - checkDistance >= 0) {
        const abovePixel = grayscale[(y - checkDistance) * width + x];
        if (abovePixel > 150) lighterAbove++;
      }
      
      if (y + checkDistance < height) {
        const belowPixel = grayscale[(y + checkDistance) * width + x];
        if (belowPixel > 150) lighterBelow++;
      }
    }

    const hasContrast = (lighterAbove / samplePoints > 0.3) || (lighterBelow / samplePoints > 0.3);
    if (!hasContrast) return false;

    // Check 5: Line thickness should be reasonable (1-8 pixels)
    const thickness = this.estimateLineThickness(grayscale, width, height, x1, y, x2);
    if (thickness < 1 || thickness > 8) return false;

    return true;
  }

  /**
   * Check for perpendicular (vertical) connectors at line endpoints
   * Table borders have corners; strike-throughs end abruptly
   * 
   * Key insight: Real strike-throughs end in empty space.
   * If EITHER endpoint has a vertical line, it's likely a table corner.
   */
  private hasPerpendicularConnectors(
    grayscale: Uint8Array,
    width: number,
    height: number,
    x1: number,
    y: number,
    x2: number
  ): boolean {
    const cornerCheckLength = 8; // Check 8 pixels in each vertical direction
    const darkThreshold = 100;

    // Check left endpoint for vertical connector (sample 3-pixel window for skew tolerance)
    const leftHasVertical = this.checkVerticalLineWithWindow(grayscale, width, height, x1, y, cornerCheckLength, darkThreshold, 3);
    
    // Check right endpoint for vertical connector
    const rightHasVertical = this.checkVerticalLineWithWindow(grayscale, width, height, x2, y, cornerCheckLength, darkThreshold, 3);

    // REJECT if EITHER endpoint has a vertical connector - indicates table/form border
    if (leftHasVertical || rightHasVertical) {
      return true;
    }

    return false;
  }

  /**
   * Check for vertical line with a horizontal window for skew tolerance
   * Samples multiple x positions within the window
   */
  private checkVerticalLineWithWindow(
    grayscale: Uint8Array,
    width: number,
    height: number,
    x: number,
    y: number,
    checkLength: number,
    darkThreshold: number,
    windowWidth: number
  ): boolean {
    // Sample across the window to handle slight skew
    for (let dx = 0; dx < windowWidth; dx++) {
      const checkX = x + dx;
      if (checkX < 0 || checkX >= width) continue;
      
      if (this.checkVerticalLine(grayscale, width, height, checkX, y, checkLength, darkThreshold)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if there's a vertical line segment at a given x position
   */
  private checkVerticalLine(
    grayscale: Uint8Array,
    width: number,
    height: number,
    x: number,
    y: number,
    checkLength: number,
    darkThreshold: number
  ): boolean {
    let darkAbove = 0;
    let darkBelow = 0;

    // Check pixels above
    for (let dy = 1; dy <= checkLength; dy++) {
      if (y - dy >= 0 && grayscale[(y - dy) * width + x] < darkThreshold) {
        darkAbove++;
      }
    }

    // Check pixels below
    for (let dy = 1; dy <= checkLength; dy++) {
      if (y + dy < height && grayscale[(y + dy) * width + x] < darkThreshold) {
        darkBelow++;
      }
    }

    // Require at least 60% dark pixels in one direction to count as vertical line
    const threshold = Math.floor(checkLength * 0.6);
    return darkAbove >= threshold || darkBelow >= threshold;
  }

  /**
   * Check line uniformity - table borders are perfectly uniform,
   * hand-drawn strike-throughs have natural variation
   */
  private checkLineUniformity(
    grayscale: Uint8Array,
    width: number,
    x1: number,
    y: number,
    x2: number
  ): { isPerfectlyUniform: boolean; stdDev: number } {
    const pixels: number[] = [];
    
    for (let x = x1; x <= x2; x++) {
      pixels.push(grayscale[y * width + x]);
    }

    if (pixels.length < 10) {
      return { isPerfectlyUniform: false, stdDev: 0 };
    }

    // Calculate mean
    const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    
    // Calculate standard deviation
    const squaredDiffs = pixels.map(p => Math.pow(p - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / pixels.length;
    const stdDev = Math.sqrt(avgSquaredDiff);

    // If std dev is very low (< 3), the line is too uniform to be hand-drawn
    // Scanned documents typically have at least some variation
    const isPerfectlyUniform = stdDev < 3;

    return { isPerfectlyUniform, stdDev };
  }

  /**
   * Find text regions affected by a line, with comprehensive checks:
   * - Shrinks OCR bounding boxes by 8% to avoid false edge intersections
   * - Verifies line crosses through character middle
   * - Rejects lines extending significantly beyond text bounds
   */
  private findAffectedTextRegionsWithContentCheck(
    line: DetectedLine,
    textRegions: BoundingBox[]
  ): BoundingBox[] {
    const affected: BoundingBox[] = [];

    for (const region of textRegions) {
      // SHRINK the OCR bounding box by 8% on each side to avoid edge intersections
      const shrinkFactor = 0.08;
      const shrunkRegion = {
        x: region.x + region.width * shrinkFactor,
        y: region.y + region.height * shrinkFactor,
        width: region.width * (1 - 2 * shrinkFactor),
        height: region.height * (1 - 2 * shrinkFactor),
      };

      // Line must be in the content zone (middle 70% of shrunk region)
      const regionContentTop = shrunkRegion.y + shrunkRegion.height * 0.15;
      const regionContentBottom = shrunkRegion.y + shrunkRegion.height * 0.85;
      const lineY = (line.y1 + line.y2) / 2;

      if (lineY < regionContentTop || lineY > regionContentBottom) continue;

      // Check horizontal overlap with shrunk region
      const lineLeft = Math.min(line.x1, line.x2);
      const lineRight = Math.max(line.x1, line.x2);
      const regionLeft = shrunkRegion.x;
      const regionRight = shrunkRegion.x + shrunkRegion.width;

      const overlap = Math.min(lineRight, regionRight) - Math.max(lineLeft, regionLeft);
      const widthCoverage = overlap / shrunkRegion.width;

      // Line should span at least 25% of the region width
      if (widthCoverage < 0.25) continue;

      // CHECK: Reject if line extends significantly beyond text bounds on EITHER side
      // This catches table borders that span multiple cells
      const extensionLeft = Math.max(0, regionLeft - lineLeft);
      const extensionRight = Math.max(0, lineRight - regionRight);
      const extensionLeftRatio = extensionLeft / shrunkRegion.width;
      const extensionRightRatio = extensionRight / shrunkRegion.width;

      // If line extends more than 12% beyond text on EITHER side, it's likely a border
      // Real strike-throughs are bounded by the text they cross
      if (extensionLeftRatio > 0.12 || extensionRightRatio > 0.12) continue;

      affected.push(region);
    }

    return affected;
  }

  /**
   * Erasure detection using local contrast comparison
   * Compares each region against its immediate neighbors, not page-wide baseline
   */
  private async detectErasureRegionsWithLocalContrast(
    imageData: ImageDataLike,
    width: number,
    height: number,
    textRegions: BoundingBox[]
  ): Promise<BoundingBox[]> {
    const erasures: BoundingBox[] = [];
    const data = imageData.data;

    if (textRegions.length === 0) return erasures;

    for (const region of textRegions) {
      const startX = Math.max(0, Math.floor(region.x));
      const startY = Math.max(0, Math.floor(region.y));
      const endX = Math.min(width, Math.floor(region.x + region.width));
      const endY = Math.min(height, Math.floor(region.y + region.height));

      if (endX - startX < 15 || endY - startY < 15) continue;

      // Calculate region brightness
      let regionSum = 0;
      let whitePixels = 0;
      let totalPixels = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const brightness = (r + g + b) / 3;
          regionSum += brightness;
          totalPixels++;
          if (brightness > 240 && Math.abs(r - g) < 8 && Math.abs(g - b) < 8) {
            whitePixels++;
          }
        }
      }

      if (totalPixels === 0) continue;

      const regionAvg = regionSum / totalPixels;
      const whiteRatio = whitePixels / totalPixels;

      // Calculate local neighborhood brightness (surrounding area)
      const neighborPadding = 20;
      const neighborStartX = Math.max(0, startX - neighborPadding);
      const neighborStartY = Math.max(0, startY - neighborPadding);
      const neighborEndX = Math.min(width, endX + neighborPadding);
      const neighborEndY = Math.min(height, endY + neighborPadding);

      let neighborSum = 0;
      let neighborCount = 0;

      // Sample border pixels around the region
      for (let y = neighborStartY; y < neighborEndY; y++) {
        for (let x = neighborStartX; x < neighborEndX; x++) {
          // Only sample pixels OUTSIDE the main region
          if (x >= startX && x < endX && y >= startY && y < endY) continue;

          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          neighborSum += (r + g + b) / 3;
          neighborCount++;
        }
      }

      if (neighborCount < 50) continue;

      const neighborAvg = neighborSum / neighborCount;

      // Erasure detection criteria (relaxed for scanned documents):
      // 1. Region is significantly brighter than surroundings (>10 points)
      // 2. Moderate white pixel ratio (>55% for scanned docs with grain)
      // 3. Or very high brightness (>220) with edge signature
      const brightnessDiff = regionAvg - neighborAvg;

      // Check for correction fluid edge first (most reliable signal)
      const hasEdge = this.detectErasureEdge(data, width, height, region);

      // Criteria: significant brightness anomaly with edge signature
      // OR very high brightness difference even without strong edge
      const hasSignificantBrightness = brightnessDiff > 10 && whiteRatio > 0.55 && regionAvg > 210;
      const hasStrongBrightness = brightnessDiff > 20 && regionAvg > 220;

      if ((hasSignificantBrightness && hasEdge) || hasStrongBrightness) {
        erasures.push(region);
      }
    }

    return erasures;
  }

  /**
   * Erasure detection using page-level background baseline
   * Much more robust than comparing against text regions
   */
  private async detectErasureRegionsWithPageBaseline(
    imageData: ImageDataLike,
    width: number,
    height: number,
    textRegions: BoundingBox[]
  ): Promise<BoundingBox[]> {
    const erasures: BoundingBox[] = [];
    const data = imageData.data;

    if (textRegions.length === 0) return erasures;

    // Step 1: Calculate page background brightness by sampling areas OUTSIDE text regions
    const backgroundSamples: number[] = [];
    const textRegionSet = new Set<number>();
    
    // Build a set of pixels that are inside text regions
    for (const region of textRegions) {
      const startX = Math.max(0, Math.floor(region.x));
      const startY = Math.max(0, Math.floor(region.y));
      const endX = Math.min(width, Math.floor(region.x + region.width));
      const endY = Math.min(height, Math.floor(region.y + region.height));
      
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          textRegionSet.add(y * width + x);
        }
      }
    }

    // Sample background pixels (outside text regions)
    const sampleStep = 50;
    for (let y = 10; y < height - 10; y += sampleStep) {
      for (let x = 10; x < width - 10; x += sampleStep) {
        const idx = y * width + x;
        if (!textRegionSet.has(idx)) {
          const r = data[idx * 4];
          const g = data[idx * 4 + 1];
          const b = data[idx * 4 + 2];
          backgroundSamples.push((r + g + b) / 3);
        }
      }
    }

    if (backgroundSamples.length < 10) return erasures;

    // Calculate background statistics
    const bgMean = backgroundSamples.reduce((a, b) => a + b, 0) / backgroundSamples.length;
    const bgVariance = backgroundSamples.reduce((sum, b) => sum + Math.pow(b - bgMean, 2), 0) / backgroundSamples.length;
    const bgStdDev = Math.sqrt(bgVariance);

    // Step 2: For each text region, check if it's anomalously bright
    for (const region of textRegions) {
      const startX = Math.max(0, Math.floor(region.x));
      const startY = Math.max(0, Math.floor(region.y));
      const endX = Math.min(width, Math.floor(region.x + region.width));
      const endY = Math.min(height, Math.floor(region.y + region.height));

      if (endX - startX < 10 || endY - startY < 10) continue;

      let sumBrightness = 0;
      let veryWhitePixels = 0;
      let totalPixels = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          const brightness = (r + g + b) / 3;
          sumBrightness += brightness;
          totalPixels++;

          // Very white pixels (near-white, uniform color)
          if (brightness > 245 && Math.abs(r - g) < 8 && Math.abs(g - b) < 8) {
            veryWhitePixels++;
          }
        }
      }

      if (totalPixels === 0) continue;

      const avgBrightness = sumBrightness / totalPixels;
      const whiteRatio = veryWhitePixels / totalPixels;

      // Region must be:
      // 1. Significantly brighter than page background (more than 2 std devs)
      // 2. Have very high concentration of pure white pixels (>85%)
      // 3. Have high absolute brightness (>245)
      const brightnessZScore = bgStdDev > 1 ? (avgBrightness - bgMean) / bgStdDev : 0;

      if (brightnessZScore > 2.0 && whiteRatio > 0.85 && avgBrightness > 245) {
        // Additional check: Look for correction fluid edge signature
        const hasVisibleEdge = this.detectErasureEdge(data, width, height, region);
        
        if (hasVisibleEdge) {
          erasures.push(region);
        }
      }
    }

    return erasures;
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
   * 1. Cross through the middle portion of text height (not at edges - that's a border/underline)
   * 2. Span a significant portion of the text box width
   * 3. NOT be at the bottom of the text box (that's an underline for data entry fields)
   * 4. NOT be at the edges of text (that's a box border)
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
   * Check if a line is likely an underline (at or below text baseline)
   * Underlines are for signature/entry fields - NOT strike-throughs
   */
  private isLikelyUnderline(line: DetectedLine, box: BoundingBox): boolean {
    // Underlines are typically in the bottom 20% of the text region or below it
    const lineY = (line.y1 + line.y2) / 2;
    const boxBottom = box.y + box.height;
    const underlineZone = box.y + box.height * 0.80; // Bottom 20%
    
    // Line is in the underline zone (bottom portion of text or below)
    if (lineY >= underlineZone && lineY <= boxBottom + 10) {
      // And it's nearly horizontal
      if (Math.abs(line.angle) < 5) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a line is likely a box border (at the very top or bottom edge)
   */
  private isLikelyBoxBorder(line: DetectedLine, box: BoundingBox): boolean {
    const lineY = (line.y1 + line.y2) / 2;
    const boxTop = box.y;
    const boxBottom = box.y + box.height;
    
    // Line is within 5 pixels of box top or bottom edge
    const nearTop = Math.abs(lineY - boxTop) < 5;
    const nearBottom = Math.abs(lineY - boxBottom) < 5;
    
    // Nearly horizontal (boxes have straight edges)
    const isHorizontal = Math.abs(line.angle) < 3;
    
    // Spans most of the box width (box borders usually span full width)
    const lineLeft = Math.min(line.x1, line.x2);
    const lineRight = Math.max(line.x1, line.x2);
    const overlapLeft = Math.max(lineLeft, box.x);
    const overlapRight = Math.min(lineRight, box.x + box.width);
    const widthCoverage = (overlapRight - overlapLeft) / box.width;
    
    return (nearTop || nearBottom) && isHorizontal && widthCoverage > 0.7;
  }

  /**
   * Strict intersection check requiring midline crossing and width coverage
   * Filters out underlines and box borders which are commonly mistaken for strike-throughs
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

    // Check 2: Filter out underlines (lines at bottom of text - for data entry fields)
    if (this.isLikelyUnderline(line, box)) {
      return false;
    }

    // Check 3: Filter out box borders (lines at top/bottom edge spanning full width)
    if (this.isLikelyBoxBorder(line, box)) {
      return false;
    }

    // Check 4: Line must span at least 30% of text box width (relaxed from 40%)
    const overlapLeft = Math.max(lineLeft, boxLeft);
    const overlapRight = Math.min(lineRight, boxRight);
    const widthCoverage = (overlapRight - overlapLeft) / box.width;
    if (widthCoverage < 0.3) return false;

    // Check 5: Line must cross through the middle portion of the text box (25-75% height)
    // This is the key discriminator - form borders run at edges, strike-throughs cross centers
    // Expanded range from 35-65% to 25-75% to catch more legitimate strike-throughs
    const midlineTop = boxTop + box.height * 0.25;
    const midlineBottom = boxTop + box.height * 0.75;

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

  /**
   * Detect erasure regions using relative z-score contrast test
   * Compares each text region's brightness against the page baseline
   * Only flags regions that are significantly brighter than expected (outliers)
   */
  private async detectErasureRegions(
    imageData: ImageDataLike,
    width: number,
    height: number,
    textRegions: BoundingBox[]
  ): Promise<BoundingBox[]> {
    const erasures: BoundingBox[] = [];
    const data = imageData.data;

    if (textRegions.length < 3) {
      // Not enough regions to establish baseline - skip erasure detection
      return erasures;
    }

    // First pass: Calculate brightness statistics for all text regions
    const regionStats: { region: BoundingBox; avgBrightness: number; whiteRatio: number; hasText: boolean }[] = [];
    
    for (const region of textRegions) {
      const startX = Math.max(0, Math.floor(region.x));
      const startY = Math.max(0, Math.floor(region.y));
      const endX = Math.min(width, Math.floor(region.x + region.width));
      const endY = Math.min(height, Math.floor(region.y + region.height));

      let whitePixels = 0;
      let darkPixels = 0;
      let totalPixels = 0;
      let sumBrightness = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          const brightness = (r + g + b) / 3;
          sumBrightness += brightness;
          totalPixels++;

          if (brightness > 240 && Math.abs(r - g) < 10 && Math.abs(g - b) < 10) {
            whitePixels++;
          }
          if (brightness < 100) {
            darkPixels++;
          }
        }
      }

      if (totalPixels === 0) continue;

      const avgBrightness = sumBrightness / totalPixels;
      const whiteRatio = whitePixels / totalPixels;
      const darkRatio = darkPixels / totalPixels;
      
      // A region "has text" if it contains some dark pixels (ink/print)
      const hasText = darkRatio > 0.05;

      regionStats.push({
        region,
        avgBrightness,
        whiteRatio,
        hasText
      });
    }

    if (regionStats.length < 3) return erasures;

    // Calculate baseline statistics from regions that have text (exclude empty fields)
    const textRegionStats = regionStats.filter(s => s.hasText);
    
    if (textRegionStats.length < 2) {
      // Not enough text-containing regions for comparison
      return erasures;
    }

    // Calculate mean and standard deviation of brightness for text-containing regions
    const brightnesses = textRegionStats.map(s => s.avgBrightness);
    const mean = brightnesses.reduce((a, b) => a + b, 0) / brightnesses.length;
    const variance = brightnesses.reduce((sum, b) => sum + Math.pow(b - mean, 2), 0) / brightnesses.length;
    const stdDev = Math.sqrt(variance);

    // Avoid division by zero for very uniform pages
    const effectiveStdDev = Math.max(stdDev, 10);

    // Second pass: Flag regions that are significant outliers (z-score > 2.5)
    // AND have very high white ratio (indicating possible erasure/correction fluid)
    for (const stat of regionStats) {
      const zScore = (stat.avgBrightness - mean) / effectiveStdDev;
      
      // Region must be:
      // 1. Significantly brighter than other text regions (z-score > 2.5)
      // 2. Have very high white pixel ratio (>80% white - more strict than before)
      // 3. High absolute brightness (>235 - stricter threshold)
      // 4. The region should have HAD text (erasures remove existing text)
      //    We check this by looking at edge contrast - erasures often have visible edges
      
      if (zScore > 2.5 && stat.whiteRatio > 0.80 && stat.avgBrightness > 235) {
        // Additional check: Look for sharp brightness transitions at region edges
        // Real erasures often have visible boundaries where correction fluid was applied
        const hasErasureEdge = this.detectErasureEdge(data, width, height, stat.region);
        
        if (hasErasureEdge) {
          erasures.push(stat.region);
        }
      }
    }

    return erasures;
  }

  /**
   * Detect if a region has sharp brightness transitions at its edges
   * indicative of correction fluid application
   */
  private detectErasureEdge(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    region: BoundingBox
  ): boolean {
    const startX = Math.max(0, Math.floor(region.x));
    const startY = Math.max(0, Math.floor(region.y));
    const endX = Math.min(width - 1, Math.floor(region.x + region.width));
    const endY = Math.min(height - 1, Math.floor(region.y + region.height));

    let significantEdges = 0;
    const edgeThreshold = 50; // Brightness difference to consider an "edge"
    
    // Sample points along the region border
    const samplePoints = 20;
    
    // Check top and bottom edges
    for (let i = 0; i < samplePoints; i++) {
      const x = startX + Math.floor((endX - startX) * i / samplePoints);
      
      // Top edge
      if (startY > 0) {
        const insideIdx = (startY * width + x) * 4;
        const outsideIdx = ((startY - 1) * width + x) * 4;
        const insideBrightness = (data[insideIdx] + data[insideIdx + 1] + data[insideIdx + 2]) / 3;
        const outsideBrightness = (data[outsideIdx] + data[outsideIdx + 1] + data[outsideIdx + 2]) / 3;
        if (Math.abs(insideBrightness - outsideBrightness) > edgeThreshold) {
          significantEdges++;
        }
      }
      
      // Bottom edge
      if (endY < height - 1) {
        const insideIdx = (endY * width + x) * 4;
        const outsideIdx = ((endY + 1) * width + x) * 4;
        const insideBrightness = (data[insideIdx] + data[insideIdx + 1] + data[insideIdx + 2]) / 3;
        const outsideBrightness = (data[outsideIdx] + data[outsideIdx + 1] + data[outsideIdx + 2]) / 3;
        if (Math.abs(insideBrightness - outsideBrightness) > edgeThreshold) {
          significantEdges++;
        }
      }
    }

    // Check left and right edges
    for (let i = 0; i < samplePoints; i++) {
      const y = startY + Math.floor((endY - startY) * i / samplePoints);
      
      // Left edge
      if (startX > 0) {
        const insideIdx = (y * width + startX) * 4;
        const outsideIdx = (y * width + startX - 1) * 4;
        const insideBrightness = (data[insideIdx] + data[insideIdx + 1] + data[insideIdx + 2]) / 3;
        const outsideBrightness = (data[outsideIdx] + data[outsideIdx + 1] + data[outsideIdx + 2]) / 3;
        if (Math.abs(insideBrightness - outsideBrightness) > edgeThreshold) {
          significantEdges++;
        }
      }
      
      // Right edge
      if (endX < width - 1) {
        const insideIdx = (y * width + endX) * 4;
        const outsideIdx = (y * width + endX + 1) * 4;
        const insideBrightness = (data[insideIdx] + data[insideIdx + 1] + data[insideIdx + 2]) / 3;
        const outsideBrightness = (data[outsideIdx] + data[outsideIdx + 1] + data[outsideIdx + 2]) / 3;
        if (Math.abs(insideBrightness - outsideBrightness) > edgeThreshold) {
          significantEdges++;
        }
      }
    }

    // Require at least 20% of sampled edge points to show significant contrast
    const totalSamples = samplePoints * 4;
    return significantEdges > totalSamples * 0.20;
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
