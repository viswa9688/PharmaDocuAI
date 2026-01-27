import OpenAI from "openai";
import type { PageType } from "@shared/schema";

const PAGE_TYPE_DESCRIPTIONS = {
  materials_log: "Documents tracking raw materials, ingredients, and components used in production",
  equipment_log: "Records of equipment usage, calibration, maintenance, and operational parameters",
  cip_sip_record: "Clean-in-place (CIP) and Sterilize-in-place (SIP) cleaning and sterilization records",
  filtration_step: "Documentation of filtration processes, filter integrity tests, and parameters",
  filling_log: "Records of filling operations, fill weights, container counts, and line clearance",
  inspection_sheet: "Quality inspection records, visual checks, and defect documentation",
  reconciliation_page: "Material reconciliation, yield calculations, and batch accounting",
  unknown: "Page type cannot be determined or doesn't match known categories",
};

interface ClassificationResult {
  classification: PageType;
  confidence: number;
  reasoning: string;
}

export class ClassifierService {
  private openai: OpenAI | null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      console.warn("OpenAI API key not configured - using rule-based classification");
      this.openai = null;
    }
  }

  async classifyPage(text: string, pageNumber: number): Promise<ClassificationResult> {
    // If OpenAI is not available, use rule-based classification
    if (!this.openai) {
      return this.ruleBasedClassification(text, pageNumber);
    }

    try {
      const prompt = `You are an expert at analyzing pharmaceutical batch record documents. Classify the following page text into one of these categories:

${Object.entries(PAGE_TYPE_DESCRIPTIONS).map(([key, desc]) => `- ${key}: ${desc}`).join('\n')}

Page ${pageNumber} text:
${text.substring(0, 2000)}

Analyze the content and respond in JSON format with:
{
  "classification": "<one of the page types>",
  "confidence": <0-100>,
  "reasoning": "<brief explanation>"
}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert pharmaceutical batch record analyst. Respond only with valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        classification: result.classification || "unknown",
        confidence: Math.min(100, Math.max(0, result.confidence || 50)),
        reasoning: result.reasoning || "AI classification",
      };
    } catch (error) {
      console.error("OpenAI classification error:", error);
      return this.ruleBasedClassification(text, pageNumber);
    }
  }

  private ruleBasedClassification(text: string, pageNumber: number): ClassificationResult {
    const lowerText = text.toLowerCase();

    // Materials log keywords
    if (lowerText.includes("material") || lowerText.includes("ingredient") || 
        lowerText.includes("raw material") || lowerText.includes("lot number")) {
      return {
        classification: "materials_log",
        confidence: 70,
        reasoning: "Contains material/ingredient keywords",
      };
    }

    // Equipment log keywords
    if (lowerText.includes("equipment") || lowerText.includes("calibration") ||
        lowerText.includes("maintenance") || lowerText.includes("vessel")) {
      return {
        classification: "equipment_log",
        confidence: 70,
        reasoning: "Contains equipment keywords",
      };
    }

    // CIP/SIP keywords
    if (lowerText.includes("cip") || lowerText.includes("sip") ||
        lowerText.includes("clean-in-place") || lowerText.includes("sterilize")) {
      return {
        classification: "cip_sip_record",
        confidence: 75,
        reasoning: "Contains CIP/SIP keywords",
      };
    }

    // Filtration keywords
    if (lowerText.includes("filter") || lowerText.includes("filtration") ||
        lowerText.includes("integrity test") || lowerText.includes("pore size")) {
      return {
        classification: "filtration_step",
        confidence: 70,
        reasoning: "Contains filtration keywords",
      };
    }

    // Filling log keywords
    if (lowerText.includes("fill") || lowerText.includes("vial") ||
        lowerText.includes("container") || lowerText.includes("filling line")) {
      return {
        classification: "filling_log",
        confidence: 70,
        reasoning: "Contains filling operation keywords",
      };
    }

    // Inspection keywords
    if (lowerText.includes("inspection") || lowerText.includes("visual") ||
        lowerText.includes("defect") || lowerText.includes("appearance")) {
      return {
        classification: "inspection_sheet",
        confidence: 70,
        reasoning: "Contains inspection keywords",
      };
    }

    // Reconciliation keywords
    if (lowerText.includes("reconciliation") || lowerText.includes("yield") ||
        lowerText.includes("balance") || lowerText.includes("discrepancy")) {
      return {
        classification: "reconciliation_page",
        confidence: 70,
        reasoning: "Contains reconciliation keywords",
      };
    }

    return {
      classification: "unknown",
      confidence: 30,
      reasoning: "No clear matching keywords found",
    };
  }

  async detectQualityIssues(
    pages: Array<{ pageNumber: number; text: string; classification: PageType }>
  ): Promise<Array<{ type: string; severity: string; description: string; pageNumbers: number[] }>> {
    const issues: Array<{ type: string; severity: string; description: string; pageNumbers: number[] }> = [];

    // Check for missing pages (gaps in sequence)
    const pageNumbers = pages.map(p => p.pageNumber).sort((a, b) => a - b);
    const missingPages: number[] = [];
    
    for (let i = 1; i < pageNumbers.length; i++) {
      const gap = pageNumbers[i] - pageNumbers[i - 1];
      if (gap > 1) {
        for (let j = pageNumbers[i - 1] + 1; j < pageNumbers[i]; j++) {
          missingPages.push(j);
        }
      }
    }

    if (missingPages.length > 0) {
      issues.push({
        type: "missing",
        severity: "high",
        description: `Missing ${missingPages.length} page(s) in sequence`,
        pageNumbers: missingPages,
      });
    }

    // Check for duplicates
    const duplicates = pageNumbers.filter((num, idx) => 
      pageNumbers.indexOf(num) !== idx
    );
    
    if (duplicates.length > 0) {
      issues.push({
        type: "duplicate",
        severity: "medium",
        description: `Found ${duplicates.length} duplicate page(s)`,
        pageNumbers: Array.from(new Set(duplicates)),
      });
    }

    // Check for out of order pages
    const outOfOrder = pageNumbers.filter((num, idx) => 
      idx > 0 && num < pageNumbers[idx - 1]
    );
    
    if (outOfOrder.length > 0) {
      issues.push({
        type: "out_of_order",
        severity: "medium",
        description: "Pages appear out of chronological order",
        pageNumbers: outOfOrder,
      });
    }

    // Check for corrupted pages (very short text or no text)
    const corruptedPages = pages
      .filter(p => !p.text || p.text.trim().length < 50)
      .map(p => p.pageNumber);
    
    if (corruptedPages.length > 0) {
      issues.push({
        type: "corrupted",
        severity: "high",
        description: `${corruptedPages.length} page(s) may be corrupted or unreadable`,
        pageNumbers: corruptedPages,
      });
    }

    return issues;
  }
}

export function createClassifierService(): ClassifierService {
  return new ClassifierService();
}
