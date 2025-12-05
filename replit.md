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
    - **Signature Analyzer**: Detects signatures, tracks approval chains against a canonical checkpoint template, validates compliance, and links signatures to dates and checkboxes. It supports table-based signature detection and handles various signature roles.
    - **Validation Engine**: A comprehensive system for pharmaceutical batch record compliance, including value extraction, formula detection with a library of calculations, SOP rules engine (JSON-configurable for thresholds, hold times, pH ranges), cross-page validation for consistency, and human-readable alerts.
    - **OpenAI-powered Classification**: Used for page classification, with a rule-based fallback mechanism.
    - **PDF Processing**: Extracts pages and generates high-resolution PNG images (scale: 2) for viewing.
    - **Secure Image Serving**: Implements hardened path validation to prevent directory traversal vulnerabilities.
    - **Raw Text Scanning**: Enhanced detection of batch/lot numbers from raw OCR text, handling typos, multi-line layouts, and generating alerts for missing values.
    - **Metadata Storage**: Rich extraction and layout data are stored in PostgreSQL using JSONB fields.

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