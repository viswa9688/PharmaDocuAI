# Design Guidelines: Batch Record Processing System

## Design Approach

**Design System Foundation**: Material Design 3 with enterprise-focused customization
- Rationale: Information-dense application requiring robust data visualization, clear hierarchy, and proven patterns for document processing workflows
- Reference Inspiration: Linear's clean data presentation + Notion's document organization + Asana's status tracking patterns

## Core Design Principles

1. **Clarity Over Decoration**: Every element serves a functional purpose - no ornamental design
2. **Data Density with Breathing Room**: Pack information efficiently while maintaining scanability
3. **Trustworthy & Professional**: Enterprise-grade polish suitable for pharmaceutical/manufacturing environments
4. **Progressive Disclosure**: Show critical info upfront, details on demand

## Typography

**Font Family**: Inter (via Google Fonts CDN)
- Primary: Inter (400, 500, 600, 700 weights)
- Monospace: 'Roboto Mono' for page numbers, IDs, technical data

**Type Scale**:
- Page Titles: text-2xl font-semibold (24px)
- Section Headers: text-lg font-medium (18px)
- Body Text: text-base (16px)
- Labels/Meta: text-sm (14px)
- Captions/Counts: text-xs (12px)
- Data Tables: text-sm with tight leading

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, 8, 12, 16
- Component padding: p-4, p-6, p-8
- Section gaps: gap-6, gap-8
- Margins: m-4, m-6, m-8
- Tight spacing for data: space-y-2, space-y-4

**Grid Structure**:
- Main layout: Sidebar (260px fixed) + Main content area (fluid)
- Document viewer: 70% viewer + 30% metadata panel
- Dashboard cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-4 for metrics

**Container Strategy**:
- Max-width: max-w-7xl for main content zones
- Full-width for document viewer and data tables
- Constrained width (max-w-3xl) for forms and settings

## Component Library

### Navigation
- **Left Sidebar**: Fixed, persistent navigation with Upload, Processing Queue, Document Library, Settings sections
- **Top Bar**: Breadcrumb trail, document name, action buttons (Export, Share)
- **Status Indicator**: Global processing status in top-right corner

### Data Display

**Document Viewer**:
- PDF page thumbnails in scrollable grid (grid-cols-4 md:grid-cols-6)
- Active page: large preview with zoom controls
- Page classification badge overlay on each thumbnail
- Confidence score indicator (progress ring or percentage)

**Classification Results**:
- Pill badges for page types (Materials Log, Equipment Log, CIP/SIP, etc.)
- Confidence meter: horizontal bar with percentage
- Issue flags: Warning/error icons for duplicates, missing, out-of-order pages

**Data Tables**:
- Striped rows for alternating backgrounds
- Sticky headers on scroll
- Sortable columns with arrow indicators
- Row selection with checkboxes for batch actions
- Inline status badges and action menus

**Metric Cards**:
- Large number display (text-3xl font-bold)
- Label underneath (text-sm)
- Icon in top-right corner
- Trend indicator (up/down arrow with percentage) where applicable

### Forms & Inputs

**Upload Zone**:
- Large drag-and-drop area with dashed border
- File icon and "Drop PDFs here or click to browse" text
- File list below with name, size, remove button
- Upload progress bars during processing

**Filters & Controls**:
- Multi-select dropdowns for page type filtering
- Date range picker for batch record dates
- Search input with magnifying glass icon
- Toggle switches for "Show only issues" / "Hide processed"

### Overlays & Modals

**Processing Modal**:
- Progress indicator (circular or linear)
- Current step text ("Extracting pages..." / "Classifying pages...")
- Page count progress (e.g., "Processing page 47 of 234")
- Cancel button

**Detail Panel** (Slide-out drawer):
- Full page metadata
- Classification confidence breakdown
- OCR text preview
- Quality control issues list
- Manual override controls

### Status & Feedback

**Processing States**:
- Queued: neutral badge with clock icon
- Processing: animated spinner with blue badge
- Complete: checkmark with green badge
- Error: alert icon with red badge

**Quality Control Alerts**:
- Missing pages: amber warning card with list of gaps
- Duplicates: yellow alert with side-by-side comparison link
- Out-of-order: orange notice with suggested reordering
- Corrupted: red error with "Unable to process" message

**Toast Notifications**:
- Success: green with checkmark (top-right)
- Error: red with X icon (top-right)
- Info: blue with info icon (top-right)
- Auto-dismiss after 5s (except errors)

## Animations

**Minimal, Purposeful Only**:
- Skeleton loaders during initial data fetch
- Smooth page transitions (150ms ease)
- Badge pulse for new notifications
- No scroll animations, parallax, or decorative effects

## Icons

**Library**: Material Icons (via CDN)
- Upload: cloud_upload
- Document: description
- Processing: sync, hourglass_empty
- Success: check_circle
- Warning: warning, error_outline
- Navigation: menu, close, arrow_forward

## Images

**No hero images** - This is a utility application, not a marketing site.

**Functional Images Only**:
- PDF page thumbnails (generated from uploaded documents)
- Empty state illustrations (simple line art for "No documents uploaded yet")
- Logo/branding in sidebar header (small, 40x40px)

**Empty States**:
- Upload page: Simple upload icon with "Get started by uploading your first batch record"
- No results: Search icon with "No matching pages found"
- All clean: Success icon with "All pages validated successfully"

## Accessibility

- ARIA labels on all interactive elements
- Keyboard navigation throughout (tab order, escape to close)
- Focus indicators on all inputs and buttons
- Sufficient contrast ratios (WCAG AA minimum)
- Screen reader announcements for processing status changes