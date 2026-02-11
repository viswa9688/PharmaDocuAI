# Batch Record Processing System

## Overview
This AI-powered system automates the processing of scanned batch record PDFs, classifying pages, detecting quality issues, and organizing documents. It leverages Google Document AI for advanced OCR and OpenAI for classification. The primary goal is to enhance efficiency, accuracy, and compliance in pharmaceutical batch record management through a professional user interface for document upload, viewing, and issue tracking. The system aims to streamline operations in regulated environments.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
The system is built on a React, Express, PostgreSQL, and TypeScript stack.

### UI/UX Decisions
The frontend utilizes Vite, TanStack Query, shadcn/ui, and Tailwind CSS, adhering to Material Design 3 guidelines with a professional enterprise color palette and Inter font. Key UI components include a drag-and-drop upload page, a document list view with status tracking, and a document viewer offering side-by-side display of original scans and extracted data, structured data (tables, forms, checkboxes, handwriting, signatures), page structure, and an approval timeline. Quality issue alerts and classification badges are prominently displayed.

### Technical Implementations
The core processing involves Google Document AI for OCR and structure recognition, a high-accuracy extraction module for various data types, and a layout analyzer to identify page structures. A simplified signature analyzer detects signature presence in table fields, intelligently excluding abbreviation tables. The validation engine enforces pharmaceutical batch record compliance through value extraction, formula detection, a JSON-configurable SOP rules engine, and cross-page consistency checks. OpenAI-powered classification (with rule-based fallback) categorizes pages. PDF processing extracts pages and generates high-resolution PNGs for viewing, with secure image serving. Enhanced raw text scanning and parallel extraction with reconciliation are used for batch/lot number and batch date bounds detection, generating alerts for discrepancies or missing values. Temporal validation checks dates against batch commencement/completion, excluding specific document types. A visual analyzer uses computer vision to detect GMP compliance issues like strike-offs, red ink corrections, overwrites, and erasures, generating cropped thumbnails of anomalies. All rich extraction and layout data, including batch date bounds, are stored in PostgreSQL using JSONB fields.

### System Design Choices
The backend uses Express with Drizzle ORM. PostgreSQL serves as the primary database for all persistent storage. The architecture promotes modularity with separated services (Document AI, classifier, PDF processor, layout analyzer, signature analyzer) and incorporates comprehensive error handling.

### Features
- **BMR Verification**: Validates Batch Manufacturing Records against Master Product Cards by extracting and comparing fields, flagging discrepancies (Critical, Major, Minor), and providing visual error highlighting with bounding box overlays.
- **Batch Allocation Verification**: Extracts manufacturing/expiry dates and batch details from Batch Allocation Log documents, calculates shelf life, and verifies compliance status.
- **Dashboard**: Provides a comprehensive compliance overview with validation statistics, document metrics, and categorized alert breakdowns, with an auto-refreshing UI.
- **Audit Trail**: Tracks a complete history of document processing events, including user actions, timestamps, and metadata, for compliance.
- **Document Approval Workflow (Unified)**: Offers unified approval/disapproval functionality for various document types (batch_record, raw_material, batch_allocation, bmr_verification) with user tracking and integration with the audit trail.
- **QA Review Checklist**: Maps 12 pharmaceutical QA checkpoints against automated validation results, providing pass/fail/N/A status for each, with click-through navigation to relevant validation tabs. Point 12 verifies user-declared batch details against extracted data.
- **User-Declared Batch Details Verification**: A modal prompt at upload time collects Product Name, Start Date, End Date, Batch No., Manufacturing Date, and Expiry Date. These are compared against extracted BMR data after processing, generating consistency alerts for mismatches. Results feed into QA checklist Point 12 with dedicated click-through filtering.
- **Issue Resolution**: Tracks and resolves validation issues with an approve/reject workflow, including comments and resolution timestamps.
- **User Management**: Integrates with Replit Auth (OIDC) for user authentication and stores user profiles in a `users` table. Includes role-based access control (RBAC) with four roles: admin, reviewer, operator, and viewer. The first user to sign in automatically becomes admin. Admin users can manage roles via the User Management page. Protected routes enforce role requirements both client-side (RouteGuard component) and server-side (isAuthenticated middleware + role checks). Login/logout buttons and user profile display are shown in the sidebar footer.

### Test Mode (TEMPORARY — to be removed)
When uploading a document with Product Name set to "1", the system bypasses all processing and generates a fully passing result: all 12 QA checklist items pass, zero alerts, zero quality issues, zero validation errors. Any other Product Name triggers normal processing.

## External Dependencies
- **Google Cloud Platform**:
    - **Google Document AI**: For advanced document parsing and data extraction.
- **OpenAI**: For AI-powered page classification.
- **PostgreSQL**: Primary database.
- **pdf-to-img**: Library for converting PDF pages to images.