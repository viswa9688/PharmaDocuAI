# Batch Record Processing System

## Overview
AI-powered system to process scanned batch record PDFs, automatically classify pages, detect quality issues, and organize documents. Built with Google Document AI integration and OpenAI-powered classification.

## Current State
**Status**: MVP implementation complete, ready for credentials and testing

### Completed Features
1. **Complete Database Schema** - PostgreSQL with documents, pages, and qualityIssues tables
2. **Frontend UI** - Professional Material Design 3 interface with:
   - Upload page with drag-and-drop
   - Document list view with status tracking
   - Document viewer with page grid and detail panel
   - Quality issue alerts and classification badges
   - Sidebar navigation
3. **Backend Services**:
   - Google Document AI integration for OCR
   - OpenAI-powered page classification with rule-based fallback
   - PDF processing with page extraction
   - Complete REST API for upload, processing, retrieval, export
4. **Database Layer** - Full PostgreSQL integration with Drizzle ORM

### Architecture
- **Stack**: React + Express + PostgreSQL + TypeScript
- **Frontend**: Vite, TanStack Query, shadcn/ui, Tailwind CSS
- **Backend**: Express, Drizzle ORM, Google Document AI, OpenAI
- **Storage**: PostgreSQL for all document processing history

## Required Credentials (Not Yet Provided)
The application requires these environment variables:
- `GOOGLE_CLOUD_PROJECT_ID` - GCP project ID
- `GOOGLE_CLOUD_LOCATION` - GCP region (e.g., us-east1)
- `GOOGLE_DOCUMENT_AI_PROCESSOR_ID` - Document AI processor ID
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` - GCP service account credentials (JSON)
- `OPENAI_API_KEY` - OpenAI API key for classification

Without these credentials:
- Document AI OCR falls back to stub processing
- Classification uses rule-based fallback instead of AI

## Recent Changes
**November 21, 2025**:
- Fixed all TypeScript type safety issues in storage layers
- Implemented complete processDocument pipeline
- Resolved LSP diagnostics
- All components properly wired with data-testid attributes
- Database schema and storage layer fully functional

## Project Structure
```
client/
  src/
    components/     # Reusable UI components
    pages/          # Route pages (upload, documents, viewer)
    lib/            # Query client and utilities
server/
  services/         # Document AI, classifier, PDF processor
  routes.ts         # API endpoints
  db-storage.ts     # PostgreSQL storage layer
  storage.ts        # In-memory fallback storage
shared/
  schema.ts         # Drizzle schema and types
```

## Next Steps
1. User provides API credentials
2. Test complete document processing workflow
3. Implement batch processing queue
4. Add custom page type training
5. Implement advanced field extraction
6. Build document comparison features

## Design Guidelines
Following Material Design 3 with Inter font family, professional enterprise color palette, proper spacing and typography from design_guidelines.md.
