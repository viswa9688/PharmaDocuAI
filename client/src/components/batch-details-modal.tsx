import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardCheck } from "lucide-react";
import type { UserDeclaredFields } from "@shared/schema";

interface BatchDetailsModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (fields: UserDeclaredFields) => void;
  onSkip: () => void;
}

export function BatchDetailsModal({ open, onClose, onSubmit, onSkip }: BatchDetailsModalProps) {
  const [productName, setProductName] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [manufacturingDate, setManufacturingDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const handleSubmit = () => {
    const fields: UserDeclaredFields = {
      productName: productName.trim() || null,
      batchNo: batchNo.trim() || null,
      startDate: startDate || null,
      endDate: endDate || null,
      manufacturingDate: manufacturingDate || null,
      expiryDate: expiryDate || null,
    };

    const hasAnyValue = Object.values(fields).some(v => v !== null);
    if (!hasAnyValue) {
      onSkip();
      return;
    }

    onSubmit(fields);
  };

  const handleSkip = () => {
    onSkip();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Batch Details Verification
          </DialogTitle>
          <DialogDescription>
            Enter the expected batch details below. These will be compared against the values extracted from the document to verify accuracy.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="product-name">Product Name</Label>
            <Input
              id="product-name"
              placeholder="e.g. Drug XYZ 50 mg Tablets"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              data-testid="input-product-name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="batch-no">Batch Number</Label>
            <Input
              id="batch-no"
              placeholder="e.g. DXYZ-2024-015"
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
              data-testid="input-batch-no"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="mfg-date">Manufacturing Date</Label>
              <Input
                id="mfg-date"
                type="date"
                value={manufacturingDate}
                onChange={(e) => setManufacturingDate(e.target.value)}
                data-testid="input-mfg-date"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="exp-date">Expiry Date</Label>
              <Input
                id="exp-date"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                data-testid="input-exp-date"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleSkip} data-testid="button-skip-batch-details">
            Skip
          </Button>
          <Button onClick={handleSubmit} data-testid="button-submit-batch-details">
            Verify & Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
