import type { 
  BMRVerification, 
  BMRDiscrepancy, 
  InsertBMRDiscrepancy,
  DiscrepancySeverity,
  DiscrepancyBoundingBox
} from "@shared/schema";

// Form field with bounding box from Document AI
export interface FormFieldWithBounds {
  fieldName: string;
  fieldValue: string;
  confidence: number;
  nameBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  valueBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Extracted field with optional bounding box
export interface ExtractedFieldWithBounds {
  value: string;
  boundingBox?: DiscrepancyBoundingBox;
}

export interface ExtractedDocumentData {
  documentType: "master_product_card" | "bmr" | "unknown";
  pageNumber: number;
  fields: Record<string, string>;
  fieldsWithBounds?: Record<string, ExtractedFieldWithBounds>;
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
    "master copy",
    "master document",
    "mpc",
    "product specification",
    "master specification",
    "master record",
    "master batch record"
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
    
    // Count matches for each document type with weighted scores
    let mpcScore = 0;
    let bmrScore = 0;
    const mpcMatches: string[] = [];
    const bmrMatches: string[] = [];
    
    // MPC identifiers with weights (more specific = higher weight)
    const mpcWeighted = [
      { id: "master product card", weight: 10 },
      { id: "master copy", weight: 5 },
      { id: "master document", weight: 5 },
      { id: "product specification", weight: 3 },
      { id: "master specification", weight: 5 },
      { id: "mpc", weight: 2 },  // Lower weight - could be abbreviation for other things
    ];
    
    // BMR identifiers with weights
    const bmrWeighted = [
      { id: "batch manufacturing record", weight: 10 },
      { id: "batch record", weight: 8 },
      { id: "manufacturing record", weight: 5 },
      { id: "bmr", weight: 3 },  // Lower weight - could be abbreviation
      { id: "batch number", weight: 2 },
      { id: "batch no", weight: 2 },
      { id: "lot number", weight: 2 },
      { id: "lot no", weight: 2 },
    ];
    
    for (const { id, weight } of mpcWeighted) {
      if (lowerText.includes(id)) {
        mpcScore += weight;
        mpcMatches.push(id);
      }
    }
    
    for (const { id, weight } of bmrWeighted) {
      if (lowerText.includes(id)) {
        bmrScore += weight;
        bmrMatches.push(id);
      }
    }
    
    console.log(`[BMR-VERIFY] Document type detection - MPC score: ${mpcScore} (${mpcMatches.join(', ')}), BMR score: ${bmrScore} (${bmrMatches.join(', ')})`);
    
    // If both have matches, pick the higher score
    if (mpcScore > 0 && bmrScore > 0) {
      if (mpcScore > bmrScore) {
        return "master_product_card";
      } else if (bmrScore > mpcScore) {
        return "bmr";
      }
      // Equal scores - look for the most definitive identifier
      if (mpcMatches.includes("master product card")) {
        return "master_product_card";
      }
      if (bmrMatches.includes("batch manufacturing record") || bmrMatches.includes("batch record")) {
        return "bmr";
      }
    }
    
    if (mpcScore > 0) return "master_product_card";
    if (bmrScore > 0) return "bmr";
    
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

  // Extract fields from Document AI form fields with bounding boxes
  extractFieldsWithBounds(
    formFields: FormFieldWithBounds[],
    pageNumber: number
  ): Record<string, ExtractedFieldWithBounds> {
    const fieldsWithBounds: Record<string, ExtractedFieldWithBounds> = {};
    
    // Log all form fields for debugging
    console.log(`[BMR-BOUNDS] Page ${pageNumber}: Found ${formFields.length} form fields from Document AI`);
    for (const ff of formFields) {
      console.log(`[BMR-BOUNDS]   Field: "${ff.fieldName}" = "${ff.fieldValue?.substring(0, 50)}..." hasBounds: ${!!ff.valueBoundingBox}`);
    }
    
    // Map of field name patterns to standardized field keys - use more flexible matching
    const fieldNameMappings: Array<{ patterns: RegExp[]; key: string }> = [
      { patterns: [/product\s*name/i, /product\s*title/i, /^name$/i, /prod.*name/i], key: "product_name" },
      { patterns: [/product\s*code/i, /sku/i, /product\s*id/i, /^code$/i, /prod.*code/i], key: "product_code" },
      { patterns: [/batch\s*size/i, /batch\s*quantity/i, /batch\s*in\s*total/i, /^size$/i], key: "batch_size" },
      { patterns: [/unit\s*of\s*measure/i, /uom/i, /^unit$/i], key: "unit_of_measure" },
      { patterns: [/expiry\s*date/i, /exp\.?\s*date/i, /expiration/i, /^expiry$/i], key: "expiry_date" },
      { patterns: [/shelf\s*life/i, /^life$/i], key: "shelf_life" },
      { patterns: [/physical\s*description/i, /appearance/i, /description/i, /^desc$/i], key: "physical_description" },
      { patterns: [/dimensions?/i, /weight/i, /^dim$/i], key: "dimensions_weight" },
      { patterns: [/active\s*ingredients?/i, /composition/i, /^ingredients?$/i, /^active$/i], key: "active_ingredients" },
      { patterns: [/storage\s*conditions?/i, /storage/i, /^store$/i], key: "storage_conditions" },
      { patterns: [/manufacturing\s*location/i, /facility/i, /location/i, /^mfg.*loc/i], key: "manufacturing_location" },
      { patterns: [/equipment\s*required/i, /equipment/i, /^equip$/i], key: "equipment_required" },
      { patterns: [/quality\s*control/i, /qc\s*checkpoints?/i, /^qc$/i], key: "quality_control_checkpoints" },
    ];
    
    for (const formField of formFields) {
      const fieldName = formField.fieldName.toLowerCase().trim();
      
      for (const { patterns, key } of fieldNameMappings) {
        if (fieldsWithBounds[key]) continue; // Already found this field
        
        for (const pattern of patterns) {
          if (pattern.test(fieldName)) {
            const value = formField.fieldValue.trim();
            if (value && value.length > 0) {
              // Document AI returns normalized coordinates (0-1) which are converted to page dimension pixels
              // Our PDF images are rendered at scale 2 (144 DPI effective), so we need to multiply by 2
              const PDF_SCALE = 2;
              const bb = formField.valueBoundingBox;
              if (bb) {
                console.log(`[BMR-BOUNDS]   Matched: "${fieldName}" -> ${key}`);
                console.log(`[BMR-BOUNDS]     Raw (from Doc AI): x=${bb.x.toFixed(1)}, y=${bb.y.toFixed(1)}, w=${bb.width.toFixed(1)}, h=${bb.height.toFixed(1)}`);
                console.log(`[BMR-BOUNDS]     Scaled (x${PDF_SCALE}): x=${(bb.x * PDF_SCALE).toFixed(1)}, y=${(bb.y * PDF_SCALE).toFixed(1)}, w=${(bb.width * PDF_SCALE).toFixed(1)}, h=${(bb.height * PDF_SCALE).toFixed(1)}`);
              }
              fieldsWithBounds[key] = {
                value,
                boundingBox: bb ? {
                  x: bb.x * PDF_SCALE,
                  y: bb.y * PDF_SCALE,
                  width: bb.width * PDF_SCALE,
                  height: bb.height * PDF_SCALE,
                  pageNumber
                } : undefined
              };
            }
            break;
          }
        }
      }
    }
    
    console.log(`[BMR-BOUNDS] Page ${pageNumber}: Extracted ${Object.keys(fieldsWithBounds).length} fields with bounds:`, Object.keys(fieldsWithBounds));
    
    return fieldsWithBounds;
  }

  // Find bounding box for a value by searching through all form fields
  findBoundingBoxForValue(
    formFields: FormFieldWithBounds[],
    value: string | undefined,
    pageNumber: number
  ): DiscrepancyBoundingBox | null {
    if (!value || value.length < 3) return null;
    
    const normalizedValue = value.toLowerCase().trim();
    if (normalizedValue.length < 3) return null;
    
    // First pass: exact match
    for (const formField of formFields) {
      const fieldValue = formField.fieldValue?.toLowerCase().trim() || '';
      if (fieldValue.length < 3) continue; // Skip empty/short values
      
      if (fieldValue === normalizedValue && formField.valueBoundingBox) {
        console.log(`[BMR-BOUNDS] Found exact bounding box for value "${value.substring(0, 30)}..."`);
        // PDF images are rendered at 2x scale
        const PDF_SCALE = 2;
        return {
          x: formField.valueBoundingBox.x * PDF_SCALE,
          y: formField.valueBoundingBox.y * PDF_SCALE,
          width: formField.valueBoundingBox.width * PDF_SCALE,
          height: formField.valueBoundingBox.height * PDF_SCALE,
          pageNumber
        };
      }
    }
    
    // Second pass: substring match (with minimum length requirements)
    for (const formField of formFields) {
      const fieldValue = formField.fieldValue?.toLowerCase().trim() || '';
      if (fieldValue.length < 3) continue; // Skip empty/short values
      
      // Check if one contains the other with reasonable length
      const containsMatch = (fieldValue.includes(normalizedValue) && normalizedValue.length >= 5) || 
                           (normalizedValue.includes(fieldValue) && fieldValue.length >= 5);
      
      if (containsMatch && formField.valueBoundingBox) {
        console.log(`[BMR-BOUNDS] Found substring bounding box for value "${value.substring(0, 30)}..."`);
        // PDF images are rendered at 2x scale
        const PDF_SCALE = 2;
        return {
          x: formField.valueBoundingBox.x * PDF_SCALE,
          y: formField.valueBoundingBox.y * PDF_SCALE,
          width: formField.valueBoundingBox.width * PDF_SCALE,
          height: formField.valueBoundingBox.height * PDF_SCALE,
          pageNumber
        };
      }
    }
    
    return null;
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

  // Compare fields with bounding boxes
  compareFieldsWithBounds(
    mpcFieldsWithBounds: Record<string, ExtractedFieldWithBounds>,
    bmrFieldsWithBounds: Record<string, ExtractedFieldWithBounds>,
    mpcFields: Record<string, string>,
    bmrFields: Record<string, string>,
    mpcRawFormFields?: FormFieldWithBounds[],
    bmrRawFormFields?: FormFieldWithBounds[],
    mpcPageNumber?: number,
    bmrPageNumber?: number
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
      // Use form field extracted values if available, otherwise fall back to text extraction
      const mpcValue = mpcFieldsWithBounds[key]?.value || mpcFields[key];
      const bmrValue = bmrFieldsWithBounds[key]?.value || bmrFields[key];
      
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
        
        // Try to get bounding box from field extraction, or fallback to value matching
        let mpcBoundingBox = mpcFieldsWithBounds[key]?.boundingBox || null;
        let bmrBoundingBox = bmrFieldsWithBounds[key]?.boundingBox || null;
        
        // Fallback: Try to find bounding box by value matching if not found by field name
        if (!mpcBoundingBox && mpcValue && mpcRawFormFields && mpcPageNumber !== undefined) {
          mpcBoundingBox = this.findBoundingBoxForValue(mpcRawFormFields, mpcValue, mpcPageNumber);
        }
        if (!bmrBoundingBox && bmrValue && bmrRawFormFields && bmrPageNumber !== undefined) {
          bmrBoundingBox = this.findBoundingBoxForValue(bmrRawFormFields, bmrValue, bmrPageNumber);
        }
        
        discrepancies.push({
          fieldName: key,
          mpcValue: mpcValue || null,
          bmrValue: bmrValue || null,
          severity,
          description,
          section,
          mpcBoundingBox,
          bmrBoundingBox,
        });
      }
    }
    
    console.log(`[BMR-BOUNDS] Created ${discrepancies.length} discrepancies, with bounding boxes:`, 
      discrepancies.map(d => ({ field: d.fieldName, hasMpc: !!d.mpcBoundingBox, hasBmr: !!d.bmrBoundingBox })));
    
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

  // Process and verify with Document AI form fields for bounding boxes
  async processAndVerifyWithBounds(
    pageTexts: Array<{ pageNumber: number; text: string }>,
    pageFormFields: Array<{ pageNumber: number; formFields: FormFieldWithBounds[] }>
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
    
    // Extract text-based fields
    const mpcFields = this.extractFieldsFromText(mpcPage.text);
    const bmrFields = this.extractFieldsFromText(bmrPage.text);
    
    // Extract form fields with bounding boxes
    const mpcFormFields = pageFormFields.find(p => p.pageNumber === mpcPage!.pageNumber);
    const bmrFormFields = pageFormFields.find(p => p.pageNumber === bmrPage!.pageNumber);
    
    const mpcFieldsWithBounds = mpcFormFields 
      ? this.extractFieldsWithBounds(mpcFormFields.formFields, mpcPage.pageNumber)
      : {};
    const bmrFieldsWithBounds = bmrFormFields 
      ? this.extractFieldsWithBounds(bmrFormFields.formFields, bmrPage.pageNumber)
      : {};
    
    const verificationResult = this.compareFieldsWithBounds(
      mpcFieldsWithBounds,
      bmrFieldsWithBounds,
      mpcFields,
      bmrFields,
      mpcFormFields?.formFields,
      bmrFormFields?.formFields,
      mpcPage.pageNumber,
      bmrPage.pageNumber
    );
    
    return {
      mpcPageNumber: mpcPage.pageNumber,
      bmrPageNumber: bmrPage.pageNumber,
      verificationResult,
    };
  }
}

export const bmrVerificationService = new BMRVerificationService();
