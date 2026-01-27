# Batch Record Processing System

## Overview
This AI-powered system processes scanned batch record PDFs, automates page classification, detects quality issues, and organizes documents. It integrates Google Document AI for advanced OCR and OpenAI for classification, aiming to streamline pharmaceutical batch record management by ensuring compliance and data integrity. The system offers a professional UI for document upload, viewing, and issue tracking, with a vision to enhance efficiency and accuracy in regulated environments.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
The system is built on a React, Express, PostgreSQL, and TypeScript stack.

### UI/UX Decisions
- **Frontend**: Utilizes Vite, TanStack Query, shadcn/ui, and Tailwind CSS for a modern and responsive user experience.
- **Design**: Adheres to Material Design 3 guidelines, featuring a professional enterprise color palette, Inter font family, and meticulous attention to spacing and typography for clarity and usability.
- **Key UI Components**:
    - **Upload Page**: Supports drag-and-drop functionality for document ingestion.
    - **Document List View**: Displays documents with status tracking.
    - **Document Viewer**: Features a side-by-side view of original scans and extracted data, structured data display (tables, form fields, checkboxes, handwriting, signatures), page structure viewer, and an approval timeline.
    - **Alerts**: Quality issue alerts and classification badges are prominently displayed.

### Technical Implementations
- **Core Processing**:
    - **Google Document AI Form Parser**: Provides comprehensive OCR and document structure recognition.
    - **High-Accuracy Extraction Module**: Extracts tables, form fields, checkboxes, handwritten text, and signatures with precise positional data.
    - **Layout Analyzer**: Identifies page structures, groups elements spatially, and maps them to predefined fields, recognizing section types like `materials_log`, `equipment_log`, etc.
    - **Signature Analyzer**: Simplified presence/absence signature detection system that checks if signature fields contain any handwritten content. Key features:
      - **Table-based Detection**: Identifies signature columns by matching headers (Recorded By, Verified By, Sign & Date, IPQA S/D, etc.) and checks if cells have content
      - **On-the-fly Analysis**: Runs signature analysis during validation API calls using latest detection logic
      - **Abbreviation Table Exclusion**: Intelligently excludes abbreviation/glossary tables from signature detection by:
        - Detecting abbreviation-related keywords (abbreviation, definition, meaning)
        - Identifying merged abbreviation-definition patterns (e.g., "Ckd. By Checked By")
        - Checking table content structure (short abbreviation + long definition pattern)
        - Recognizing known abbreviation-definition pairs
      - **Output**: Returns signatureFields array with isSigned boolean for each field - only empty fields generate "Missing Signature" alerts
    - **Validation Engine**: A comprehensive system for pharmaceutical batch record compliance, including value extraction, formula detection with a library of calculations, SOP rules engine (JSON-configurable for thresholds, hold times, pH ranges), cross-page validation for consistency, and human-readable alerts.
    - **OpenAI-powered Classification**: Used for page classification, with a rule-based fallback mechanism.
    - **PDF Processing**: Extracts pages and generates high-resolution PNG images (scale: 2) for viewing.
    - **Secure Image Serving**: Implements hardened path validation to prevent directory traversal vulnerabilities.
    - **Raw Text Scanning**: Enhanced detection of batch/lot numbers from raw OCR text, handling typos, multi-line layouts, and generating alerts for missing values.
    - **Parallel Extraction with Reconciliation**: For batch/lot number validation, runs BOTH structured form field extraction AND raw text scanning in parallel. If both agree, high confidence. If they disagree, generates "Data Quality" reconciliation alert for human review. Results include sourceType ("structured" or "text-derived") and confidence level ("high", "medium", "low").
    - **Batch Date Bounds Extraction**: Extracts "Date & Time of Batch Commencement" and "Date & Time of Batch Completion" from the batch details page (typically page 2) using parallel extraction (structured + raw text) with reconciliation. These dates define the authoritative manufacturing window for the entire batch.
    - **Temporal Validation**: Dates extracted from pages 3+ are validated against the batch commencement/completion window. Pages 1-2 are excluded (page 1 contains document metadata that naturally predates manufacturing, page 2 contains the batch details section itself). Additionally, document metadata fields like "Effective Date", "Issue Date", "Revision Date", etc. are excluded on ALL pages since these naturally predate manufacturing. Alerts are generated for dates that fall outside this window with "sequence_error" category.
    - **Confidence Scoring for Batch Dates**: 
      - "high": Both sources (structured + text) found AND agree for BOTH commencement and completion
      - "medium": Only one source available, OR sources disagree
      - "low": No dates found at all
    - **Visual Analyzer (Data Integrity Detection)**: Computer vision-based detection of strike-offs, red ink corrections, overwrites, erasures, and other visual anomalies that impact GMP compliance. Uses sharp and canvas libraries for:
      - **Line Detection**: Identifies horizontal/diagonal strike-through lines crossing text regions
      - **Color Masking**: Detects red ink marks and annotations using HSV color space analysis
      - **Erasure Detection**: Identifies whitened areas or signs of correction fluid
      - **Text Region Intersection**: Maps visual anomalies to affected text by intersecting with OCR bounding boxes
      - **Thumbnail Generation**: Creates cropped thumbnails of detected anomalies for visual review
      - Anomalies are stored in page metadata and converted to "data_integrity" category ValidationAlerts
    - **Metadata Storage**: Rich extraction and layout data are stored in PostgreSQL using JSONB fields. Batch date bounds are stored at document level.

### System Design Choices
- **Backend**: Implemented with Express, integrating Drizzle ORM for database interactions.
- **Database**: PostgreSQL is used for all persistent storage of document processing history, including document metadata, page data, and quality issues.
- **Modularity**: Services are clearly separated (Document AI, classifier, PDF processor, layout analyzer, signature analyzer) for maintainability and scalability.
- **Error Handling**: Comprehensive error handling and graceful fallbacks are integrated throughout the pipeline, particularly for compliance validation.

## External Dependencies
- **Google Cloud Platform**:
    - **Google Document AI**: For advanced document parsing and data extraction.
    - Google Cloud Project ID and Location are required.
- **OpenAI**: For AI-powered page classification.
- **PostgreSQL**: Primary database for all application data and historical records.
- **pdf-to-img**: Library used for converting PDF pages to images.