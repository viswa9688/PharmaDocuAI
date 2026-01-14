import type { 
  BMRVerification, 
  BMRDiscrepancy, 
  InsertBMRDiscrepancy,
  DiscrepancySeverity 
} from "@shared/schema";

export interface ExtractedDocumentData {
  documentType: "master_product_card" | "bmr" | "unknown";
  pageNumber: number;
  fields: Record<string, string>;
  confidence: number;
}

export interface VerificationResult {
  discrepancies: Omit<InsertBMRDiscrepancy, "verificationId">[];
  matchedFields: string[];
  totalFieldsCompared: number;
  mpcData: Record<string, any>;
  bmrData: Record<string, any>;
}

export class BMRVerificationService {
  private mpcIdentifiers = [
    "master product card",
    "mpc",
    "product specification",
    "master specification"
  ];
  
  private bmrIdentifiers = [
    "batch manufacturing record",
    "bmr",
    "batch record",
    "manufacturing record"
  ];

  private criticalFields = [
    "product name",
    "product code",
    "batch size",
    "active ingredients",
    "storage conditions"
  ];

  private majorFields = [
    "manufacturing location",
    "equipment required",
    "quality control checkpoints",
    "physical description",
    "dimensions",
    "weight"
  ];

  identifyDocumentType(text: string): "master_product_card" | "bmr" | "unknown" {
    const lowerText = text.toLowerCase();
    
    for (const identifier of this.mpcIdentifiers) {
      if (lowerText.includes(identifier)) {
        return "master_product_card";
      }
    }
    
    for (const identifier of this.bmrIdentifiers) {
      if (lowerText.includes(identifier)) {
        return "bmr";
      }
    }
    
    return "unknown";
  }

  extractFieldsFromText(text: string): Record<string, string> {
    const fields: Record<string, string> = {};
    const lines = text.split('\n');
    const fullText = text;
    
    const fieldPatterns = [
      { patterns: [/product\s*name[:\s]+(.+)/i, /product\s*name\s*\([^)]*\)[:\s]+(.+)/i, /^product\s*name\s+(.+)/i], key: "product_name" },
      { patterns: [/product\s*code[:\s]+(.+)/i, /product\s*code\s*\/?\s*sku[:\s]+(.+)/i, /sku[:\s]+(.+)/i], key: "product_code" },
      { patterns: [/batch\s*size[:\s]+(.+)/i, /batch\s*in\s*total[:\s]+(.+)/i], key: "batch_size" },
      { patterns: [/unit\s*of\s*measure[:\s]+(.+)/i, /uom[:\s]+(.+)/i], key: "unit_of_measure" },
      { patterns: [/expiry\s*date[:\s]+(.+)/i, /exp\.?\s*date[:\s]+(.+)/i, /expiration\s*date[:\s]+(.+)/i], key: "expiry_date" },
      { patterns: [/shelf\s*life[:\s]+(.+)/i], key: "shelf_life" },
      { patterns: [/physical\s*description[:\s]+(.+)/i, /description[:\s]+(.+)/i, /appearance[:\s]+(.+)/i], key: "physical_description" },
      { patterns: [/dimensions?\s*\/?\s*weight[:\s]+(.+)/i, /dimensions[:\s]+(.+)/i, /weight[:\s]+(.+)/i], key: "dimensions_weight" },
      { patterns: [/active\s*ingredients?[:\s]+(.+)/i, /composition[:\s]+(.+)/i, /active\s*ingredients?\s*\/?\s*composition[:\s]+(.+)/i], key: "active_ingredients" },
      { patterns: [/storage\s*conditions?[:\s]+(.+)/i, /storage[:\s]+(.+)/i, /store\s*in[:\s]+(.+)/i], key: "storage_conditions" },
      { patterns: [/manufacturing\s*location[:\s]+(.+)/i, /location[:\s]+(.+)/i, /facility[:\s]+(.+)/i], key: "manufacturing_location" },
      { patterns: [/equipment\s*required[:\s]+(.+)/i, /equipment[:\s]+(.+)/i], key: "equipment_required" },
      { patterns: [/quality\s*control\s*checkpoints?[:\s]+(.+)/i, /qc\s*checkpoints?[:\s]+(.+)/i], key: "quality_control_checkpoints" },
    ];
    
    for (const line of lines) {
      for (const { patterns, key } of fieldPatterns) {
        if (fields[key]) continue;
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match && match[1]) {
            const value = match[1].trim();
            if (value && value.length > 0 && !value.match(/^[-_\s]*$/)) {
              fields[key] = value;
              break;
            }
          }
        }
      }
    }
    
    const tableLabelPatterns = [
      { labels: ["Product Name", "Product"], key: "product_name" },
      { labels: ["Product Code", "SKU", "Product Code / SKU"], key: "product_code" },
      { labels: ["Batch Size", "Batch in Total"], key: "batch_size" },
      { labels: ["Unit of Measure", "UOM"], key: "unit_of_measure" },
      { labels: ["Expiry Date", "Exp. Date"], key: "expiry_date" },
      { labels: ["Shelf Life"], key: "shelf_life" },
      { labels: ["Physical Description", "Appearance", "Description"], key: "physical_description" },
      { labels: ["Dimensions / Weight", "Dimensions", "Weight"], key: "dimensions_weight" },
      { labels: ["Active Ingredients", "Composition", "Active Ingredients / Composition"], key: "active_ingredients" },
      { labels: ["Storage Conditions", "Storage"], key: "storage_conditions" },
      { labels: ["Manufacturing Location", "Location", "Facility"], key: "manufacturing_location" },
      { labels: ["Equipment Required", "Equipment"], key: "equipment_required" },
      { labels: ["Quality Control Checkpoints", "QC Checkpoints"], key: "quality_control_checkpoints" },
    ];
    
    for (const { labels, key } of tableLabelPatterns) {
      if (fields[key]) continue;
      for (const label of labels) {
        const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tablePattern = new RegExp(`${escapedLabel}\\s*[:\\|]?\\s*([^\\n\\|]+)`, 'i');
        const match = fullText.match(tablePattern);
        if (match && match[1]) {
          const value = match[1].trim();
          if (value && value.length > 0 && !value.match(/^[-_\s]*$/)) {
            fields[key] = value;
            break;
          }
        }
      }
    }
    
    return fields;
  }

  extractRawMaterials(text: string): Array<{ code: string; name: string; quantity: string }> {
    const materials: Array<{ code: string; name: string; quantity: string }> = [];
    const lines = text.split('\n');
    
    const materialPattern = /^(RM-\d+)\s+(.+?)\s+([\d.]+\s*\w+)/i;
    
    for (const line of lines) {
      const match = line.match(materialPattern);
      if (match) {
        materials.push({
          code: match[1],
          name: match[2].trim(),
          quantity: match[3].trim()
        });
      }
    }
    
    return materials;
  }

  extractManufacturingSteps(text: string): Array<{ stepNo: string; description: string; equipment: string }> {
    const steps: Array<{ stepNo: string; description: string; equipment: string }> = [];
    const lines = text.split('\n');
    
    const stepPattern = /^(\d+)\.?\s+(.+)/i;
    
    for (const line of lines) {
      const match = line.match(stepPattern);
      if (match) {
        steps.push({
          stepNo: match[1],
          description: match[2].trim(),
          equipment: ""
        });
      }
    }
    
    return steps;
  }

  determineSeverity(fieldName: string): DiscrepancySeverity {
    const lowerFieldName = fieldName.toLowerCase().replace(/_/g, ' ');
    
    if (this.criticalFields.some(f => lowerFieldName.includes(f))) {
      return "critical";
    }
    
    if (this.majorFields.some(f => lowerFieldName.includes(f))) {
      return "major";
    }
    
    return "minor";
  }

  normalizeValue(value: string | undefined | null): string {
    if (!value) return "";
    return value.toString().toLowerCase().trim().replace(/\s+/g, ' ');
  }

  compareFields(
    mpcFields: Record<string, string>,
    bmrFields: Record<string, string>
  ): VerificationResult {
    const discrepancies: Omit<InsertBMRDiscrepancy, "verificationId">[] = [];
    const matchedFields: string[] = [];
    
    const fieldsToCompare = [
      { key: "product_name", section: "Product Information" },
      { key: "product_code", section: "Product Information" },
      { key: "batch_size", section: "Product Information" },
      { key: "unit_of_measure", section: "Product Information" },
      { key: "expiry_date", section: "Product Information" },
      { key: "shelf_life", section: "Product Information" },
      { key: "physical_description", section: "Specifications" },
      { key: "dimensions_weight", section: "Specifications" },
      { key: "active_ingredients", section: "Specifications" },
      { key: "storage_conditions", section: "Specifications" },
      { key: "manufacturing_location", section: "Manufacturing Details" },
      { key: "equipment_required", section: "Manufacturing Details" },
      { key: "quality_control_checkpoints", section: "Manufacturing Details" },
    ];
    
    let fieldsActuallyCompared = 0;
    
    for (const { key, section } of fieldsToCompare) {
      const mpcValue = mpcFields[key];
      const bmrValue = bmrFields[key];
      
      if (!mpcValue && !bmrValue) {
        continue;
      }
      
      fieldsActuallyCompared++;
      
      const normalizedMpc = this.normalizeValue(mpcValue);
      const normalizedBmr = this.normalizeValue(bmrValue);
      
      if (normalizedMpc === normalizedBmr) {
        matchedFields.push(key);
      } else {
        const severity = this.determineSeverity(key);
        const fieldDisplayName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        let description = "";
        if (!mpcValue && bmrValue) {
          description = `Field "${fieldDisplayName}" is present in BMR but missing in Master Product Card`;
        } else if (mpcValue && !bmrValue) {
          description = `Field "${fieldDisplayName}" is present in Master Product Card but missing in BMR`;
        } else {
          description = `Field "${fieldDisplayName}" has different values: MPC="${mpcValue}" vs BMR="${bmrValue}"`;
        }
        
        discrepancies.push({
          fieldName: key,
          mpcValue: mpcValue || null,
          bmrValue: bmrValue || null,
          severity,
          description,
          section,
        });
      }
    }
    
    return {
      discrepancies,
      matchedFields,
      totalFieldsCompared: fieldsActuallyCompared,
      mpcData: mpcFields,
      bmrData: bmrFields,
    };
  }

  async processAndVerify(
    pageTexts: Array<{ pageNumber: number; text: string }>
  ): Promise<{
    mpcPageNumber: number | null;
    bmrPageNumber: number | null;
    verificationResult: VerificationResult | null;
    error?: string;
  }> {
    let mpcPage: { pageNumber: number; text: string } | null = null;
    let bmrPage: { pageNumber: number; text: string } | null = null;
    
    for (const page of pageTexts) {
      const docType = this.identifyDocumentType(page.text);
      
      if (docType === "master_product_card" && !mpcPage) {
        mpcPage = page;
      } else if (docType === "bmr" && !bmrPage) {
        bmrPage = page;
      }
      
      if (mpcPage && bmrPage) {
        break;
      }
    }
    
    if (!mpcPage) {
      return {
        mpcPageNumber: null,
        bmrPageNumber: bmrPage?.pageNumber || null,
        verificationResult: null,
        error: "Could not identify Master Product Card in the uploaded document"
      };
    }
    
    if (!bmrPage) {
      return {
        mpcPageNumber: mpcPage.pageNumber,
        bmrPageNumber: null,
        verificationResult: null,
        error: "Could not identify Batch Manufacturing Record in the uploaded document"
      };
    }
    
    const mpcFields = this.extractFieldsFromText(mpcPage.text);
    const bmrFields = this.extractFieldsFromText(bmrPage.text);
    
    const verificationResult = this.compareFields(mpcFields, bmrFields);
    
    return {
      mpcPageNumber: mpcPage.pageNumber,
      bmrPageNumber: bmrPage.pageNumber,
      verificationResult,
    };
  }
}

export const bmrVerificationService = new BMRVerificationService();
