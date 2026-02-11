export interface BatchAllocationExtraction {
  batchNumber: string | null;
  mpcNumber: string | null;
  bmrNumber: string | null;
  manufacturingDate: string | null;
  expiryDate: string | null;
  shelfLifeMonths: number | null;
  shelfLifeCalculated: number | null;
  isCompliant: boolean | null;
  datesMatch: boolean | null;
  qaOfficer: string | null;
  verificationDate: string | null;
  rawMaterials: ExtractedMaterial[];
}

export interface ExtractedMaterial {
  materialCode: string;
  materialName: string;
  bomQuantity: string;
  approvedLimits: string;
}

export class BatchAllocationVerificationService {

  extractFromDocument(rawText: string, tables: any[]): BatchAllocationExtraction {
    const normalizedText = rawText.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    
    const extraction: BatchAllocationExtraction = {
      batchNumber: this.extractBatchNumber(normalizedText),
      mpcNumber: this.extractMpcNumber(normalizedText),
      bmrNumber: this.extractBmrNumber(normalizedText),
      manufacturingDate: this.extractManufacturingDate(normalizedText),
      expiryDate: this.extractExpiryDate(normalizedText),
      shelfLifeMonths: null,
      shelfLifeCalculated: null,
      isCompliant: this.extractComplianceStatus(normalizedText),
      datesMatch: null,
      qaOfficer: this.extractQaOfficer(normalizedText),
      verificationDate: this.extractVerificationDate(normalizedText),
      rawMaterials: this.extractRawMaterials(normalizedText, tables),
    };

    if (extraction.manufacturingDate && extraction.expiryDate) {
      extraction.shelfLifeCalculated = this.calculateShelfLife(
        extraction.manufacturingDate,
        extraction.expiryDate
      );
      extraction.datesMatch = extraction.shelfLifeCalculated !== null && extraction.shelfLifeCalculated > 0;
    }

    return extraction;
  }

  private extractBatchNumber(text: string): string | null {
    const patterns = [
      /Batch\s*(?:No\.?|Number)[:\s]*([A-Z0-9\-\/]+)/i,
      /BMR[-\s]?No\.?[:\s]*([A-Z0-9\-\/]+)/i,
      /BMR[-\s]?(\d{4}[-\/]?\d{4,})/i,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }

  private extractMpcNumber(text: string): string | null {
    const patterns = [
      /MPC\s*(?:No\.?|Number)?[:\s]*([A-Z0-9\-\/]+)/i,
      /Master\s*Product\s*Card[:\s]*([A-Z0-9\-\/]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }

  private extractBmrNumber(text: string): string | null {
    const patterns = [
      /BMR\s*(?:No\.?|Number)?[:\s]*([A-Z0-9\-\/]+)/i,
      /Batch\s*Manufacturing\s*Record[:\s]*([A-Z0-9\-\/]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }

  private extractManufacturingDate(text: string): string | null {
    const monthNameDate = '\\d{1,2}[-\\/\\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\\/\\s]\\d{2,4}';
    const numericDate = '\\d{1,2}[-\\/]\\d{1,2}[-\\/]\\d{2,4}';
    const isoDate = '\\d{4}[-\\/]\\d{2}[-\\/]\\d{2}';
    const anyDate = `(?:${monthNameDate}|${isoDate}|${numericDate})`;

    const patterns = [
      new RegExp(`Mfg\\.?\\s*Date[:\\s]*(${anyDate})`, 'i'),
      new RegExp(`Manufacturing\\s*Date[:\\s]*(${anyDate})`, 'i'),
      new RegExp(`Date\\s*of\\s*Manufacture[:\\s]*(${anyDate})`, 'i'),
      new RegExp(`(${anyDate}).*?(?:Mfg|Manufacturing)`, 'i'),
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }

  private extractExpiryDate(text: string): string | null {
    const monthNameDate = '\\d{1,2}[-\\/\\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\\/\\s]\\d{2,4}';
    const numericDate = '\\d{1,2}[-\\/]\\d{1,2}[-\\/]\\d{2,4}';
    const isoDate = '\\d{4}[-\\/]\\d{2}[-\\/]\\d{2}';
    const anyDate = `(?:${monthNameDate}|${isoDate}|${numericDate})`;

    const patterns = [
      new RegExp(`Exp\\.?\\s*Date[:\\s]*(${anyDate})`, 'i'),
      new RegExp(`Expiry\\s*Date[:\\s]*(${anyDate})`, 'i'),
      new RegExp(`Date\\s*of\\s*Expiry[:\\s]*(${anyDate})`, 'i'),
      new RegExp(`(${anyDate}).*?(?:Exp|Expiry)`, 'i'),
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }

  private extractComplianceStatus(text: string): boolean | null {
    const compliantPatterns = [
      /Overall\s*Compliance\s+COMPLIANT/i,
      /Overall\s*Compliance[:\s]+COMPLIANT/i,
      /Compliant\s*[\u2611\u2713\u2714✓☑]/i,
      /[\u2611\u2713\u2714✓☑]\s*Compliant/i,
      /Batch\s*Allocation\s*Log\s*Verified.*?Compliant/i,
      /is\s*correct\s*and\s*shelf\s*life\s*is\s*matching/i,
      /\bCOMPLIANT\b/,
    ];
    
    const nonCompliantPatterns = [
      /Overall\s*Compliance\s+NON[-\s]?COMPLIANT/i,
      /Non[-\s]?Compliant\s*[\u2611\u2713\u2714✓☑]/i,
      /[\u2611\u2713\u2714✓☑]\s*Non[-\s]?Compliant/i,
      /\bNON[-\s]?COMPLIANT\b/i,
    ];

    for (const pattern of nonCompliantPatterns) {
      if (pattern.test(text)) return false;
    }

    for (const pattern of compliantPatterns) {
      if (pattern.test(text)) return true;
    }
    
    return null;
  }

  private extractQaOfficer(text: string): string | null {
    const patterns = [
      /Verified\s*By[:\s]*QA\s*Officer\s*[–\-]\s*([A-Za-z\s]+?)(?:Verification|Date|\d{4})/i,
      /Verified\s*By[:\s]*([A-Za-z\s]+?)(?:QA|Date|\d)/i,
      /QA\s*Officer[:\s–\-]*([A-Za-z\s]+?)(?:\d|Date|Verification)/i,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const name = match[1].trim();
        if (name.length > 2 && name.length < 50) return name;
      }
    }
    return null;
  }

  private extractVerificationDate(text: string): string | null {
    const patterns = [
      /Verification\s*Date[:\s]+(\d{4}[-\/]\d{2}[-\/]\d{2})/i,
      /Verification\s*Date\s+(\d{4}[-\/]\d{2}[-\/]\d{2})/i,
      /Verified.*?Date[:\s]*(\d{4}[-\/]\d{2}[-\/]\d{2})/i,
      /QA\s*Officer.*?(\d{4}[-\/]\d{2}[-\/]\d{2})/i,
      /Date[:\s]*(\d{4}[-\/]\d{2}[-\/]\d{2}).*?(?:Page|Confidential)/i,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }

  private extractRawMaterials(text: string, tables: any[]): ExtractedMaterial[] {
    const materials: ExtractedMaterial[] = [];
    
    const materialPattern = /\b(RM[-\s]?\d{3,})\b/gi;
    const matches: RegExpExecArray[] = [];
    let match;
    while ((match = materialPattern.exec(text)) !== null) {
      matches.push(match);
    }
    
    for (let i = 0; i < matches.length; i++) {
      const codeMatch = matches[i];
      const materialCode = codeMatch[1].replace(/\s/g, '-');
      const startPos = codeMatch.index! + codeMatch[0].length;
      const endPos = i < matches.length - 1 ? matches[i + 1].index! : Math.min(text.length, startPos + 300);
      const context = text.substring(startPos, endPos);
      
      const nameMatch = context.match(/^\s*([A-Za-z][A-Za-z0-9\s]+?)(?=\s*[\d±])/);
      const materialName = nameMatch ? nameMatch[1].trim() : "";
      
      const qtyMatch = context.match(/([\d.]+)\s*(kg|g|mg|ml|l)\b/i);
      const bomQuantity = qtyMatch ? qtyMatch[0] : "";
      
      const limitsMatch = context.match(/±[\d.]+%\s*\([^)]+\)|Fixed\s*Range[:\s]*[\d.]+-[\d.]+\s*\w+|\([\d.]+\s*\w+\s*-\s*[\d.]+\s*\w+\)/i);
      const approvedLimits = limitsMatch ? limitsMatch[0] : "";
      
      if (materialCode) {
        materials.push({
          materialCode,
          materialName,
          bomQuantity,
          approvedLimits,
        });
      }
    }
    
    return materials;
  }

  private calculateShelfLife(mfgDate: string, expDate: string): number | null {
    try {
      const parseMfg = this.parseDate(mfgDate);
      const parseExp = this.parseDate(expDate);
      
      if (!parseMfg || !parseExp) return null;
      
      const months = (parseExp.getFullYear() - parseMfg.getFullYear()) * 12 +
                     (parseExp.getMonth() - parseMfg.getMonth());
      
      return months > 0 ? months : null;
    } catch {
      return null;
    }
  }

  private parseDate(dateStr: string): Date | null {
    const monthNames: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      january: 0, february: 1, march: 2, april: 3, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    };

    const namedMonthMatch = dateStr.match(/(\d{1,2})[-\/\s]((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\.?[-\/\s](\d{2,4})/i);
    if (namedMonthMatch) {
      const day = parseInt(namedMonthMatch[1]);
      const monthKey = namedMonthMatch[2].toLowerCase();
      const monthIdx = monthNames[monthKey];
      let year = parseInt(namedMonthMatch[3]);
      if (year < 100) year += 2000;
      if (monthIdx !== undefined) {
        return new Date(year, monthIdx, day);
      }
    }

    const formats = [
      /(\d{4})[-\/](\d{2})[-\/](\d{2})/,
      /(\d{2})[-\/](\d{2})[-\/](\d{4})/,
      /(\d{2})[-\/](\d{2})[-\/](\d{2})/,
    ];
    
    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        let year, month, day;
        if (match[1].length === 4) {
          year = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          day = parseInt(match[3]);
        } else if (match[3].length === 4) {
          day = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          year = parseInt(match[3]);
        } else {
          year = 2000 + parseInt(match[3]);
          month = parseInt(match[2]) - 1;
          day = parseInt(match[1]);
        }
        return new Date(year, month, day);
      }
    }
    return null;
  }
}

export const batchAllocationVerificationService = new BatchAllocationVerificationService();
