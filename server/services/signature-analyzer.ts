import type {
  HandwrittenRegion,
  SignatureBlock,
  CheckboxData,
  FormField,
  BoundingBox,
} from './document-ai';
import type { TextBlock } from './layout-analyzer';

// Signature role types
export type SignatureRole =
  | 'operator'
  | 'supervisor'
  | 'reviewer'
  | 'qa_reviewer'
  | 'qa_approver'
  | 'verifier'
  | 'manager'
  | 'released_by'
  | 'checked_by'
  | 'performed_by'
  | 'unknown';

// Detected signature with metadata
export interface DetectedSignature {
  role: SignatureRole;
  fieldLabel: string;
  boundingBox: BoundingBox;
  associatedDate?: string;
  dateBoundingBox?: BoundingBox;
  confidence: number;
  signatureType: 'handwritten' | 'stamp' | 'initial';
  hasDate: boolean;
}

// Approval checkpoint (signature + optional checkbox)
export interface ApprovalCheckpoint {
  role: SignatureRole;
  signature?: DetectedSignature;
  checkbox?: CheckboxData;
  isComplete: boolean;
  isMissing: boolean;
  associatedText?: string;
}

// Complete approval analysis result
export interface ApprovalAnalysis {
  signatures: DetectedSignature[];
  checkpoints: ApprovalCheckpoint[];
  approvalChain: SignatureRole[];
  missingSignatures: SignatureRole[];
  sequenceValid: boolean;
  allDatesPresent: boolean;
  allCheckboxesChecked: boolean;
  finalApprovalRole?: SignatureRole; // Which final role satisfied the requirement
}

// Input data from Document AI
export interface ExtractedApprovalData {
  handwrittenRegions?: HandwrittenRegion[];
  signatures?: SignatureBlock[];
  checkboxes?: CheckboxData[];
  formFields?: FormField[];
  textBlocks?: TextBlock[];
  pageDimensions?: { width: number; height: number };
}

export class SignatureAnalyzer {
  // Field label patterns for different signature roles
  private rolePatterns: Record<SignatureRole, RegExp[]> = {
    operator: [
      /operator[\s:]/i,
      /performed\s+by[\s:]/i,
      /executed\s+by[\s:]/i,
      /tech(?:nician)?[\s:]/i,
      /conducted\s+by[\s:]/i,
    ],
    supervisor: [
      /supervisor[\s:]/i,
      /supv[\s:]/i,
      /lead[\s:]/i,
      /team\s+lead[\s:]/i,
    ],
    reviewer: [
      /review(?:ed)?\s+by[\s:]/i,
      /reviewer[\s:]/i,
      /second\s+check[\s:]/i,
    ],
    qa_reviewer: [
      /qa\s+review(?:er)?[\s:]/i,
      /quality\s+assurance\s+review[\s:]/i,
      /qc\s+review(?:er)?[\s:]/i,
    ],
    qa_approver: [
      /qa\s+approv(?:al|ed|er)[\s:]/i,
      /quality\s+assurance\s+approv[\s:]/i,
      /qc\s+approv(?:al|ed|er)[\s:]/i,
    ],
    verifier: [
      /verif(?:ied|ier)\s+by[\s:]/i,
      /verification[\s:]/i,
      /confirmed\s+by[\s:]/i,
    ],
    manager: [
      /manager[\s:]/i,
      /mgr[\s:]/i,
      /production\s+manager[\s:]/i,
    ],
    released_by: [
      /released\s+by[\s:]/i,
      /release[\s:]/i,
      /batch\s+release[\s:]/i,
    ],
    checked_by: [
      /checked\s+by[\s:]/i,
      /check[\s:]/i,
      /inspected\s+by[\s:]/i,
    ],
    performed_by: [
      /performed\s+by[\s:]/i,
      /done\s+by[\s:]/i,
      /carried\s+out\s+by[\s:]/i,
    ],
    unknown: [],
  };

  // Date patterns
  private datePatterns = [
    /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/,  // MM/DD/YYYY or DD-MM-YYYY
    /\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4}/i, // DD MMM YYYY
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}/,  // YYYY-MM-DD
    /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i, // Month DD, YYYY
  ];

  // Standard approval sequence for pharmaceutical batch records
  // Required roles that must appear in order for compliance
  private standardApprovalSequence: SignatureRole[] = [
    'operator',
    'reviewer',
    'qa_reviewer',
    'qa_approver',
  ];

  // Acceptable final approval roles (any one of these can satisfy the final requirement)
  private finalApprovalRoles: SignatureRole[] = [
    'verifier',
    'manager',
    'released_by',
    'qa_approver', // QA approver can be final if no verifier/manager/released_by
  ];

  analyze(data: ExtractedApprovalData): ApprovalAnalysis {
    // Detect all signatures with their roles
    const signatures = this.detectSignatures(data);

    // Sort signatures by vertical position (top to bottom)
    const sortedSignatures = [...signatures].sort(
      (a, b) => a.boundingBox.y - b.boundingBox.y
    );

    // Build canonical approval checkpoints matched against detected signatures
    const { checkpoints, finalApprovalRole } = this.buildCanonicalCheckpoints(
      sortedSignatures, 
      data.checkboxes || []
    );

    // Extract approval chain from checkpoints (only matched signatures in order)
    const approvalChain = checkpoints
      .filter(cp => cp.signature && !cp.isMissing)
      .map(cp => cp.role);

    // Identify missing required signatures from checkpoints
    const missingSignatures = checkpoints
      .filter(cp => cp.isMissing)
      .map(cp => cp.role);

    // Validate signature sequence based on canonical checkpoint order
    const sequenceValid = this.validateCanonicalSequence(checkpoints, sortedSignatures);

    // Check if all signatures have dates
    const allDatesPresent = signatures.length === 0 || signatures.every(sig => sig.hasDate);

    // Check if all approval-related checkboxes are checked
    const approvalCheckboxes = checkpoints
      .filter(cp => cp.checkbox)
      .map(cp => cp.checkbox!);
    const allCheckboxesChecked = approvalCheckboxes.length === 0 || 
      approvalCheckboxes.every(cb => cb.state === 'checked');

    return {
      signatures,
      checkpoints,
      approvalChain,
      missingSignatures,
      sequenceValid,
      allDatesPresent,
      allCheckboxesChecked,
      finalApprovalRole,
    };
  }

  private detectSignatures(data: ExtractedApprovalData): DetectedSignature[] {
    const detectedSignatures: DetectedSignature[] = [];
    
    // Combine all potential signature sources
    const signatureSources = [
      ...(data.signatures || []).map(s => ({ ...s, type: 'signature' as const })),
      ...(data.handwrittenRegions || []).map(h => ({ ...h, type: 'handwritten' as const })),
    ];

    // Get all text elements that might contain field labels
    const textElements = [
      ...(data.textBlocks || []),
      ...(data.formFields || []).map(f => ({
        text: f.fieldName || '',
        boundingBox: f.nameBoundingBox,
        confidence: f.confidence,
      })),
    ];

    for (const sigSource of signatureSources) {
      const sigBox = sigSource.boundingBox;
      if (!sigBox) continue;

      // Find nearby text that might be the field label
      const nearbyLabel = this.findNearestLabel(sigBox, textElements);
      
      if (nearbyLabel) {
        // Identify the role from the label text
        const role = this.identifyRole(nearbyLabel.text);
        
        // Find associated date
        const dateInfo = this.findAssociatedDate(sigBox, textElements);

        const signature: DetectedSignature = {
          role,
          fieldLabel: nearbyLabel.text.trim(),
          boundingBox: sigBox,
          associatedDate: dateInfo?.date,
          dateBoundingBox: dateInfo?.boundingBox,
          confidence: sigSource.confidence || 80,
          signatureType: sigSource.type === 'handwritten' ? 'handwritten' : 'stamp',
          hasDate: !!dateInfo?.date,
        };

        detectedSignatures.push(signature);
      }
    }

    return detectedSignatures;
  }

  private findNearestLabel(
    sigBox: BoundingBox,
    textElements: Array<{ text: string; boundingBox?: BoundingBox; confidence: number }>
  ): { text: string; boundingBox?: BoundingBox } | null {
    let nearest: { text: string; boundingBox?: BoundingBox; distance: number } | null = null;

    for (const element of textElements) {
      if (!element.boundingBox) continue;

      // Calculate distance between signature and text
      const distance = this.calculateDistance(sigBox, element.boundingBox);
      
      // Only consider text within reasonable proximity (200 pixels)
      if (distance > 200) continue;

      // Check if this text looks like a signature field label
      const isLabel = this.looksLikeSignatureLabel(element.text);
      if (!isLabel) continue;

      if (!nearest || distance < nearest.distance) {
        nearest = {
          text: element.text,
          boundingBox: element.boundingBox,
          distance,
        };
      }
    }

    return nearest;
  }

  private looksLikeSignatureLabel(text: string): boolean {
    // Check if text contains any role pattern
    for (const patterns of Object.values(this.rolePatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          return true;
        }
      }
    }
    return false;
  }

  private identifyRole(labelText: string): SignatureRole {
    for (const [role, patterns] of Object.entries(this.rolePatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(labelText)) {
          return role as SignatureRole;
        }
      }
    }
    return 'unknown';
  }

  private findAssociatedDate(
    sigBox: BoundingBox,
    textElements: Array<{ text: string; boundingBox?: BoundingBox }>
  ): { date: string; boundingBox?: BoundingBox } | null {
    for (const element of textElements) {
      if (!element.boundingBox) continue;

      // Look for dates near the signature (within 150 pixels)
      const distance = this.calculateDistance(sigBox, element.boundingBox);
      if (distance > 150) continue;

      // Check if text contains a date
      for (const datePattern of this.datePatterns) {
        const match = element.text.match(datePattern);
        if (match) {
          return {
            date: match[0],
            boundingBox: element.boundingBox,
          };
        }
      }
    }

    return null;
  }

  private calculateDistance(box1: BoundingBox, box2: BoundingBox): number {
    // Calculate Euclidean distance between centers of two bounding boxes
    const center1 = {
      x: box1.x + box1.width / 2,
      y: box1.y + box1.height / 2,
    };
    const center2 = {
      x: box2.x + box2.width / 2,
      y: box2.y + box2.height / 2,
    };

    return Math.sqrt(
      Math.pow(center1.x - center2.x, 2) + Math.pow(center1.y - center2.y, 2)
    );
  }

  private buildCanonicalCheckpoints(
    sortedSignatures: DetectedSignature[],
    checkboxes: CheckboxData[]
  ): { checkpoints: ApprovalCheckpoint[]; finalApprovalRole?: SignatureRole } {
    const checkpoints: ApprovalCheckpoint[] = [];
    const usedSignatures = new Set<number>();
    const usedCheckboxes = new Set<number>();
    
    // Build checkpoints for core required sequence
    for (const requiredRole of this.standardApprovalSequence) {
      // Find first unused signature matching this role
      let matchedSignature: DetectedSignature | undefined;
      let signatureIdx = -1;
      
      for (let i = 0; i < sortedSignatures.length; i++) {
        if (!usedSignatures.has(i) && sortedSignatures[i].role === requiredRole) {
          matchedSignature = sortedSignatures[i];
          signatureIdx = i;
          break;
        }
      }

      if (matchedSignature) {
        usedSignatures.add(signatureIdx);
        
        // Find nearby checkbox
        let associatedCheckbox: CheckboxData | undefined;
        let minDistance = Infinity;
        let selectedCheckboxIdx = -1;

        checkboxes.forEach((checkbox, idx) => {
          if (usedCheckboxes.has(idx) || !checkbox.boundingBox) return;

          const distance = this.calculateDistance(
            matchedSignature!.boundingBox,
            checkbox.boundingBox
          );

          if (distance < 100 && distance < minDistance) {
            associatedCheckbox = checkbox;
            minDistance = distance;
            selectedCheckboxIdx = idx;
          }
        });

        // Mark checkbox as used only after final selection
        if (selectedCheckboxIdx !== -1) {
          usedCheckboxes.add(selectedCheckboxIdx);
        }

        checkpoints.push({
          role: requiredRole,
          signature: matchedSignature,
          checkbox: associatedCheckbox,
          isComplete: matchedSignature.hasDate && (!associatedCheckbox || associatedCheckbox.state === 'checked'),
          isMissing: false,
          associatedText: matchedSignature.fieldLabel,
        });
      } else {
        // Missing required signature
        checkpoints.push({
          role: requiredRole,
          signature: undefined,
          checkbox: undefined,
          isComplete: false,
          isMissing: true,
          associatedText: `Missing ${requiredRole.replace(/_/g, ' ')}`,
        });
      }
    }

    // Find final approval role (first match from sorted signatures)
    let finalApprovalRole: SignatureRole | undefined;
    let finalSignature: DetectedSignature | undefined;
    let finalSignatureIdx = -1;

    for (let i = 0; i < sortedSignatures.length; i++) {
      if (!usedSignatures.has(i) && this.finalApprovalRoles.includes(sortedSignatures[i].role)) {
        finalSignature = sortedSignatures[i];
        finalApprovalRole = sortedSignatures[i].role;
        finalSignatureIdx = i;
        break;
      }
    }

    if (finalSignature) {
      usedSignatures.add(finalSignatureIdx);

      // Find nearby checkbox
      let associatedCheckbox: CheckboxData | undefined;
      let minDistance = Infinity;
      let selectedCheckboxIdx = -1;

      checkboxes.forEach((checkbox, idx) => {
        if (usedCheckboxes.has(idx) || !checkbox.boundingBox) return;

        const distance = this.calculateDistance(
          finalSignature!.boundingBox,
          checkbox.boundingBox
        );

        if (distance < 100 && distance < minDistance) {
          associatedCheckbox = checkbox;
          minDistance = distance;
          selectedCheckboxIdx = idx;
        }
      });

      // Mark checkbox as used only after final selection
      if (selectedCheckboxIdx !== -1) {
        usedCheckboxes.add(selectedCheckboxIdx);
      }

      checkpoints.push({
        role: finalApprovalRole,
        signature: finalSignature,
        checkbox: associatedCheckbox,
        isComplete: finalSignature.hasDate && (!associatedCheckbox || associatedCheckbox.state === 'checked'),
        isMissing: false,
        associatedText: finalSignature.fieldLabel,
      });
    } else {
      // Missing final approval
      checkpoints.push({
        role: 'verifier',
        signature: undefined,
        checkbox: undefined,
        isComplete: false,
        isMissing: true,
        associatedText: 'Missing final approval (verifier/manager/released by)',
      });
    }

    return { checkpoints, finalApprovalRole };
  }

  private validateCanonicalSequence(
    checkpoints: ApprovalCheckpoint[],
    sortedSignatures: DetectedSignature[]
  ): boolean {
    // Validate that signatures appear in the correct canonical order
    // Any signature appearing out of canonical sequence order = invalid
    
    const canonicalOrder = new Map<SignatureRole, number>();
    checkpoints.forEach((cp, idx) => {
      canonicalOrder.set(cp.role, idx);
    });

    let lastCanonicalIndex = -1;

    for (const signature of sortedSignatures) {
      const canonicalIdx = canonicalOrder.get(signature.role);
      
      if (canonicalIdx !== undefined) {
        if (canonicalIdx < lastCanonicalIndex) {
          return false; // Regression: earlier role appearing after later role
        }
        lastCanonicalIndex = canonicalIdx;
      }
    }

    return true;
  }
}
