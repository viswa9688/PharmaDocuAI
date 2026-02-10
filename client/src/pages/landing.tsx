import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileCheck,
  Scale,
  Calendar,
  LayoutDashboard,
  History,
  CheckCircle,
  ShieldCheck,
  ArrowRight,
  Scan,
  FileText,
  Zap,
  Lock,
  BarChart3,
  Eye,
} from "lucide-react";

const features = [
  {
    title: "BMR Verification",
    description:
      "Validates Batch Manufacturing Records against Master Product Cards. Automatically detects discrepancies with visual error highlighting using colored bounding boxes on document pages.",
    icon: FileCheck,
    href: "/bmr-verification",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-500/10",
    testId: "card-feature-bmr",
  },
  {
    title: "Raw Material Verification",
    description:
      "Validates actual quantities of raw materials against approved limits. Ensures ingredient specifications meet regulatory requirements for pharmaceutical manufacturing.",
    icon: Scale,
    href: "/raw-material",
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    iconBg: "bg-purple-500/10",
    testId: "card-feature-raw-material",
  },
  {
    title: "Batch Allocation Verification",
    description:
      "Validates Manufacturing and Expiry dates, calculates shelf life, and verifies compliance status. Extracts batch numbers, MPC/BMR references, and QA officer details.",
    icon: Calendar,
    href: "/batch-allocation",
    color: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    iconBg: "bg-teal-500/10",
    testId: "card-feature-batch-allocation",
  },
  {
    title: "Compliance Dashboard",
    description:
      "Comprehensive overview of validation statistics across all document types. Tracks signatures, data integrity, calculations, date sequences, and batch number compliance.",
    icon: LayoutDashboard,
    href: "/dashboard",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/10",
    testId: "card-feature-dashboard",
  },
  {
    title: "Document Approvals",
    description:
      "Unified approval workflow for all verification types. Manage pending and approved documents with full traceability of who approved and when.",
    icon: CheckCircle,
    href: "/approved",
    color: "bg-green-500/10 text-green-600 dark:text-green-400",
    iconBg: "bg-green-500/10",
    testId: "card-feature-approvals",
  },
  {
    title: "Audit Trail",
    description:
      "Complete history of every document processing event. Filter by status and event type for full compliance tracking and regulatory reporting.",
    icon: History,
    href: "/audit-trail",
    color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    iconBg: "bg-rose-500/10",
    testId: "card-feature-audit-trail",
  },
];

const capabilities = [
  {
    icon: Scan,
    title: "AI-Powered OCR",
    description: "Google Document AI extracts text, tables, forms, and signatures with high accuracy",
  },
  {
    icon: Eye,
    title: "Visual Error Detection",
    description: "Colored bounding boxes highlight exact error locations on document pages",
  },
  {
    icon: Zap,
    title: "Automated Classification",
    description: "Intelligent page classification identifies document types automatically",
  },
  {
    icon: Lock,
    title: "GMP Compliance",
    description: "Built for pharmaceutical regulations with complete audit trail support",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    description: "Live dashboard with validation statistics and compliance metrics",
  },
  {
    icon: ShieldCheck,
    title: "Data Integrity",
    description: "Detects strike-offs, red ink corrections, overwrites, and erasures",
  },
];

export default function LandingPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-12">
      <section className="text-center space-y-4 pt-8" data-testid="section-hero">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-sm font-medium mb-2" data-testid="badge-pharma">
          <ShieldCheck className="w-4 h-4" />
          Pharmaceutical Document Processing
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl" data-testid="text-hero-title">
          Batch Record
          <span className="text-blue-600 dark:text-blue-400"> Processing System</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          AI-powered platform for processing scanned batch record PDFs. Automate page
          classification, detect quality issues, and ensure compliance with
          pharmaceutical manufacturing standards.
        </p>
        <div className="flex items-center justify-center gap-3 pt-4 flex-wrap">
          <Link href="/upload">
            <Button size="lg" data-testid="button-get-started">
              <FileText className="w-4 h-4 mr-2" />
              Upload Documents
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button size="lg" variant="outline" data-testid="button-view-dashboard">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              View Dashboard
            </Button>
          </Link>
        </div>
      </section>

      <section className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">Core Capabilities</h2>
          <p className="text-muted-foreground">
            Built with advanced AI to handle every aspect of batch record management
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {capabilities.map((cap) => (
            <Card key={cap.title} className="hover-elevate" data-testid={`card-capability-${cap.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="rounded-md bg-blue-500/10 p-2 shrink-0">
                  <cap.icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-medium text-sm text-foreground">{cap.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {cap.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">Features</h2>
          <p className="text-muted-foreground">
            Everything you need for pharmaceutical document verification and compliance
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature) => (
            <Link key={feature.title} href={feature.href} data-testid={`link-${feature.testId}`}>
              <Card className="h-full hover-elevate cursor-pointer group" data-testid={feature.testId}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-md p-2 ${feature.iconBg}`}>
                      <feature.icon className={`w-5 h-5 ${feature.color.split(" ").slice(1).join(" ")}`} />
                    </div>
                    <h3 className="font-semibold text-foreground" data-testid={`text-title-${feature.testId}`}>{feature.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-desc-${feature.testId}`}>
                    {feature.description}
                  </p>
                  <div className="flex items-center text-sm font-medium gap-1 pt-1 text-foreground">
                    Open
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section data-testid="section-cta">
        <Card className="overflow-hidden">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-2 text-center sm:text-left">
                <h3 className="text-xl font-semibold text-foreground" data-testid="text-cta-title">Ready to get started?</h3>
                <p className="text-muted-foreground text-sm" data-testid="text-cta-desc">
                  Upload your first batch record PDF and see the AI-powered analysis in action.
                </p>
              </div>
              <Link href="/upload" data-testid="link-cta-start">
                <Button size="lg" data-testid="button-start-now">
                  Start Now
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
