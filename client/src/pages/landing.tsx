import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Shield, CheckCircle, ClipboardCheck, LogIn } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">BatchRecord AI</span>
          </div>
          <Button onClick={() => window.location.href = "/api/login"} data-testid="button-login-hero">
            <LogIn className="mr-2 h-4 w-4" />
            Sign In
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-20 px-4">
          <div className="container mx-auto text-center max-w-4xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              AI-Powered Pharmaceutical Batch Record Processing
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Automate document processing, validate GMP compliance, and detect data integrity issues 
              with advanced AI and computer vision technology.
            </p>
            <Button 
              size="lg" 
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-get-started"
            >
              Get Started
            </Button>
          </div>
        </section>

        <section className="py-16 px-4 bg-muted/50">
          <div className="container mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Key Features</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader>
                  <FileText className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>Document AI</CardTitle>
                  <CardDescription>
                    Extract data from scanned batch records with Google Document AI
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <Shield className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>GMP Validation</CardTitle>
                  <CardDescription>
                    Automatic compliance checking against pharmaceutical regulations
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <CheckCircle className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>Data Integrity</CardTitle>
                  <CardDescription>
                    Computer vision detection of corrections, strike-offs, and anomalies
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <ClipboardCheck className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>Audit Trail</CardTitle>
                  <CardDescription>
                    Complete processing history with user attribution for compliance
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 px-4">
        <div className="container mx-auto text-center text-muted-foreground">
          <p>BatchRecord AI - Pharmaceutical Document Processing System</p>
        </div>
      </footer>
    </div>
  );
}
